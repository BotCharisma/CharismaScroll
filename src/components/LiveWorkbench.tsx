import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { COPY, type Lang } from "../lib/i18n";
import {
  evaluateEasing,
  isTauriRuntime,
  type ScrollProfile,
  type ScrollTelemetry,
} from "../lib/tauri";

interface LiveWorkbenchProps {
  profile: ScrollProfile;
  enabled: boolean;
  detectedHz: number;
  targetFps: number;
  telemetry: ScrollTelemetry | null;
  lang: Lang;
}

const SAMPLE_RUST_LINES = [
  "pub fn step(&mut self, now: f64) -> i32 {",
  "    let mut delta = 0.0;",
  "    for pulse in &mut self.pulses {",
  "        let p = ((now - pulse.start) / pulse.dur).clamp(0.0, 1.0);",
  "        let y = pulse.total * pulse.easing.evaluate(p);",
  "        delta += y - pulse.exported;",
  "        pulse.exported = y;",
  "    }",
  "    let exact = delta + self.remainder;",
  "    let send = exact.round() as i32;",
  "    self.remainder = exact - (send as f64);",
  "    send",
  "}",
  "pub fn cancel_all(&mut self) {",
  "    self.pulses.clear();",
  "    self.remainder = 0.0;",
  "}",
];

const HORIZONTAL_CARDS = {
  vi: [
    { id: "01", title: "WH_MOUSE_LL", desc: "Hook con lăn ưu tiên cao, bỏ qua tức thì thao tác di chuột" },
    { id: "02", title: "Tích lũy phần dư", desc: "Giữ trọn phần thập phân để không hụt quãng đường ở 240\u00A0Hz" },
    { id: "03", title: "Bảo vệ Ctrl+Zoom", desc: "Cắt quán tính cũ ngay lập tức trước khi trả về thao tác thu phóng" },
    { id: "04", title: "Tự né Touchpad", desc: "Giữ nguyên các gói xung mịn từ bàn di chuột laptop" },
    { id: "05", title: "Hồ sơ từng App", desc: "Tắt làm mượt hoặc đặt thông số riêng theo từng tiến trình" },
  ],
  en: [
    { id: "01", title: "WH_MOUSE_LL", desc: "Dedicated high-priority wheel hook with zero move overhead" },
    { id: "02", title: "Sub-unit Remainder", desc: "Fractional pixel accumulator prevents drift on 240\u00A0Hz displays" },
    { id: "03", title: "Ctrl+Zoom Guard", desc: "Instant momentum cancellation before passing raw wheel input" },
    { id: "04", title: "Touchpad Bypass", desc: "Leaves native precision gesture packets completely untouched" },
    { id: "05", title: "Per-App Rules", desc: "Overrides step distance or disables smoothing per process" },
  ],
} as const;

export function LiveWorkbench({
  profile,
  enabled,
  detectedHz,
  targetFps,
  telemetry,
  lang,
}: LiveWorkbenchProps) {
  const t = COPY[lang].workbench;
  const [tracePaused, setTracePaused] = useState(false);
  const [previewTab, setPreviewTab] = useState<"essay" | "code" | "strip">("essay");
  const [localProgress, setLocalProgress] = useState<number>(1);
  const [localVelocity, setLocalVelocity] = useState<number>(0);

  const scrollBoxRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const animStateRef = useRef<{
    pulses: { total: number; exported: number; start: number; dur: number }[];
    remainder: number;
    axis: "y" | "x";
  }>({ pulses: [], remainder: 0, axis: "y" });

  // Generate SVG path for the active easing curve
  const curvePath = useMemo(() => {
    const w = 320;
    const h = 104;
    const padX = 16;
    const padY = 14;
    const plotW = w - padX * 2;
    const plotH = h - padY * 2;
    const steps = 40;
    const points: string[] = [];

    for (let i = 0; i <= steps; i++) {
      const p = i / steps;
      const y = evaluateEasing(profile.easing, p);
      const sx = padX + p * plotW;
      const sy = padY + (1 - y) * plotH;
      points.push(`${i === 0 ? "M" : "L"}${sx.toFixed(1)},${sy.toFixed(1)}`);
    }
    return points.join(" ");
  }, [profile.easing]);

  const activeProgress = tracePaused
    ? 1
    : telemetry && telemetry.progress < 1
      ? telemetry.progress
      : localProgress;
  const activeVelocity = tracePaused
    ? 0
    : telemetry && telemetry.progress < 1
      ? telemetry.velocityPxPerSec
      : localVelocity;

  const dotX = 16 + Math.max(0, Math.min(1, activeProgress)) * (320 - 32);
  const dotY = 14 + (1 - evaluateEasing(profile.easing, activeProgress)) * (104 - 28);
  const effectiveHz = targetFps >= 60 ? targetFps : detectedHz;

  useEffect(() => {
    const box = scrollBoxRef.current;
    if (!box) return;

    const onWheel = (e: WheelEvent) => {
      // Outside Tauri (browser preview), run the exact same PulseAccumulator physics locally inside the Playground!
      if (isTauriRuntime() || !enabled) {
        if (!tracePaused) {
          setLocalProgress(0.15);
          setLocalVelocity(Math.round((profile.stepSizePx * 1000) / profile.animationTimeMs));
        }
        return;
      }

      if (e.ctrlKey || e.altKey) return;
      e.preventDefault();

      const useHoriz =
        previewTab === "strip" || (profile.shiftWheelHorizontal && e.shiftKey) || Math.abs(e.deltaX) > Math.abs(e.deltaY);
      const raw = useHoriz ? (e.deltaX !== 0 ? e.deltaX : e.deltaY) : e.deltaY;
      const dir =
        useHoriz && profile.reverseHorizontal
          ? -1
          : !useHoriz && profile.reverseVertical
            ? -1
            : 1;
      const stepDelta = Math.sign(raw) * profile.stepSizePx * dir;
      const now = performance.now();

      const state = animStateRef.current;
      state.axis = useHoriz ? "x" : "y";
      if (profile.stopOnReverse && state.pulses.length > 0) {
        const rem = state.pulses.reduce((acc, p) => acc + (p.total - p.exported), 0);
        if (rem * stepDelta < 0) {
          state.pulses = [];
          state.remainder = 0;
        }
      }
      state.pulses.push({
        total: stepDelta,
        exported: 0,
        start: now,
        dur: profile.animationTimeMs,
      });

      if (rafRef.current !== null) return;

      let prevTime = now;
      const tick = (t: number) => {
        const dt = Math.max(0.001, (t - prevTime) / 1000);
        prevTime = t;
        let delta = 0;
        let maxP = 0;

        for (const p of state.pulses) {
          const elapsed = Math.max(0, t - p.start);
          const norm = p.dur <= 1 ? 1 : Math.min(1, elapsed / p.dur);
          if (norm > maxP && norm < 1) maxP = norm;
          const target = p.total * evaluateEasing(profile.easing, norm);
          const diff = target - p.exported;
          p.exported += diff;
          delta += diff;
        }
        state.pulses = state.pulses.filter((p) => t - p.start < p.dur);

        const exact = delta + state.remainder;
        const px = Math.round(exact);
        state.remainder = exact - px;

        if (state.axis === "x") {
          box.scrollLeft += px;
        } else {
          box.scrollTop += px;
        }

        if (!tracePaused) {
          setLocalProgress(state.pulses.length === 0 ? 1 : maxP);
          setLocalVelocity(Math.round(Math.abs(delta) / dt));
        }

        if (state.pulses.length > 0) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          rafRef.current = null;
          setLocalProgress(1);
          setLocalVelocity(0);
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
  }, [enabled, previewTab, profile, tracePaused]);

  return (
    <aside className="live-dock" aria-label={t.playgroundTitle}>
      <section className="oscilloscope-well" aria-labelledby="osc-title">
        <div className="dock-header">
          <h2 id="osc-title" className="dock-title">
            {t.oscTitle}
          </h2>
          <div className="dock-metrics">
            <span>
              {Math.round(activeVelocity)}
              {"\u00A0"}px/s
            </span>
            <span>
              {effectiveHz}
              {"\u00A0"}Hz
            </span>
            <button
              type="button"
              className="icon-btn"
              aria-pressed={tracePaused}
              aria-label={tracePaused ? t.resumeTrace : t.pauseTrace}
              title={tracePaused ? t.resumeTrace : t.pauseTrace}
              onClick={() => setTracePaused((p) => !p)}
            >
              {tracePaused ? (
                <Play size={14} strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <Pause size={14} strokeWidth={1.5} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <svg
          className="osc-svg"
          viewBox="0 0 320 104"
          role="img"
          aria-label={`${profile.easing} curve ${profile.animationTimeMs} ms`}
        >
          <line x1="16" y1="14" x2="304" y2="14" stroke="var(--color-grid)" strokeWidth="1" />
          <line x1="16" y1="52" x2="304" y2="52" stroke="var(--color-grid)" strokeWidth="1" />
          <line x1="16" y1="90" x2="304" y2="90" stroke="var(--color-grid)" strokeWidth="1" />
          <line x1="160" y1="14" x2="160" y2="90" stroke="var(--color-grid)" strokeWidth="1" />
          <path
            d={curvePath}
            fill="none"
            stroke="var(--color-signal)"
            strokeWidth="2.25"
            strokeLinecap="round"
          />
          {!tracePaused && activeProgress < 1 && (
            <circle cx={dotX} cy={dotY} r="4.5" fill="var(--color-signal)" />
          )}
        </svg>

        <div className="ruler-ticks" aria-hidden="true">
          <span>0{"\u00A0"}ms</span>
          <span>
            {Math.round(profile.animationTimeMs / 2)}
            {"\u00A0"}ms
          </span>
          <span>
            {profile.animationTimeMs}
            {"\u00A0"}ms
          </span>
        </div>
      </section>

      <section className="playground-well" aria-labelledby="playground-title">
        <div className="dock-header">
          <h2 id="playground-title" className="dock-title">
            {t.playgroundTitle}
          </h2>
          <div className="playground-tabs" role="tablist" aria-label={t.playgroundTitle}>
            <button
              type="button"
              role="tab"
              aria-selected={previewTab === "essay"}
              className="tab-btn"
              onClick={() => setPreviewTab("essay")}
            >
              {t.essayTab}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={previewTab === "code"}
              className="tab-btn"
              onClick={() => setPreviewTab("code")}
            >
              {t.codeTab}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={previewTab === "strip"}
              className="tab-btn"
              onClick={() => setPreviewTab("strip")}
            >
              {t.stripTab}
            </button>
          </div>
        </div>

        <div ref={scrollBoxRef} className="playground-scroll-box" tabIndex={0}>
          {previewTab === "essay" && (
            <article className="essay-prose">
              <h3>{t.essayHeading}</h3>
              <p>{t.essayP1}</p>
              <p>{t.essayP2}</p>
              <p>{t.essayP3}</p>
              <p>{t.essayP1}</p>
              <p>{t.essayP2}</p>
            </article>
          )}

          {previewTab === "code" && (
            <pre className="code-sample" translate="no">
              {SAMPLE_RUST_LINES.map((line, i) => (
                <div key={i} className="code-line">
                  <span className="code-ln">{i + 1}</span>
                  <code>{line}</code>
                </div>
              ))}
            </pre>
          )}

          {previewTab === "strip" && (
            <div>
              <p className="section-hint">{t.stripHint}</p>
              <div className="horizontal-strip">
                {HORIZONTAL_CARDS[lang].map((card) => (
                  <div key={card.id} className="strip-tile">
                    <span className="strip-index">{card.id}</span>
                    <div>
                      <h3 className="strip-title" translate="no">
                        {card.title}
                      </h3>
                      <p className="strip-desc">{card.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </aside>
  );
}
