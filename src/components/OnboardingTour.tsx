import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";

interface TourStep {
  selector: string;
  title: string;
  body: string;
  cardPos: "above-center" | "left-of-rows" | "above-left" | "below-right";
}

const TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="cycle"]',
    title: "Cycle 3D scroll presets",
    body: "Click this ember button anytime to switch between Classic, Trackpad, Snappy, Cinema, or your own saved presets.",
    cardPos: "above-center",
  },
  {
    selector: '[data-tour="rows"]',
    title: "Tap any row to fine-tune",
    body: "Click Step size, Glide time, Max boost, or Deceleration to reveal its inline slider and an attached usage guide on the left.",
    cardPos: "left-of-rows",
  },
  {
    selector: '[data-tour="steps"]',
    title: "Apps, System & live Test Pad",
    body: "Switch right-stage views here to configure per-app rules or Admin access, and open the corner square to test scrolling live.",
    cardPos: "above-left",
  },
  {
    selector: '[data-tour="close"]',
    title: "Runs quietly in System Tray",
    body: "Closing this window frees WebView memory while CharismaScroll stays active in the background. Press Alt+Shift+S to toggle anywhere.",
    cardPos: "below-right",
  },
];

interface OnboardingTourProps {
  open: boolean;
  onFinish: () => void;
}

interface RectBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function OnboardingTour({ open, onFinish }: OnboardingTourProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const [spot, setSpot] = useState<RectBox | null>(null);

  const step = TOUR_STEPS[stepIdx];

  useEffect(() => {
    if (!open) {
      setStepIdx(0);
      return;
    }

    const measure = () => {
      const el = document.querySelector(step.selector);
      if (!el) {
        setSpot(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const pad = 8;
      setSpot({
        top: Math.max(4, r.top - pad),
        left: Math.max(4, r.left - pad),
        width: r.width + pad * 2,
        height: r.height + pad * 2,
      });
    };

    measure();
    window.addEventListener("resize", measure);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFinish();
      else if (e.key === "ArrowRight") {
        if (stepIdx < TOUR_STEPS.length - 1) setStepIdx((i) => i + 1);
        else onFinish();
      } else if (e.key === "ArrowLeft" && stepIdx > 0) {
        setStepIdx((i) => i - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, step.selector, stepIdx, onFinish]);

  if (!open) return null;

  const isLast = stepIdx === TOUR_STEPS.length - 1;

  return (
    <div
      className="tour-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="CharismaScroll quick guide"
    >
      {spot && (
        <div
          className="tour-spotlight"
          style={{
            top: `${spot.top}px`,
            left: `${spot.left}px`,
            width: `${spot.width}px`,
            height: `${spot.height}px`,
          }}
        />
      )}

      <div className={`tour-card tour-pos-${step.cardPos}`}>
        <div className="tour-card-top">
          <span className="tour-step-count tabular-num">
            {stepIdx + 1} / {TOUR_STEPS.length}
          </span>
          <button
            type="button"
            className="caption-btn"
            aria-label="Skip guide"
            onClick={onFinish}
          >
            <X size={14} strokeWidth={1.6} aria-hidden="true" />
          </button>
        </div>

        <h3 className="tour-title">{step.title}</h3>
        <p className="tour-body">{step.body}</p>

        <div className="tour-footer">
          <div className="tour-dots" aria-hidden="true">
            {TOUR_STEPS.map((_, idx) => (
              <span
                key={idx}
                className={idx === stepIdx ? "tour-dot is-active" : "tour-dot"}
              />
            ))}
          </div>

          <div className="tour-actions">
            {stepIdx > 0 && (
              <button
                type="button"
                className="outline-pill-btn"
                onClick={() => setStepIdx((i) => i - 1)}
              >
                <ArrowLeft size={13} strokeWidth={1.6} aria-hidden="true" />
                <span>Back</span>
              </button>
            )}

            <button
              type="button"
              className="outline-pill-btn tour-next-btn"
              onClick={() => {
                if (isLast) onFinish();
                else setStepIdx((i) => i + 1);
              }}
            >
              <span>{isLast ? "Start scrolling" : "Next"}</span>
              {isLast ? (
                <Check size={13} strokeWidth={1.8} aria-hidden="true" />
              ) : (
                <ArrowRight size={13} strokeWidth={1.6} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
