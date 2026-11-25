import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Gauge,
  Minus,
  MoveVertical,
  Plus,
  Save,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import {
  PRESET_ORDER,
  PRESET_STAGE_META,
  type CustomPreset,
  type EasingCurve,
  type PresetId,
  type ScrollProfile,
} from "../lib/tauri";
import { Tooltip } from "./Tooltip";

interface MotionStagePanelProps {
  profile: ScrollProfile;
  activePreset: string;
  customPresets: CustomPreset[];
  onChangeProfile: (next: ScrollProfile) => void;
  onApplyPreset: (presetId: string) => void;
  onSaveCustomPreset: (name: string, profile: ScrollProfile) => Promise<void>;
  onDeleteCustomPreset: (id: string) => Promise<void>;
  onOpenStorageFolder: () => void;
}

const CURVES: EasingCurve[] = ["OutQuint", "OutExpo", "OutCubic", "OutQuart", "Linear"];

type OpenRow = "step" | "time" | "boost" | "curve" | null;

const PARAM_GUIDES: Record<
  Exclude<OpenRow, null>,
  { title: string; body: string; tip: string }
> = {
  step: {
    title: "Step size (px)",
    body: "Distance moved per single wheel click. Keep 70–110 px for calm reading, or raise to 140–200 px for long feeds.",
    tip: "Range 40–300 px · Drag or tap − / +",
  },
  time: {
    title: "Glide time (ms)",
    body: "How long each scroll impulse coasts to a halt. Shorter (180–260 ms) feels crisp in code; longer feels trackpad-soft.",
    tip: "Range 100–1000 ms · Live preview on scroll",
  },
  boost: {
    title: "Max boost (×)",
    body: "Velocity multiplier when flicking the wheel rapidly. Set 1.0× for fixed steps, or 3.0–5.0× to fly through long pages.",
    tip: "Range 1.0×–6.0× · Stacks on rapid spins",
  },
  curve: {
    title: "Deceleration curve",
    body: "Shapes how momentum brakes near the stop. OutExpo & OutQuint ease gently; OutCubic stops firmer; Linear stays flat.",
    tip: "Pick any curve pill below to switch live",
  },
};

export function MotionStagePanel({
  profile,
  activePreset,
  customPresets,
  onChangeProfile,
  onApplyPreset,
  onSaveCustomPreset,
  onDeleteCustomPreset,
  onOpenStorageFolder,
}: MotionStagePanelProps) {
  const [openRow, setOpenRow] = useState<OpenRow>(null);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [saving, setSaving] = useState(false);

  const presetMenuRef = useRef<HTMLDivElement | null>(null);
  const presetInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!presetMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (presetMenuRef.current && !presetMenuRef.current.contains(e.target as Node)) {
        setPresetMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPresetMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [presetMenuOpen]);

  const matchedCustom = customPresets.find((cp) => cp.id === activePreset);
  const presetLabel = matchedCustom
    ? matchedCustom.name
    : activePreset in PRESET_STAGE_META
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

  const openSaveMenu = () => {
    setPresetMenuOpen(true);
    window.setTimeout(() => presetInputRef.current?.focus(), 40);
  };

  const handleSavePreset = async () => {
    const trimmed = presetName.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onSaveCustomPreset(trimmed, profile);
      setPresetName("");
      setPresetMenuOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const renderCallout = (row: Exclude<OpenRow, null>) => {
    if (openRow !== row) return null;
    const guide = PARAM_GUIDES[row];
    return (
      <aside className="param-callout" role="note" aria-label={`${guide.title} usage guide`}>
        <span className="param-callout-arrow" aria-hidden="true" />
        <div className="param-callout-head">
          <span className="param-callout-title">{guide.title}</span>
          <button
            type="button"
            className="param-callout-close"
            aria-label="Close usage guide"
            onClick={() => setOpenRow(null)}
          >
            <X size={12} strokeWidth={1.6} aria-hidden="true" />
          </button>
        </div>
        <p className="param-callout-body">{guide.body}</p>
        <span className="param-callout-tip">{guide.tip}</span>
      </aside>
    );
  };

  return (
    <div className="panel-content">
      <div className="panel-header">
        <h2 className="panel-heading">
          Motion
          <br />
          tuning
        </h2>

        <div ref={presetMenuRef} className="preset-bar">
          {activePreset === "custom" && (
            <Tooltip label="Save current tuning to Documents" placement="bottom">
              <button type="button" className="panel-save-btn" onClick={openSaveMenu}>
                <Save size={12} strokeWidth={1.6} aria-hidden="true" />
                <span>Save</span>
              </button>
            </Tooltip>
          )}

          <Tooltip label="Switch or save custom presets" placement="bottom-end">
            <button
              type="button"
              className={presetMenuOpen ? "panel-tag-btn is-open" : "panel-tag-btn"}
              aria-expanded={presetMenuOpen}
              aria-haspopup="dialog"
              onClick={() => setPresetMenuOpen((v) => !v)}
            >
              <span className="panel-tag-text">{presetLabel}</span>
              <ChevronDown
                size={13}
                strokeWidth={1.6}
                aria-hidden="true"
                className={presetMenuOpen ? "cs-dropdown-chevron is-open" : "cs-dropdown-chevron"}
              />
            </button>
          </Tooltip>

          {presetMenuOpen && (
            <div className="preset-popover" role="dialog" aria-label="Preset library">
              <div className="preset-section-label">Built-in presets</div>
              <div className="preset-list">
                {PRESET_ORDER.map((id) => {
                  const meta = PRESET_STAGE_META[id];
                  const isActive = activePreset === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={isActive ? "preset-item is-selected" : "preset-item"}
                      onClick={() => {
                        onApplyPreset(id);
                        setPresetMenuOpen(false);
                      }}
                    >
                      <span>
                        {meta.line1} {meta.line2}
                      </span>
                      {isActive && (
                        <Check
                          size={13}
                          strokeWidth={2}
                          className="cs-dropdown-check"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {customPresets.length > 0 && (
                <>
                  <div className="preset-divider" />
                  <div className="preset-section-label">Custom presets</div>
                  <div className="preset-list">
                    {customPresets.map((cp) => {
                      const isActive = activePreset === cp.id;
                      return (
                        <div key={cp.id} className="preset-custom-row">
                          <button
                            type="button"
                            className={isActive ? "preset-item is-selected" : "preset-item"}
                            onClick={() => {
                              onApplyPreset(cp.id);
                              setPresetMenuOpen(false);
                            }}
                          >
                            <span className="preset-item-name">{cp.name}</span>
                            <span className="preset-item-meta mono-num">
                              {cp.profile.stepSizePx}px · {cp.profile.animationTimeMs}ms
                            </span>
                          </button>
                          <Tooltip label="Delete preset" placement="left">
                            <button
                              type="button"
                              className="preset-del-btn"
                              aria-label={`Delete ${cp.name}`}
                              onClick={() => void onDeleteCustomPreset(cp.id)}
                            >
                              <Trash2 size={12} strokeWidth={1.6} aria-hidden="true" />
                            </button>
                          </Tooltip>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <div className="preset-divider" />

              <div className="preset-save-row">
                <input
                  ref={presetInputRef}
                  type="text"
                  maxLength={32}
                  spellCheck={false}
                  autoComplete="off"
                  aria-label="New custom preset name"
                  placeholder="Save current as…"
                  className="stage-input preset-name-input"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleSavePreset();
                    }
                  }}
                />
                <button
                  type="button"
                  className="outline-pill-btn"
                  disabled={!presetName.trim() || saving}
                  onClick={() => void handleSavePreset()}
                >
                  <Plus size={13} strokeWidth={1.6} aria-hidden="true" />
                  <span>Save</span>
                </button>
              </div>

              <button
                type="button"
                className="preset-folder-btn"
                onClick={() => {
                  onOpenStorageFolder();
                  setPresetMenuOpen(false);
                }}
              >
                <FolderOpen size={13} strokeWidth={1.6} aria-hidden="true" />
                <span>Open Documents folder</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="spec-rows" data-tour="rows">
        {/* Row 1: Step size */}
        <div className={openRow === "step" ? "spec-row is-open" : "spec-row"}>
          {renderCallout("step")}
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
                <Tooltip label="Decrease by 10 px" placement="top">
                  <button
                    type="button"
                    className="step-btn"
                    aria-label="Decrease step size"
                    onClick={() => patch("stepSizePx", Math.max(40, profile.stepSizePx - 10))}
                  >
                    <Minus size={13} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </Tooltip>
                <Tooltip label="Increase by 10 px" placement="top-end">
                  <button
                    type="button"
                    className="step-btn"
                    aria-label="Increase step size"
                    onClick={() => patch("stepSizePx", Math.min(300, profile.stepSizePx + 10))}
                  >
                    <Plus size={13} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </Tooltip>
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
          {renderCallout("time")}
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
                <Tooltip label="Decrease by 30 ms" placement="top">
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
                </Tooltip>
                <Tooltip label="Increase by 30 ms" placement="top-end">
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
                </Tooltip>
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
          {renderCallout("boost")}
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
                <Tooltip label="Decrease by 0.2×" placement="top">
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
                </Tooltip>
                <Tooltip label="Increase by 0.2×" placement="top-end">
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
                </Tooltip>
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
          {renderCallout("curve")}
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
                <Tooltip label="Previous curve" placement="top">
                  <button
                    type="button"
                    className="step-btn"
                    aria-label="Previous curve"
                    onClick={() => cycleCurve(-1)}
                  >
                    <ChevronLeft size={14} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </Tooltip>
                <Tooltip label="Next curve" placement="top-end">
                  <button
                    type="button"
                    className="step-btn"
                    aria-label="Next curve"
                    onClick={() => cycleCurve(1)}
                  >
                    <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </Tooltip>
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
