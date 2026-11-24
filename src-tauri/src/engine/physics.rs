use crate::config::{EasingCurve, ScrollProfile};
use crossbeam_channel::Receiver;
use parking_lot::RwLock;
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::Threading::{
    CreateWaitableTimerExW, SetWaitableTimer, WaitForSingleObject,
    CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, TIMER_ALL_ACCESS,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_HWHEEL,
    MOUSEEVENTF_WHEEL, MOUSEINPUT, VK_CONTROL, VK_MENU,
};

pub const CHARISMA_MAGIC_TAG: usize = 0x4348_5253;
const MAX_ACTIVE_PULSES: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ScrollAxis {
    Vertical,
    Horizontal,
}

#[derive(Debug, Clone)]
pub enum EngineCommand {
    Impulse {
        raw_delta: i32,
        axis: ScrollAxis,
        profile: ScrollProfile,
        monitor_hz: u32,
        exe_name: String,
    },
    CancelAll,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrollTelemetry {
    pub progress: f64,
    pub velocity_px_per_sec: f64,
    pub axis: ScrollAxis,
    pub monitor_hz: u32,
    pub active_exe: String,
}

#[derive(Debug, Clone)]
pub struct ScrollPulse {
    pub total_units: f64,
    pub exported_units: f64,
    pub start_sec: f64,
    pub duration_sec: f64,
    pub easing: EasingCurve,
}

#[derive(Debug, Default)]
struct AxisState {
    pulses: VecDeque<ScrollPulse>,
    remainder: f64,
    last_impulse_sec: Option<f64>,
    accel_factor: f64,
}

impl AxisState {
    fn clear(&mut self) {
        self.pulses.clear();
        self.remainder = 0.0;
        self.accel_factor = 1.0;
    }

    fn push_impulse(&mut self, raw_delta: i32, profile: &ScrollProfile, now_sec: f64, reverse: bool) {
        if raw_delta == 0 {
            return;
        }
        let dir = if reverse { -1.0 } else { 1.0 };
        let base_units = (raw_delta as f64 / 120.0) * (profile.step_size_px as f64 * 1.2) * dir;

        if let Some(prev_sec) = self.last_impulse_sec {
            let dt = (now_sec - prev_sec).max(0.0);
            let threshold = (profile.acceleration_delta_ms as f64) / 1000.0;
            if dt <= threshold {
                self.accel_factor = (self.accel_factor * 1.28).min(profile.acceleration_max);
            } else {
                self.accel_factor = (1.0 + (self.accel_factor - 1.0) * 0.35).max(1.0);
            }
        } else {
            self.accel_factor = 1.0;
        }
        self.last_impulse_sec = Some(now_sec);

        if profile.stop_on_reverse {
            let active_sum: f64 = self
                .pulses
                .iter()
                .map(|p| p.total_units - p.exported_units)
                .sum();
            if active_sum * base_units < 0.0 {
                self.pulses.clear();
                self.remainder = 0.0;
                self.accel_factor = 1.0;
            }
        }

        if self.pulses.len() >= MAX_ACTIVE_PULSES {
            self.pulses.pop_front();
        }

        self.pulses.push_back(ScrollPulse {
            total_units: base_units * self.accel_factor,
            exported_units: 0.0,
            start_sec: now_sec,
            duration_sec: (profile.animation_time_ms as f64) / 1000.0,
            easing: profile.easing,
        });
    }

    fn step(&mut self, now_sec: f64, dt_sec: f64) -> (i32, f64, f64) {
        if self.pulses.is_empty() {
            return (0, 0.0, 0.0);
        }

        let mut delta_units = 0.0;
        let mut max_progress = 0.0_f64;

        for pulse in &mut self.pulses {
            let elapsed = (now_sec - pulse.start_sec).max(0.0);
            let p = if pulse.duration_sec <= 0.001 {
                1.0
            } else {
                (elapsed / pulse.duration_sec).clamp(0.0, 1.0)
            };
            if p > max_progress && p < 1.0 {
                max_progress = p;
            }
            let target = pulse.total_units * pulse.easing.evaluate(p);
            let diff = target - pulse.exported_units;
            pulse.exported_units += diff;
            delta_units += diff;
        }

        self.pulses.retain(|pulse| {
            let elapsed = now_sec - pulse.start_sec;
            elapsed < pulse.duration_sec
        });

        let exact = delta_units + self.remainder;
        let send_units = exact.round() as i32;
        self.remainder = exact - (send_units as f64);

        // If all pulses finished, flush any final sub-unit >= 0.5 or reset tiny noise
        if self.pulses.is_empty() && self.remainder.abs() < 0.5 {
            self.remainder = 0.0;
        }

        let velocity_px = if dt_sec > 0.0 {
            (delta_units.abs() / 1.2) / dt_sec
        } else {
            0.0
        };

        if self.pulses.is_empty() {
            max_progress = 1.0;
        }

        (send_units, max_progress, velocity_px)
    }
}

/// Pure deterministic smooth-scroll accumulator suitable for unit testing without Win32 APIs.
#[derive(Debug, Default)]
pub struct PulseAccumulator {
    y: AxisState,
    x: AxisState,
}

impl PulseAccumulator {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn is_idle(&self) -> bool {
        self.y.pulses.is_empty() && self.x.pulses.is_empty()
    }

    pub fn cancel_all(&mut self) {
        self.y.clear();
        self.x.clear();
    }

    pub fn push_impulse(
        &mut self,
        raw_delta: i32,
        axis: ScrollAxis,
        profile: &ScrollProfile,
        now_sec: f64,
    ) {
        match axis {
            ScrollAxis::Vertical => {
                self.y
                    .push_impulse(raw_delta, profile, now_sec, profile.reverse_vertical);
            }
            ScrollAxis::Horizontal => {
                // In Windows, Shift+Wheel sends positive up (120) which users expect to scroll left (-120)
                // unless reversed; raw WM_MOUSEHWHEEL already has right (+120) / left (-120).
                self.x
                    .push_impulse(raw_delta, profile, now_sec, profile.reverse_horizontal);
            }
        }
    }

    pub fn step(&mut self, now_sec: f64, dt_sec: f64) -> (i32, i32, f64, f64, ScrollAxis) {
        let (sy, py, vy) = self.y.step(now_sec, dt_sec);
        let (sx, px, vx) = self.x.step(now_sec, dt_sec);
        if vx > vy {
            (sy, sx, px, vx, ScrollAxis::Horizontal)
        } else {
            (sy, sx, py, vy, ScrollAxis::Vertical)
        }
    }
}

fn is_vk_down(vk: u16) -> bool {
    unsafe { (GetAsyncKeyState(vk as i32) as u16 & 0x8000) != 0 }
}

fn send_wheel_input(send_y: i32, send_x: i32) {
    let mut inputs = [INPUT::default(); 2];
    let mut count = 0usize;

    if send_y != 0 {
        inputs[count] = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: send_y as u32,
                    dwFlags: MOUSEEVENTF_WHEEL,
                    time: 0,
                    dwExtraInfo: CHARISMA_MAGIC_TAG,
                },
            },
        };
        count += 1;
    }

    if send_x != 0 {
        inputs[count] = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: send_x as u32,
                    dwFlags: MOUSEEVENTF_HWHEEL,
                    time: 0,
                    dwExtraInfo: CHARISMA_MAGIC_TAG,
                },
            },
        };
        count += 1;
    }

    if count > 0 {
        unsafe {
            SendInput(&inputs[..count], std::mem::size_of::<INPUT>() as i32);
        }
    }
}

struct HighResTimer(HANDLE);

impl HighResTimer {
    fn new() -> Option<Self> {
        unsafe {
            let handle = CreateWaitableTimerExW(
                None,
                None,
                CREATE_WAITABLE_TIMER_HIGH_RESOLUTION,
                TIMER_ALL_ACCESS.0,
            )
            .ok()?;
            if handle.is_invalid() {
                return None;
            }
            Some(Self(handle))
        }
    }

    fn wait_micros(&self, micros: i64) {
        if micros <= 0 {
            return;
        }
        let due_time: i64 = -(micros * 10);
        unsafe {
            if SetWaitableTimer(self.0, &due_time, 0, None, None, false).is_ok() {
                WaitForSingleObject(self.0, 100);
            } else {
                std::thread::sleep(Duration::from_micros(micros as u64));
            }
        }
    }
}

impl Drop for HighResTimer {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}

pub fn spawn_animator_thread<F>(
    rx: Receiver<EngineCommand>,
    passthrough_ctrl_alt: Arc<AtomicBool>,
    target_fps: Arc<std::sync::atomic::AtomicU32>,
    telemetry_active: Arc<AtomicBool>,
    emit_telemetry: F,
) where
    F: Fn(ScrollTelemetry) + Send + 'static,
{
    std::thread::Builder::new()
        .name("charisma-physics".to_string())
        .spawn(move || {
            let origin = Instant::now();
            let mut acc = PulseAccumulator::new();
            let timer = HighResTimer::new();
            let mut current_hz: u32 = 60;
            let active_exe = Arc::new(RwLock::new(String::new()));
            let mut last_step_sec = origin.elapsed().as_secs_f64();
            let mut last_telemetry_sec = 0.0_f64;

            loop {
                if acc.is_idle() {
                    match rx.recv() {
                        Ok(EngineCommand::Impulse {
                            raw_delta,
                            axis,
                            profile,
                            monitor_hz,
                            exe_name,
                        }) => {
                            let now_sec = origin.elapsed().as_secs_f64();
                            last_step_sec = now_sec;
                            current_hz = resolve_hz(monitor_hz, target_fps.load(Ordering::Relaxed));
                            *active_exe.write() = exe_name;
                            acc.push_impulse(raw_delta, axis, &profile, now_sec);
                        }
                        Ok(EngineCommand::CancelAll) => {
                            acc.cancel_all();
                        }
                        Err(_) => break,
                    }
                }

                // Drain any pending commands without blocking
                while let Ok(cmd) = rx.try_recv() {
                    match cmd {
                        EngineCommand::Impulse {
                            raw_delta,
                            axis,
                            profile,
                            monitor_hz,
                            exe_name,
                        } => {
                            let now_sec = origin.elapsed().as_secs_f64();
                            current_hz = resolve_hz(monitor_hz, target_fps.load(Ordering::Relaxed));
                            *active_exe.write() = exe_name;
                            acc.push_impulse(raw_delta, axis, &profile, now_sec);
                        }
                        EngineCommand::CancelAll => {
                            acc.cancel_all();
                        }
                    }
                }

                if acc.is_idle() {
                    continue;
                }

                // Mid-glide Ctrl/Alt safety: immediately cancel momentum before SendInput
                if passthrough_ctrl_alt.load(Ordering::Relaxed)
                    && (is_vk_down(VK_CONTROL.0) || is_vk_down(VK_MENU.0))
                {
                    acc.cancel_all();
                    continue;
                }

                let now_sec = origin.elapsed().as_secs_f64();
                let dt_sec = (now_sec - last_step_sec).max(0.001);
                last_step_sec = now_sec;

                let (send_y, send_x, progress, velocity_px, axis) = acc.step(now_sec, dt_sec);
                if send_y != 0 || send_x != 0 {
                    send_wheel_input(send_y, send_x);
                }

                if telemetry_active.load(Ordering::Relaxed)
                    && (now_sec - last_telemetry_sec >= 0.032 || acc.is_idle())
                {
                    last_telemetry_sec = now_sec;
                    let exe = active_exe.read().clone();
                    emit_telemetry(ScrollTelemetry {
                        progress,
                        velocity_px_per_sec: velocity_px,
                        axis,
                        monitor_hz: current_hz,
                        active_exe: exe,
                    });
                }

                if !acc.is_idle() {
                    let frame_us = (1_000_000_i64 / (current_hz.clamp(60, 360) as i64)).max(2700);
                    if let Some(ref t) = timer {
                        t.wait_micros(frame_us);
                    } else {
                        std::thread::sleep(Duration::from_micros(frame_us as u64));
                    }
                }
            }
        })
        .expect("Failed to spawn charisma physics thread");
}

fn resolve_hz(monitor_hz: u32, target_fps: u32) -> u32 {
    if target_fps >= 60 {
        target_fps.clamp(60, 360)
    } else {
        monitor_hz.clamp(60, 360)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn easing_curves_are_bounded_and_monotonic() {
        let curves = [
            EasingCurve::OutExpo,
            EasingCurve::OutQuint,
            EasingCurve::OutCubic,
            EasingCurve::OutQuart,
            EasingCurve::Linear,
        ];
        for curve in curves {
            assert_eq!(curve.evaluate(0.0), 0.0);
            assert_eq!(curve.evaluate(1.0), 1.0);
            let mut prev = 0.0;
            for i in 1..=100 {
                let t = (i as f64) / 100.0;
                let v = curve.evaluate(t);
                assert!(v >= prev, "{curve:?} was not monotonic at {t}");
                assert!(v <= 1.0);
                prev = v;
            }
        }
    }

    #[test]
    fn remainder_accumulator_conserves_exact_distance_across_refresh_rates() {
        let mut profile = ScrollProfile::preset("classic");
        profile.step_size_px = 100; // 100px * 1.2 = 120.0 wheel units per 120 delta notch
        profile.animation_time_ms = 400;

        for hz in [60_u32, 144_u32, 240_u32] {
            let mut acc = PulseAccumulator::new();
            let dt = 1.0 / (hz as f64);
            acc.push_impulse(-120, ScrollAxis::Vertical, &profile, 0.0);

            let mut total_sent = 0_i32;
            let mut t = 0.0_f64;
            while !acc.is_idle() && t < 2.0 {
                t += dt;
                let (sy, sx, _, _, _) = acc.step(t, dt);
                assert_eq!(sx, 0);
                total_sent += sy;
            }
            // Total expected is -120 within +/- 1 rounding unit
            assert!(
                (total_sent - (-120)).abs() <= 1,
                "hz={hz} total_sent={total_sent}"
            );
        }
    }

    #[test]
    fn rapid_impulses_accelerate_and_respect_max() {
        let mut profile = ScrollProfile::preset("classic");
        profile.step_size_px = 100;
        profile.acceleration_delta_ms = 80;
        profile.acceleration_max = 2.5;
        profile.animation_time_ms = 300;

        let mut acc = PulseAccumulator::new();
        for i in 0..10 {
            acc.push_impulse(-120, ScrollAxis::Vertical, &profile, (i as f64) * 0.025);
        }

        let mut total_sent = 0_i32;
        let mut t = 0.25_f64;
        while !acc.is_idle() && t < 2.0 {
            t += 1.0 / 144.0;
            let (sy, _, _, _, _) = acc.step(t, 1.0 / 144.0);
            total_sent += sy;
        }
        // Without accel 10 notches = -1200. With accel it must be significantly larger, capped <= 2.5x
        assert!(total_sent < -1600, "expected accelerated total, got {total_sent}");
        assert!(total_sent >= -3000, "exceeded max accel, got {total_sent}");
    }

    #[test]
    fn direction_reversal_clears_previous_momentum() {
        let profile = ScrollProfile::preset("cinema");
        let mut acc = PulseAccumulator::new();
        acc.push_impulse(-120, ScrollAxis::Vertical, &profile, 0.0);
        let _ = acc.step(0.05, 0.016);
        // Reverse immediately
        acc.push_impulse(120, ScrollAxis::Vertical, &profile, 0.06);
        let (sy, _, _, _, _) = acc.step(0.07, 0.01);
        assert!(sy >= 0, "expected immediate upward scroll after reversal, got {sy}");
    }

    #[test]
    fn cancel_all_aborts_active_glide_for_ctrl_zoom_safety() {
        let profile = ScrollProfile::preset("macbook");
        let mut acc = PulseAccumulator::new();
        acc.push_impulse(-120, ScrollAxis::Vertical, &profile, 0.0);
        assert!(!acc.is_idle());
        acc.cancel_all();
        assert!(acc.is_idle());
        let (sy, sx, _, _, _) = acc.step(0.016, 0.016);
        assert_eq!((sy, sx), (0, 0));
    }
}
