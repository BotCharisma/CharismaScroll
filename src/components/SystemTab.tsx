import { useEffect, useState } from "react";
import { Cpu, Keyboard, Power, ShieldCheck } from "lucide-react";
import type { AppSettings } from "../lib/tauri";

interface SystemTabProps {
  settings: AppSettings;
  isAdmin: boolean;
  detectedHz: number;
  onUpdateSettings: (next: AppSettings) => void;
  onElevate: () => void;
}

export function SystemTab({
  settings,
  isAdmin,
  detectedHz,
  onUpdateSettings,
  onElevate,
}: SystemTabProps) {
  const [recordingHotkey, setRecordingHotkey] = useState(false);

  useEffect(() => {
    if (!recordingHotkey) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecordingHotkey(false);
        return;
      }
      if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;

      const mods: string[] = [];
      if (e.ctrlKey) mods.push("Ctrl");
      if (e.altKey) mods.push("Alt");
      if (e.shiftKey) mods.push("Shift");
      if (mods.length === 0) return;

      mods.push(e.key.toUpperCase());
      onUpdateSettings({ ...settings, hotkey: mods.join("+") });
      setRecordingHotkey(false);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recordingHotkey, settings, onUpdateSettings]);

  const hotkeyParts = settings.hotkey.split("+").map((p) => p.trim()).filter(Boolean);

  return (
    <div className="panel-content">
      <div className="panel-header">
        <h2 className="panel-heading">
          System
          <br />
          core
        </h2>
        <span className="panel-tag">{isAdmin ? "Admin mode" : "Standard"}</span>
      </div>

      <div className="spec-rows">
        {/* Row 1: Privilege (UIPI) */}
        <div className="spec-row">
          <div className="spec-row-main">
            <div className="spec-label-btn">
              <span className="spec-glyph" aria-hidden="true">
                <ShieldCheck size={15} strokeWidth={1.5} />
              </span>
              <span>Admin windows</span>
            </div>

            <div className="spec-controls">
              {isAdmin ? (
                <span className="spec-value">Active</span>
              ) : (
                <button type="button" className="outline-pill-btn" onClick={onElevate}>
                  <span>Run as Admin</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Windows Startup */}
        <div className="spec-row">
          <div className="spec-row-main">
            <label htmlFor="sw-autostart" className="spec-label-btn">
              <span className="spec-glyph" aria-hidden="true">
                <Power size={15} strokeWidth={1.5} />
              </span>
              <span>Launch at sign-in</span>
            </label>

            <div className="spec-controls">
              {isAdmin && settings.startWithWindows && (
                <button
                  type="button"
                  className="pill-choice"
                  aria-pressed={settings.startAsAdmin}
                  onClick={() =>
                    onUpdateSettings({ ...settings, startAsAdmin: !settings.startAsAdmin })
                  }
                >
                  No-UAC
                </button>
              )}
              <button
                id="sw-autostart"
                type="button"
                role="switch"
                aria-checked={settings.startWithWindows}
                className="switch-capsule"
                onClick={() =>
                  onUpdateSettings({
                    ...settings,
                    startWithWindows: !settings.startWithWindows,
                  })
                }
              >
                <span className="switch-dot" />
              </button>
            </div>
          </div>
        </div>

        {/* Row 3: Smart Input Guards */}
        <div className="spec-row">
          <div className="spec-row-main">
            <div className="spec-label-btn">
              <span className="spec-glyph" aria-hidden="true">
                <Cpu size={15} strokeWidth={1.5} />
              </span>
              <span>Input guards</span>
            </div>

            <div className="spec-controls">
              <button
                type="button"
                className="pill-choice"
                aria-pressed={settings.bypassTouchpad}
                onClick={() =>
                  onUpdateSettings({ ...settings, bypassTouchpad: !settings.bypassTouchpad })
                }
              >
                Touchpad
              </button>
              <button
                type="button"
                className="pill-choice"
                aria-pressed={settings.passthroughCtrlAlt}
                onClick={() =>
                  onUpdateSettings({
                    ...settings,
                    passthroughCtrlAlt: !settings.passthroughCtrlAlt,
                  })
                }
              >
                Ctrl+Zoom
              </button>
            </div>
          </div>
        </div>

        {/* Row 4: Shortcut & Sync Rate */}
        <div className="spec-row">
          <div className="spec-row-main">
            <div className="spec-label-btn">
              <span className="spec-glyph" aria-hidden="true">
                <Keyboard size={15} strokeWidth={1.5} />
              </span>
              <span>Toggle &amp; sync</span>
            </div>

            <div className="spec-controls">
              <button
                type="button"
                className="outline-pill-btn"
                aria-pressed={recordingHotkey}
                aria-live="polite"
                onClick={() => setRecordingHotkey((v) => !v)}
              >
                {recordingHotkey ? (
                  <span>Press keys…</span>
                ) : (
                  <span className="keycap-badge" translate="no">
                    {hotkeyParts.map((k) => (
                      <kbd key={k} className="mono-num">
                        {k}
                      </kbd>
                    ))}
                  </span>
                )}
              </button>

              <select
                id="sync-hz-select"
                name="targetFps"
                aria-label="Target refresh rate"
                className="stage-select mono-num"
                value={settings.targetFps}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, targetFps: Number(e.target.value) })
                }
              >
                <option value={0}>
                  Auto {detectedHz}
                  {"\u00A0"}Hz
                </option>
                <option value={60}>60{"\u00A0"}Hz</option>
                <option value={120}>120{"\u00A0"}Hz</option>
                <option value={144}>144{"\u00A0"}Hz</option>
                <option value={185}>185{"\u00A0"}Hz</option>
                <option value={240}>240{"\u00A0"}Hz</option>
                <option value={360}>360{"\u00A0"}Hz</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
