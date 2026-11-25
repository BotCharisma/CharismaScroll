import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, Pause, Play, X } from "lucide-react";
import {
  evaluateEasing,
  isTauriRuntime,
  type ScrollProfile,
  type ScrollTelemetry,
} from "../lib/tauri";
import { Tooltip } from "./Tooltip";

interface TestPadDrawerProps {
  open: boolean;
  onToggleOpen: () => void;
  profile: ScrollProfile;
  enabled: boolean;
  telemetry: ScrollTelemetry | null;
}

const PROSE_SECTIONS = [
  {
    id: "01",
    heading: "Testing stopping precision",
    paragraphs: [
      "Roll a single detent or flick rapidly inside this card to feel how impulses stack without losing crisp line control.",
      "Pressing Ctrl mid-glide cuts remaining momentum immediately so browser zoom never overshoots.",
    ],
  },
  {
    id: "02",
    heading: "Single-notch micro stepping",
    paragraphs: [
      "Give the wheel one gentle notch and watch where the baseline settles. A well-tuned step size moves two to four lines without feeling abrupt or sluggish.",
      "If text feels like it drifts past the paragraph you intended to read, trim Glide time by 40 to 80 milliseconds or switch deceleration to OutQuart.",
    ],
  },
  {
    id: "03",
    heading: "Rapid flick & momentum boost",
    paragraphs: [
      "Flick the wheel three or four times in quick succession to trigger velocity stacking. Max boost multiplies consecutive detents so long documents fly past effortlessly.",
      "Notice how the curve starts briskly and tapers softly into silence instead of slamming into a sudden stop.",
    ],
  },
  {
    id: "04",
    heading: "High-refresh cadence (120–240 Hz)",
    paragraphs: [
      "Every frame emits sub-unit wheel increments and carries fractional remainders forward so zero travel distance is ever dropped across monitor refresh rates.",
      "Keep your eye on the orange curve trace above as you scroll: each new pulse blends seamlessly into the active tail.",
    ],
  },
  {
    id: "05",
    heading: "Direction reversal & brake feel",
    paragraphs: [
      "Scroll quickly downward, then immediately flick upward one notch. The physics engine cancels opposing momentum on contact so reversing direction always feels instant.",
      "This prevents the rubbery lag that plagues naive spring-only smooth scrollers when skimming long articles or design specs.",
    ],
  },
  {
    id: "06",
    heading: "Long-form reading comfort",
    paragraphs: [
      "Try reading at a steady rhythm while nudging the wheel every few seconds. Ideal reading motion keeps your eyes anchored on the next line without hunting for where the paragraph jumped.",
      "Trackpad Glide favors longer, softer tails for relaxed reading; Snappy Code tightens both step and decay for rapid diff scanning.",
    ],
  },
  {
    id: "07",
    heading: "Per-app rules & fullscreen guard",
    paragraphs: [
      "Apps like 3D viewports, CAD tools, or competitive games often rely on raw discrete wheel ticks. Add them under Apps to bypass smoothing automatically.",
      "When Game Mode is enabled, fullscreen windows drop straight back to native hardware wheel events with zero overhead.",
    ],
  },
  {
    id: "08",
    heading: "End of runway marker",
    paragraphs: [
      "You reached the bottom of the prose runway. Flick back to the top in one smooth motion to compare upward and downward feel.",
      "Close this drawer anytime from the corner square button to return to the calm four-row stage.",
    ],
  },
];

const CODE_LINES = [
  "// CharismaScroll — Smooth Wheel Physics Kernel (sample buffer)",
  "use std::collections::VecDeque;",
  "",
  "#[derive(Debug, Clone, Copy)]",
  "pub enum EasingCurve {",
  "    OutCubic,",
  "    OutQuart,",
  "    OutQuint,",
  "    OutExpo,",
  "}",
  "",
  "impl EasingCurve {",
  "    pub fn evaluate(self, t: f64) -> f64 {",
  "        let x = t.clamp(0.0, 1.0);",
  "        match self {",
  "            Self::OutCubic => 1.0 - (1.0 - x).powi(3),",
  "            Self::OutQuart => 1.0 - (1.0 - x).powi(4),",
  "            Self::OutQuint => 1.0 - (1.0 - x).powi(5),",
  "            Self::OutExpo => if x >= 1.0 { 1.0 } else { 1.0 - 2.0_f64.powf(-10.0 * x) },",
  "        }",
  "    }",
  "}",
  "",
  "#[derive(Debug, Clone)]",
  "pub struct ScrollPulse {",
  "    pub total: f64,",
  "    pub exported: f64,",
  "    pub start_ms: f64,",
  "    pub dur_ms: f64,",
  "    pub easing: EasingCurve,",
  "}",
  "",
  "pub struct PhysicsEngine {",
  "    pulses: VecDeque<ScrollPulse>,",
  "    remainder: f64,",
  "    last_notch_ms: f64,",
  "    streak: u32,",
  "}",
  "",
  "impl PhysicsEngine {",
  "    pub fn new() -> Self {",
  "        Self {",
  "            pulses: VecDeque::with_capacity(32),",
  "            remainder: 0.0,",
  "            last_notch_ms: 0.0,",
  "            streak: 0,",
  "        }",
  "    }",
  "",
  "    pub fn push_detent(&mut self, dir: f64, step_px: f64, dur_ms: f64, max_boost: f64, now: f64) {",
  "        // Instant brake if user reverses scroll direction mid-glide",
  "        if self.pulses.back().is_some_and(|p| p.total.signum() != dir.signum()) {",
  "            self.pulses.clear();",
  "            self.remainder = 0.0;",
  "            self.streak = 0;",
  "        }",
  "",
  "        let gap = now - self.last_notch_ms;",
  "        self.last_notch_ms = now;",
  "        self.streak = if gap < 140.0 { (self.streak + 1).min(12) } else { 0 };",
  "",
  "        let boost = (1.0 + (self.streak as f64) * 0.24).min(max_boost);",
  "        self.pulses.push_back(ScrollPulse {",
  "            total: dir * step_px * boost,",
  "            exported: 0.0,",
  "            start_ms: now,",
  "            dur_ms: dur_ms.max(40.0),",
  "            easing: EasingCurve::OutQuart,",
  "        });",
  "    }",
  "",
  "    pub fn step(&mut self, now: f64) -> i32 {",
  "        let mut delta = 0.0;",
  "        for pulse in &mut self.pulses {",
  "            let p = ((now - pulse.start_ms) / pulse.dur_ms).clamp(0.0, 1.0);",
  "            let y = pulse.total * pulse.easing.evaluate(p);",
  "            delta += y - pulse.exported;",
  "            pulse.exported = y;",
  "        }",
  "        self.pulses.retain(|p| now - p.start_ms < p.dur_ms);",
  "",
  "        let exact = delta + self.remainder;",
  "        let send = exact.round() as i32;",
  "        self.remainder = exact - (send as f64);",
  "        send",
  "    }",
  "",
  "    pub fn cancel_for_zoom(&mut self) {",
  "        self.pulses.clear();",
  "        self.remainder = 0.0;",
  "        self.streak = 0;",
  "    }",
  "}",
];

const STRIP_CARDS = [
  { id: "01", title: "WH_MOUSE_LL", desc: "Dedicated high-priority wheel hook" },
  { id: "02", title: "Sub-unit Carry", desc: "Zero fractional loss at 240\u00A0Hz" },
  { id: "03", title: "Zoom Guard", desc: "Instant glide cut on Ctrl press" },
  { id: "04", title: "Touchpad Pass", desc: "Native precision gestures preserved" },
  { id: "05", title: "OutQuart Curve", desc: "Brisk launch, velvety settle" },
  { id: "06", title: "Instant Brake", desc: "Zero lag when flipping direction" },
  { id: "07", title: "Impulse Stack", desc: "Consecutive flicks blend cleanly" },
  { id: "08", title: "Velocity Boost", desc: "Adaptive acceleration for long feeds" },
  { id: "09", title: "Shift + Wheel", desc: "Horizontal glide across timelines" },
  { id: "10", title: "App Profiles", desc: "Per-process bypass or custom tune" },
  { id: "11", title: "Game Guard", desc: "Auto-pause inside fullscreen games" },
  { id: "12", title: "Tray Quick-Toggle", desc: "One click or hotkey to pause" },
  { id: "13", title: "Zero Jitter", desc: "Fixed-step high-resolution timer" },
  { id: "14", title: "Multi-Monitor", desc: "Matches display refresh cadence" },
  { id: "15", title: "DPI Aware", desc: "Consistent distance on 4K & 1080p" },
  { id: "16", title: "Low Footprint", desc: "Native Rust core, tiny memory use" },
  { id: "17", title: "Custom Presets", desc: "Saved cleanly in your Documents" },
  { id: "18", title: "Admin Elevation", desc: "Scrolls elevated tools smoothly" },
  { id: "19", title: "Telemetry Feed", desc: "Live curve & velocity feedback" },
  { id: "20", title: "Runway End", desc: "Flick left to glide back to 01" },
];

export function TestPadDrawer({
  open,
  onToggleOpen,
  profile,
  enabled,
  telemetry,
}: TestPadDrawerProps) {
  const [mode, setMode] = useState<"essay" | "code" | "strip">("essay");
  const [paused, setPaused] = useState(false);
  const [localProgress, setLocalProgress] = useState(1);

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const stateRef = useRef<{
    pulses: { total: number; exported: number; start: number; dur: number }[];
    remainder: number;
    axis: "y" | "x";
  }>({ pulses: [], remainder: 0, axis: "y" });

  const curvePath = useMemo(() => {
    const w = 360;
    const h = 82;
    const px = 14;
    const py = 12;
    const pw = w - px * 2;
    const ph = h - py * 2;
    const pts: string[] = [];
    for (let i = 0; i <= 36; i++) {
      const p = i / 36;
      const y = evaluateEasing(profile.easing, p);
      pts.push(
        `${i === 0 ? "M" : "L"}${(px + p * pw).toFixed(1)},${(py + (1 - y) * ph).toFixed(1)}`
      );
    }
    return pts.join(" ");
  }, [profile.easing]);

  const progress = paused
    ? 1
    : telemetry && telemetry.progress < 1
      ? telemetry.progress
      : localProgress;
  const dotX = 14 + Math.max(0, Math.min(1, progress)) * (360 - 28);
  const dotY = 12 + (1 - evaluateEasing(profile.easing, progress)) * (82 - 24);

  useEffect(() => {
    if (!open) return;
    const box = surfaceRef.current;
    if (!box) return;

    const onWheel = (e: WheelEvent) => {
      if (isTauriRuntime() || !enabled) {
        if (!paused) setLocalProgress(0.2);
        if (mode === "strip" && !e.ctrlKey && !e.altKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault();
          box.scrollLeft += e.deltaY;
        }
        return;
      }
      if (e.ctrlKey || e.altKey) return;
      e.preventDefault();

      const horiz =
        mode === "strip" ||
        (profile.shiftWheelHorizontal && e.shiftKey) ||
        Math.abs(e.deltaX) > Math.abs(e.deltaY);
      const raw = horiz ? (e.deltaX !== 0 ? e.deltaX : e.deltaY) : e.deltaY;
      const dir =
        horiz && profile.reverseHorizontal
          ? -1
          : !horiz && profile.reverseVertical
            ? -1
            : 1;
      const stepDelta = Math.sign(raw) * profile.stepSizePx * dir;
      const now = performance.now();

      const st = stateRef.current;
      st.axis = horiz ? "x" : "y";
      st.pulses.push({
        total: stepDelta,
        exported: 0,
        start: now,
        dur: profile.animationTimeMs,
      });

      if (rafRef.current !== null) return;
      const tick = (t: number) => {
        let delta = 0;
        let maxP = 0;
        for (const p of st.pulses) {
          const norm = p.dur <= 1 ? 1 : Math.min(1, Math.max(0, t - p.start) / p.dur);
          if (norm > maxP && norm < 1) maxP = norm;
          const target = p.total * evaluateEasing(profile.easing, norm);
          const diff = target - p.exported;
          p.exported += diff;
          delta += diff;
        }
        st.pulses = st.pulses.filter((p) => t - p.start < p.dur);
        const exact = delta + st.remainder;
        const px = Math.round(exact);
        st.remainder = exact - px;

        if (st.axis === "x") box.scrollLeft += px;
        else box.scrollTop += px;

        if (!paused) setLocalProgress(st.pulses.length === 0 ? 1 : maxP);

        if (st.pulses.length > 0) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          rafRef.current = null;
          setLocalProgress(1);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    box.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      box.removeEventListener("wheel", onWheel);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [open, enabled, mode, profile, paused]);

  return (
    <>
      <div className="testpad-trigger-wrap">
        <Tooltip label={open ? "Close test pad" : "Open live test pad"} placement="top-end">
          <button
            type="button"
            className="testpad-trigger"
            aria-expanded={open}
            aria-label={open ? "Close scroll test pad" : "Open scroll test pad"}
            onClick={onToggleOpen}
          >
            {open ? (
              <X size={17} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <LayoutGrid size={17} strokeWidth={1.5} aria-hidden="true" />
            )}
          </button>
        </Tooltip>
      </div>

      {open && (
        <aside className="testpad-drawer" aria-label="Scroll test pad">
          <div className="drawer-top">
            <h2 className="drawer-title">Test pad</h2>
            <div className="spec-controls">
              <button
                type="button"
                className="pill-choice"
                aria-pressed={mode === "essay"}
                onClick={() => setMode("essay")}
              >
                Prose
              </button>
              <button
                type="button"
                className="pill-choice"
                aria-pressed={mode === "code"}
                onClick={() => setMode("code")}
              >
                Code
              </button>
              <button
                type="button"
                className="pill-choice"
                aria-pressed={mode === "strip"}
                onClick={() => setMode("strip")}
              >
                Strip
              </button>
              <Tooltip label={paused ? "Resume curve trace" : "Pause curve trace"} placement="top-end">
                <button
                  type="button"
                  className="step-btn"
                  aria-pressed={paused}
                  aria-label={paused ? "Resume curve trace" : "Pause curve trace"}
                  onClick={() => setPaused((p) => !p)}
                >
                  {paused ? (
                    <Play size={12} strokeWidth={1.5} aria-hidden="true" />
                  ) : (
                    <Pause size={12} strokeWidth={1.5} aria-hidden="true" />
                  )}
                </button>
              </Tooltip>
            </div>
          </div>

          <svg
            className="osc-mini-svg"
            viewBox="0 0 360 82"
            role="img"
            aria-label={`${profile.easing} deceleration curve`}
          >
            <line x1="14" y1="41" x2="346" y2="41" stroke="var(--color-rule)" strokeWidth="1" />
            <path
              d={curvePath}
              fill="none"
              stroke="var(--color-signal)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            {!paused && progress < 1 && (
              <circle cx={dotX} cy={dotY} r="4" fill="var(--color-signal)" />
            )}
          </svg>

          <div ref={surfaceRef} className="testpad-surface" tabIndex={0}>
            {mode === "essay" && (
              <article className="prose-test">
                {PROSE_SECTIONS.map((sec) => (
                  <section key={sec.id} className="prose-section">
                    <h3>
                      <span className="prose-idx mono-num">{sec.id}</span>
                      {sec.heading}
                    </h3>
                    {sec.paragraphs.map((text, idx) => (
                      <p key={idx}>{text}</p>
                    ))}
                  </section>
                ))}
              </article>
            )}

            {mode === "code" && (
              <pre className="code-test" translate="no">
                {CODE_LINES.map((ln, idx) => (
                  <div key={idx} className="code-row">
                    <span className="code-idx">{idx + 1}</span>
                    <code>{ln}</code>
                  </div>
                ))}
              </pre>
            )}

            {mode === "strip" && (
              <div className="strip-lane">
                {STRIP_CARDS.map((card) => (
                  <div key={card.id} className="strip-card">
                    <span className="app-exe">{card.id}</span>
                    <h4 translate="no">{card.title}</h4>
                    <p>{card.desc}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      )}
    </>
  );
}
