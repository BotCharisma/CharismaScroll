import { useState } from "react";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Minus,
  MoveVertical,
  Plus,
  Timer,
} from "lucide-react";
import {
  PRESET_STAGE_META,
  type EasingCurve,
  type PresetId,
  type ScrollProfile,
} from "../lib/tauri";

interface MotionStagePanelProps {
  profile: ScrollProfile;
  activePreset: string;
  onChangeProfile: (next: ScrollProfile) => void;
}

const CURVES: EasingCurve[] = ["OutQuint", "OutExpo", "OutCubic", "OutQuart", "Linear"];

type OpenRow = "step" | "time" | "boost" | "curve" | null;

export function MotionStagePanel({
  profile,
  activePreset,
  onChangeProfile,
}: MotionStagePanelProps) {
  const [openRow, setOpenRow] = useState<OpenRow>(null);

  const presetLabel =
    activePreset in PRESET_STAGE_META
      ? `${PRESET_STAGE_META[activePreset as PresetId].line1} ${
          PRESET_STAGE_META[activePreset as PresetId].line2
        }`
      : "Custom tune";

  const patch = <K extends keyof ScrollProfile>(key: K, value: ScrollProfile[K]) => {
    onChangeProfile({ ...profile, [key]: value });
  };

  const toggleRow = (row: Exclude<OpenRow, null>) => {
    setOpenRow((prev) => (prev === row ? null : row));
  };

  const cycleCurve = (dir: -1 | 1) => {
    const idx = CURVES.indexOf(profile.easing);
    const nextIdx = (idx + dir + CURVES.length) % CURVES.length;
    patch("easing", CURVES[nextIdx]);
  };

  return (
    <div className="panel-content">
      <div className="panel-header">
        <h2 className="panel-heading">
          Motion
          <br />
          tuning
        </h2>
        <span className="panel-tag">{presetLabel}</span>
      </div>

      <div className="spec-rows">
        {/* Row 1: Step size */}
        <div className={openRow === "step" ? "spec-row is-open" : "spec-row"}>
          <div className="spec-row-main">
            <button
              type="button"
              className="spec-label-btn"
              aria-expanded={openRow === "step"}
              onClick={() => toggleRow("step")}
            >
              <span className="spec-glyph" aria-hidden="true">
                <MoveVertical size={15} strokeWidth={1.5} />
              </span>
              <span>Step size</span>
            </button>

            <div className="spec-controls">
              <span className="spec-value">
                {profile.stepSizePx}
                {"\u00A0"}px
              </span>
              <div className="stepper-pair">
                <button
                  type="button"
                  className="step-btn"
                  aria-label="Decrease step size"
                  onClick={() => patch("stepSizePx", Math.max(40, profile.stepSizePx - 10))}
                >
                  <Minus size={13} strokeWidth={1.5} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="step-btn"
                  aria-label="Increase step size"
                  onClick={() => patch("stepSizePx", Math.min(300, profile.stepSizePx + 10))}
                >
                  <Plus size={13} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          {openRow === "step" && (
            <div className="scrubber-tray">
              <input
                id="scrub-step"
                name="stepSizePx"
                type="range"
                aria-label="Step size in pixels"
                min={40}
                max={300}
                step={5}
                value={profile.stepSizePx}
                onChange={(e) => patch("stepSizePx", Number(e.target.value))}
                className="ember-range"
              />
            </div>
          )}
        </div>

        {/* Row 2: Glide time */}
        <div className={openRow === "time" ? "spec-row is-open" : "spec-row"}>
          <div className="spec-row-main">
            <button
              type="button"
              className="spec-label-btn"
              aria-expanded={openRow === "time"}
              onClick={() => toggleRow("time")}
            >
              <span className="spec-glyph" aria-hidden="true">
                <Timer size={15} strokeWidth={1.5} />
              </span>
              <span>Glide time</span>
            </button>

            <div className="spec-controls">
              <span className="spec-value">
                {profile.animationTimeMs}
                {"\u00A0"}ms
              </span>
              <div className="stepper-pair">
                <button
                  type="button"
                  className="step-btn"
                  aria-label="Decrease glide time"
                  onClick={() =>
                    patch("animationTimeMs", Math.max(100, profile.animationTimeMs - 30))
                  }
                >
                  <Minus size={13} strokeWidth={1.5} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="step-btn"
                  aria-label="Increase glide time"
                  onClick={() =>
                    patch("animationTimeMs", Math.min(1000, profile.animationTimeMs + 30))
                  }
                >
                  <Plus size={13} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          {openRow === "time" && (
            <div className="scrubber-tray">
              <input
                id="scrub-time"
                name="animationTimeMs"
                type="range"
                aria-label="Glide duration in milliseconds"
                min={100}
                max={1000}
                step={10}
                value={profile.animationTimeMs}
                onChange={(e) => patch("animationTimeMs", Number(e.target.value))}
                className="ember-range"
              />
            </div>
          )}
        </div>

        {/* Row 3: Max boost */}
        <div className={openRow === "boost" ? "spec-row is-open" : "spec-row"}>
          <div className="spec-row-main">
            <button
              type="button"
              className="spec-label-btn"
              aria-expanded={openRow === "boost"}
              onClick={() => toggleRow("boost")}
            >
              <span className="spec-glyph" aria-hidden="true">
                <Gauge size={15} strokeWidth={1.5} />
              </span>
              <span>Max boost</span>
            </button>

            <div className="spec-controls">
              <span className="spec-value">{profile.accelerationMax.toFixed(1)}×</span>
              <div className="stepper-pair">
                <button
                  type="button"
                  className="step-btn"
                  aria-label="Decrease max boost"
                  onClick={() =>
                    patch(
                      "accelerationMax",
                      Math.round(Math.max(1.0, profile.accelerationMax - 0.2) * 10) / 10
                    )
                  }
                >
                  <Minus size={13} strokeWidth={1.5} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="step-btn"
                  aria-label="Increase max boost"
                  onClick={() =>
                    patch(
                      "accelerationMax",
                      Math.round(Math.min(6.0, profile.accelerationMax + 0.2) * 10) / 10
                    )
                  }
                >
                  <Plus size={13} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          {openRow === "boost" && (
            <div className="scrubber-tray">
              <input
                id="scrub-boost"
                name="accelerationMax"
                type="range"
                aria-label="Maximum spin acceleration"
                min={1.0}
                max={6.0}
                step={0.1}
                value={profile.accelerationMax}
                onChange={(e) => patch("accelerationMax", Number(e.target.value))}
                className="ember-range"
              />
            </div>
          )}
        </div>

        {/* Row 4: Easing curve */}
        <div className={openRow === "curve" ? "spec-row is-open" : "spec-row"}>
          <div className="spec-row-main">
            <button
              type="button"
              className="spec-label-btn"
              aria-expanded={openRow === "curve"}
              onClick={() => toggleRow("curve")}
            >
              <span className="spec-glyph" aria-hidden="true">
                <Activity size={15} strokeWidth={1.5} />
              </span>
              <span>Deceleration</span>
            </button>

            <div className="spec-controls">
              <span className="spec-value" translate="no">
                {profile.easing}
              </span>
              <div className="stepper-pair">
                <button
                  type="button"
                  className="step-btn"
                  aria-label="Previous curve"
                  onClick={() => cycleCurve(-1)}
                >
                  <ChevronLeft size={14} strokeWidth={1.5} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="step-btn"
                  aria-label="Next curve"
                  onClick={() => cycleCurve(1)}
                >
                  <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          {openRow === "curve" && (
            <div className="curve-pills" role="group" aria-label="Easing curves">
              {CURVES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="pill-choice"
                  aria-pressed={profile.easing === c}
                  onClick={() => patch("easing", c)}
                >
                  <span translate="no">{c}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
