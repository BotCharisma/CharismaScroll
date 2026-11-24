import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, Pause, Play, X } from "lucide-react";
import {
  evaluateEasing,
  isTauriRuntime,
  type ScrollProfile,
  type ScrollTelemetry,
} from "../lib/tauri";

interface TestPadDrawerProps {
  open: boolean;
  onToggleOpen: () => void;
  profile: ScrollProfile;
  enabled: boolean;
  telemetry: ScrollTelemetry | null;
}

const CODE_LINES = [
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
];

const STRIP_CARDS = [
  { id: "01", title: "WH_MOUSE_LL", desc: "Dedicated high-priority wheel hook" },
  { id: "02", title: "Sub-unit Carry", desc: "Zero fractional loss at 240\u00A0Hz" },
  { id: "03", title: "Zoom Guard", desc: "Instant glide cut on Ctrl press" },
  { id: "04", title: "Touchpad Pass", desc: "Native precision gestures preserved" },
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
      <button
        type="button"
        className="testpad-trigger"
        aria-expanded={open}
        aria-label={open ? "Close scroll test pad" : "Open scroll test pad"}
        title={open ? "Close test pad" : "Open test pad"}
        onClick={onToggleOpen}
      >
        {open ? (
          <X size={17} strokeWidth={1.5} aria-hidden="true" />
        ) : (
          <LayoutGrid size={17} strokeWidth={1.5} aria-hidden="true" />
        )}
      </button>

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
                <h3>Testing stopping precision</h3>
                <p>
                  Roll a single detent or flick rapidly inside this card to feel how impulses
                  stack without losing crisp line control.
                </p>
                <p>
                  Pressing Ctrl mid-glide cuts remaining momentum immediately so browser zoom
                  never overshoots.
                </p>
                <p>
                  Close this drawer anytime from the corner square button to return to the calm
                  four-row stage.
                </p>
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
