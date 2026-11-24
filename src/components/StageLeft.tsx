import { useEffect, useState } from "react";
import { Layers, Shield, Sliders } from "lucide-react";
import {
  PRESET_STAGE_META,
  type PresetId,
  type ScrollTelemetry,
} from "../lib/tauri";
import { Stage3DCanvas } from "./Stage3DCanvas";

export type StageSection = "motion" | "apps" | "system";

interface StageLeftProps {
  activePreset: string;
  activeSection: StageSection;
  onSelectSection: (section: StageSection) => void;
  telemetry: ScrollTelemetry | null;
}

const STAGE_GRADIENTS: Record<PresetId, { top: string; mid: string; low: string; path: string }> = {
  classic: {
    top: "var(--stage-classic-top)",
    mid: "var(--stage-classic-mid)",
    low: "var(--stage-classic-low)",
    path: "M 0,0 L 342,0 C 416,138 398,322 312,442 C 242,538 112,548 0,536 Z",
  },
  macbook: {
    top: "var(--stage-macbook-top)",
    mid: "var(--stage-macbook-mid)",
    low: "var(--stage-macbook-low)",
    path: "M 0,0 L 318,0 C 408,162 414,344 324,458 C 254,544 126,552 0,542 Z",
  },
  coding: {
    top: "var(--stage-coding-top)",
    mid: "var(--stage-coding-mid)",
    low: "var(--stage-coding-low)",
    path: "M 0,0 L 354,0 C 398,124 382,298 302,428 C 232,534 104,542 0,528 Z",
  },
  cinema: {
    top: "var(--stage-cinema-top)",
    mid: "var(--stage-cinema-mid)",
    low: "var(--stage-cinema-low)",
    path: "M 0,0 L 330,0 C 420,148 404,336 318,452 C 248,546 118,554 0,540 Z",
  },
};

export function StageLeft({
  activePreset,
  activeSection,
  onSelectSection,
  telemetry,
}: StageLeftProps) {
  const resolvedPreset: PresetId =
    activePreset === "macbook" ||
    activePreset === "coding" ||
    activePreset === "cinema" ||
    activePreset === "classic"
      ? activePreset
      : "classic";

  const meta =
    activePreset === "custom"
      ? { line1: "Custom", line2: "tune", summary: "Hand-tuned wheel physics" }
      : PRESET_STAGE_META[resolvedPreset];

  const grad = STAGE_GRADIENTS[resolvedPreset];
  const [shifting, setShifting] = useState(false);

  useEffect(() => {
    setShifting(true);
    const id = window.setTimeout(() => setShifting(false), 180);
    return () => window.clearTimeout(id);
  }, [activePreset]);

  return (
    <aside className="stage-left" aria-label="Active scroll preset stage">
      <svg
        className="organic-backdrop"
        viewBox="0 0 420 600"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="emberStageGrad" x1="0%" y1="0%" x2="88%" y2="96%">
            <stop offset="0%" stopColor={grad.top} />
            <stop offset="52%" stopColor={grad.mid} />
            <stop offset="100%" stopColor={grad.low} />
          </linearGradient>
        </defs>
        <path d={grad.path} fill="url(#emberStageGrad)" className="organic-path" />
      </svg>

      <div className="stage-brand">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect
            x="5"
            y="1.5"
            width="8"
            height="15"
            rx="4"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <rect x="8" y="4.5" width="2" height="4.5" rx="1" fill="currentColor" />
        </svg>
        <span className="stage-brand-name" translate="no">
          CharismaScroll
        </span>
      </div>

      <div className="stage-hero-copy">
        <h1 className={shifting ? "stage-display-title is-shifting" : "stage-display-title"}>
          {meta.line1}
          <br />
          {meta.line2}
        </h1>
        <p className="stage-subtitle">{meta.summary}</p>
      </div>

      <Stage3DCanvas presetId={resolvedPreset} telemetry={telemetry} />

      <nav className="step-switcher" aria-label="Workspace views">
        <div className="step-node-wrap">
          <button
            type="button"
            className="step-node"
            aria-current={activeSection === "motion" ? "page" : undefined}
            aria-label="Motion tuning"
            title="Motion tuning"
            onClick={() => onSelectSection("motion")}
          >
            <Sliders size={15} strokeWidth={1.5} aria-hidden="true" />
            <span>Motion</span>
          </button>
        </div>

        <div className="step-node-wrap">
          <span className="step-dash" aria-hidden="true" />
          <button
            type="button"
            className="step-node"
            aria-current={activeSection === "apps" ? "page" : undefined}
            aria-label="App profiles"
            title="App profiles"
            onClick={() => onSelectSection("apps")}
          >
            <Layers size={15} strokeWidth={1.5} aria-hidden="true" />
            <span>Apps</span>
          </button>
        </div>

        <div className="step-node-wrap">
          <span className="step-dash" aria-hidden="true" />
          <button
            type="button"
            className="step-node"
            aria-current={activeSection === "system" ? "page" : undefined}
            aria-label="System core"
            title="System core"
            onClick={() => onSelectSection("system")}
          >
            <Shield size={15} strokeWidth={1.5} aria-hidden="true" />
            <span>System</span>
          </button>
        </div>
      </nav>
    </aside>
  );
}
