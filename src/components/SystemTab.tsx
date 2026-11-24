import { useEffect, useState } from "react";
import { Keyboard, RotateCcw, Shield, ShieldCheck } from "lucide-react";
import { COPY, type Lang } from "../lib/i18n";
import type { AppSettings } from "../lib/tauri";

interface SystemTabProps {
  settings: AppSettings;
  isAdmin: boolean;
  detectedHz: number;
  onUpdateSettings: (next: AppSettings) => void;
  onElevate: () => void;
  onResetDefaults: () => void;
  lang: Lang;
}

export function SystemTab({
  settings,
  isAdmin,
  detectedHz,
  onUpdateSettings,
  onElevate,
  onResetDefaults,
  lang,
}: SystemTabProps) {
  const t = COPY[lang].systemTab;
  const [recordingHotkey, setRecordingHotkey] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    if (!recordingHotkey) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecordingHotkey(false);
        return;
      }
      const ignored = ["Control", "Alt", "Shift", "Meta"];
      if (ignored.includes(e.key)) return;

      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      if (parts.length === 0) return; // Require at least one modifier key

      const mainKey = e.key.length === 1 ? e.key.toUpperCase() : e.key.toUpperCase();
      parts.push(mainKey);
      onUpdateSettings({ ...settings, hotkey: parts.join("+") });
      setRecordingHotkey(false);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recordingHotkey, settings, onUpdateSettings]);

  const hotkeyParts = settings.hotkey.split("+").map((p) => p.trim()).filter(Boolean);

  return (
    <div className="controls-pane">
      <div className="pane-header">
        <h1 className="pane-title">{t.title}</h1>
        <p className="pane-lead">{t.lead}</p>
      </div>

      <section className="section-block" aria-labelledby="admin-heading">
        <h2 id="admin-heading" className="section-title">
          {t.adminTitle}
        </h2>

        <div className="status-banner">
          <div className="switch-text">
            <span className={isAdmin ? "status-pill" : "status-pill is-muted"}>
              {isAdmin ? (
                <ShieldCheck size={14} strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <Shield size={14} strokeWidth={1.5} aria-hidden="true" />
              )}
              <span>{isAdmin ? t.adminElevated : t.adminUser}</span>
            </span>
            <p className="switch-desc">{t.adminDesc}</p>
          </div>

          {!isAdmin && (
            <button type="button" className="btn-primary" onClick={onElevate}>
              <Shield size={16} strokeWidth={1.5} aria-hidden="true" />
              <span>{t.elevateButton}</span>
            </button>
          )}
        </div>
      </section>

      <section className="section-block" aria-labelledby="startup-heading">
        <h2 id="startup-heading" className="section-title">
          {t.startupTitle}
        </h2>

        <div className="switch-list">
          <div className="switch-row">
            <div className="switch-text">
              <label htmlFor="sw-autostart" className="switch-label">
                {t.startWithWin}
              </label>
              <p className="switch-desc">{t.startWithWinDesc}</p>
            </div>
            <button
              id="sw-autostart"
              type="button"
              role="switch"
              aria-checked={settings.startWithWindows}
              className="toggle-pill"
              onClick={() =>
                onUpdateSettings({
                  ...settings,
                  startWithWindows: !settings.startWithWindows,
                })
              }
            >
              <span className="toggle-thumb" />
            </button>
          </div>

          <div className="switch-row">
            <div className="switch-text">
              <label htmlFor="sw-start-admin" className="switch-label">
                {t.startAsAdmin}
              </label>
              <p className="switch-desc">{t.startAsAdminDesc}</p>
            </div>
            <button
              id="sw-start-admin"
              type="button"
              role="switch"
              disabled={!isAdmin || !settings.startWithWindows}
              aria-checked={settings.startAsAdmin}
              className="toggle-pill"
              onClick={() =>
                onUpdateSettings({
                  ...settings,
                  startAsAdmin: !settings.startAsAdmin,
                })
              }
            >
              <span className="toggle-thumb" />
            </button>
          </div>
        </div>
      </section>

      <section className="section-block" aria-labelledby="input-heading">
        <h2 id="input-heading" className="section-title">
          {t.inputTitle}
        </h2>

        <div className="switch-list">
          <div className="switch-row">
            <div className="switch-text">
              <span className="switch-label">{t.hotkeyLabel}</span>
              <p className="switch-desc">{t.hotkeyDesc}</p>
            </div>
            <div className="rule-actions">
              <span className="keycap-group" translate="no">
                {hotkeyParts.map((part) => (
                  <kbd key={part} className="keycap">
                    {part}
                  </kbd>
                ))}
              </span>
              <button
                type="button"
                className="btn-secondary"
                aria-pressed={recordingHotkey}
                aria-live="polite"
                onClick={() => setRecordingHotkey((v) => !v)}
              >
                <Keyboard size={16} strokeWidth={1.5} aria-hidden="true" />
                <span>{recordingHotkey ? t.hotkeyListening : t.hotkeyRecord}</span>
              </button>
            </div>
          </div>

          <div className="switch-row">
            <div className="switch-text">
              <label htmlFor="sw-bypass-touchpad" className="switch-label">
                {t.bypassTouchpad}
              </label>
              <p className="switch-desc">{t.bypassTouchpadDesc}</p>
            </div>
            <button
              id="sw-bypass-touchpad"
              type="button"
              role="switch"
              aria-checked={settings.bypassTouchpad}
              className="toggle-pill"
              onClick={() =>
                onUpdateSettings({
                  ...settings,
                  bypassTouchpad: !settings.bypassTouchpad,
                })
              }
            >
              <span className="toggle-thumb" />
            </button>
          </div>

          <div className="switch-row">
            <div className="switch-text">
              <label htmlFor="sw-passthrough" className="switch-label">
                {t.passthroughCtrlAlt}
              </label>
              <p className="switch-desc">{t.passthroughCtrlAltDesc}</p>
            </div>
            <button
              id="sw-passthrough"
              type="button"
              role="switch"
              aria-checked={settings.passthroughCtrlAlt}
              className="toggle-pill"
              onClick={() =>
                onUpdateSettings({
                  ...settings,
                  passthroughCtrlAlt: !settings.passthroughCtrlAlt,
                })
              }
            >
              <span className="toggle-thumb" />
            </button>
          </div>

          <div className="switch-row">
            <div className="switch-text">
              <label htmlFor="fps-select" className="switch-label">
                {t.fpsLabel}
              </label>
            </div>
            <select
              id="fps-select"
              name="targetFps"
              className="select-input mono-num"
              value={settings.targetFps}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  targetFps: Number(e.target.value),
                })
              }
            >
              <option value={0}>
                {t.fpsAuto} ({detectedHz}{"\u00A0"}Hz)
              </option>
              <option value={60}>60{"\u00A0"}Hz</option>
              <option value={120}>120{"\u00A0"}Hz</option>
              <option value={144}>144{"\u00A0"}Hz</option>
              <option value={165}>165{"\u00A0"}Hz</option>
              <option value={240}>240{"\u00A0"}Hz</option>
              <option value={360}>360{"\u00A0"}Hz</option>
            </select>
          </div>
        </div>
      </section>

      <section className="section-block" aria-labelledby="reset-heading">
        <div className="switch-row">
          <h2 id="reset-heading" className="section-title">
            {t.resetTitle}
          </h2>
          {!confirmingReset ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setConfirmingReset(true)}
            >
              <RotateCcw size={16} strokeWidth={1.5} aria-hidden="true" />
              <span>{t.resetButton}</span>
            </button>
          ) : (
            <div className="rule-actions">
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  onResetDefaults();
                  setConfirmingReset(false);
                }}
              >
                <span>{t.resetConfirm}</span>
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setConfirmingReset(false)}
              >
                <span>{t.resetCancel}</span>
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
