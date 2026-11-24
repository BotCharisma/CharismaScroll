import { COPY, type Lang } from "../lib/i18n";
import {
  PRESET_PROFILES,
  type EasingCurve,
  type ScrollProfile,
} from "../lib/tauri";

interface ScrollStudioTabProps {
  profile: ScrollProfile;
  activePreset: string;
  onSelectPreset: (presetId: string) => void;
  onChangeProfile: (next: ScrollProfile) => void;
  lang: Lang;
}

const PRESET_IDS = ["classic", "macbook", "coding", "cinema"] as const;
const CURVE_OPTIONS: { id: EasingCurve; label: string }[] = [
  { id: "OutQuint", label: "OutQuint" },
  { id: "OutExpo", label: "OutExpo" },
  { id: "OutCubic", label: "OutCubic" },
  { id: "OutQuart", label: "OutQuart" },
  { id: "Linear", label: "Linear" },
];

export function ScrollStudioTab({
  profile,
  activePreset,
  onSelectPreset,
  onChangeProfile,
  lang,
}: ScrollStudioTabProps) {
  const t = COPY[lang].scrollTab;

  const updateField = <K extends keyof ScrollProfile>(key: K, value: ScrollProfile[K]) => {
    onChangeProfile({ ...profile, [key]: value });
  };

  return (
    <div className="controls-pane">
      <div className="pane-header">
        <h1 className="pane-title">{t.title}</h1>
        <p className="pane-lead">{t.lead}</p>
      </div>

      <section className="section-block" aria-labelledby="presets-heading">
        <div className="section-heading-row">
          <h2 id="presets-heading" className="section-title">
            {t.presetsTitle}
          </h2>
          <p className="section-hint">{t.presetsHint}</p>
        </div>

        <div className="preset-grid">
          {PRESET_IDS.map((id) => {
            const p = PRESET_PROFILES[id];
            const isSelected = activePreset === id;
            return (
              <button
                key={id}
                type="button"
                className="preset-btn"
                aria-pressed={isSelected}
                onClick={() => onSelectPreset(id)}
              >
                <span className="preset-name" translate="no">
                  {t.presetNames[id]}
                </span>
                <span className="preset-meta">
                  {p.stepSizePx}
                  {"\u00A0"}px / {p.animationTimeMs}
                  {"\u00A0"}ms / {p.easing}
                </span>
                <span className="section-hint">{t.presetDescs[id]}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="section-block" aria-labelledby="physics-heading">
        <h2 id="physics-heading" className="section-title">
          {t.physicsTitle}
        </h2>

        <div className="slider-stack">
          <div className="slider-row">
            <div className="slider-top">
              <label htmlFor="slider-step-size" className="slider-label">
                {t.stepSize}
              </label>
              <span className="slider-value">
                {profile.stepSizePx}
                {"\u00A0"}px
              </span>
            </div>
            <input
              id="slider-step-size"
              name="stepSizePx"
              type="range"
              min={40}
              max={300}
              step={5}
              value={profile.stepSizePx}
              onChange={(e) => updateField("stepSizePx", Number(e.target.value))}
              className="range-input"
            />
            <div className="ruler-ticks" aria-hidden="true">
              <span>40{"\u00A0"}px</span>
              <span>110{"\u00A0"}px</span>
              <span>200{"\u00A0"}px</span>
              <span>300{"\u00A0"}px</span>
            </div>
          </div>

          <div className="slider-row">
            <div className="slider-top">
              <label htmlFor="slider-anim-time" className="slider-label">
                {t.animTime}
              </label>
              <span className="slider-value">
                {profile.animationTimeMs}
                {"\u00A0"}ms
              </span>
            </div>
            <input
              id="slider-anim-time"
              name="animationTimeMs"
              type="range"
              min={100}
              max={1000}
              step={10}
              value={profile.animationTimeMs}
              onChange={(e) => updateField("animationTimeMs", Number(e.target.value))}
              className="range-input"
            />
            <div className="ruler-ticks" aria-hidden="true">
              <span>100{"\u00A0"}ms</span>
              <span>400{"\u00A0"}ms</span>
              <span>700{"\u00A0"}ms</span>
              <span>1000{"\u00A0"}ms</span>
            </div>
          </div>

          <div className="slider-row">
            <div className="slider-top">
              <label htmlFor="slider-accel-max" className="slider-label">
                {t.accelMax}
              </label>
              <span className="slider-value">{profile.accelerationMax.toFixed(1)}×</span>
            </div>
            <input
              id="slider-accel-max"
              name="accelerationMax"
              type="range"
              min={1.0}
              max={6.0}
              step={0.1}
              value={profile.accelerationMax}
              onChange={(e) => updateField("accelerationMax", Number(e.target.value))}
              className="range-input"
            />
            <div className="ruler-ticks" aria-hidden="true">
              <span>1.0×</span>
              <span>2.5×</span>
              <span>4.5×</span>
              <span>6.0×</span>
            </div>
          </div>

          <div className="slider-row">
            <div className="slider-top">
              <label htmlFor="slider-accel-delta" className="slider-label">
                {t.accelDelta}
              </label>
              <span className="slider-value">
                {profile.accelerationDeltaMs}
                {"\u00A0"}ms
              </span>
            </div>
            <input
              id="slider-accel-delta"
              name="accelerationDeltaMs"
              type="range"
              min={20}
              max={150}
              step={5}
              value={profile.accelerationDeltaMs}
              onChange={(e) => updateField("accelerationDeltaMs", Number(e.target.value))}
              className="range-input"
            />
            <div className="ruler-ticks" aria-hidden="true">
              <span>20{"\u00A0"}ms</span>
              <span>60{"\u00A0"}ms</span>
              <span>100{"\u00A0"}ms</span>
              <span>150{"\u00A0"}ms</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section-block" aria-labelledby="easing-heading">
        <h2 id="easing-heading" className="section-title">
          {t.easingTitle}
        </h2>
        <div className="curve-grid" role="group" aria-labelledby="easing-heading">
          {CURVE_OPTIONS.map((curve) => (
            <button
              key={curve.id}
              type="button"
              className="curve-btn"
              aria-pressed={profile.easing === curve.id}
              onClick={() => updateField("easing", curve.id)}
            >
              <span translate="no">{curve.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="section-block" aria-labelledby="behavior-heading">
        <h2 id="behavior-heading" className="section-title">
          {t.behaviorTitle}
        </h2>

        <div className="switch-list">
          <div className="switch-row">
            <div className="switch-text">
              <label htmlFor="sw-rev-v" className="switch-label">
                {t.reverseVertical}
              </label>
              <p className="switch-desc">{t.reverseVerticalDesc}</p>
            </div>
            <button
              id="sw-rev-v"
              type="button"
              role="switch"
              aria-checked={profile.reverseVertical}
              className="toggle-pill"
              onClick={() => updateField("reverseVertical", !profile.reverseVertical)}
            >
              <span className="toggle-thumb" />
            </button>
          </div>

          <div className="switch-row">
            <div className="switch-text">
              <label htmlFor="sw-horiz" className="switch-label">
                {t.horizontalSmooth}
              </label>
              <p className="switch-desc">{t.horizontalSmoothDesc}</p>
            </div>
            <button
              id="sw-horiz"
              type="button"
              role="switch"
              aria-checked={profile.horizontalSmooth}
              className="toggle-pill"
              onClick={() => updateField("horizontalSmooth", !profile.horizontalSmooth)}
            >
              <span className="toggle-thumb" />
            </button>
          </div>

          <div className="switch-row">
            <div className="switch-text">
              <label htmlFor="sw-shift-horiz" className="switch-label">
                {t.shiftHorizontal}
              </label>
              <p className="switch-desc">{t.shiftHorizontalDesc}</p>
            </div>
            <button
              id="sw-shift-horiz"
              type="button"
              role="switch"
              aria-checked={profile.shiftWheelHorizontal}
              className="toggle-pill"
              onClick={() => updateField("shiftWheelHorizontal", !profile.shiftWheelHorizontal)}
            >
              <span className="toggle-thumb" />
            </button>
          </div>

          <div className="switch-row">
            <div className="switch-text">
              <label htmlFor="sw-rev-h" className="switch-label">
                {t.reverseHorizontal}
              </label>
              <p className="switch-desc">{t.reverseHorizontalDesc}</p>
            </div>
            <button
              id="sw-rev-h"
              type="button"
              role="switch"
              aria-checked={profile.reverseHorizontal}
              className="toggle-pill"
              onClick={() => updateField("reverseHorizontal", !profile.reverseHorizontal)}
            >
              <span className="toggle-thumb" />
            </button>
          </div>

          <div className="switch-row">
            <div className="switch-text">
              <label htmlFor="sw-stop-rev" className="switch-label">
                {t.stopOnReverse}
              </label>
              <p className="switch-desc">{t.stopOnReverseDesc}</p>
            </div>
            <button
              id="sw-stop-rev"
              type="button"
              role="switch"
              aria-checked={profile.stopOnReverse}
              className="toggle-pill"
              onClick={() => updateField("stopOnReverse", !profile.stopOnReverse)}
            >
              <span className="toggle-thumb" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
