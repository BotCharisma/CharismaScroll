import { useEffect, useMemo, useState } from "react";
import { Cpu, FolderOpen, Keyboard, Power, ShieldCheck } from "lucide-react";
import type { AppSettings } from "../lib/tauri";
import { StageDropdown, type DropdownOption } from "./StageDropdown";
import { Tooltip } from "./Tooltip";

interface SystemTabProps {
  settings: AppSettings;
  isAdmin: boolean;
  detectedHz: number;
  storageDir: string;
  onUpdateSettings: (next: AppSettings) => void;
  onElevate: () => void;
  onOpenStorageFolder: () => void;
}

export function SystemTab({
  settings,
  isAdmin,
  detectedHz,
  storageDir,
  onUpdateSettings,
  onElevate,
  onOpenStorageFolder,
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

  const hotkeyParts = settings.hotkey
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);

  const hzOptions = useMemo<DropdownOption[]>(
    () => [
      { value: "0", label: `Auto ${detectedHz}\u00A0Hz` },
      { value: "60", label: "60\u00A0Hz" },
      { value: "120", label: "120\u00A0Hz" },
      { value: "144", label: "144\u00A0Hz" },
      { value: "185", label: "185\u00A0Hz" },
      { value: "240", label: "240\u00A0Hz" },
      { value: "360", label: "360\u00A0Hz" },
    ],
    [detectedHz]
  );

  return (
    <div className="panel-content">
      <div className="panel-header">
        <h2 className="panel-heading">
          System
          <br />
          core
        </h2>
        <div className="header-actions">
          <Tooltip
            label={storageDir ? `Open ${storageDir}` : "Open Documents\\CharismaScroll"}
            placement="bottom-end"
          >
            <button
              type="button"
              className="panel-tag-btn"
              onClick={onOpenStorageFolder}
              aria-label="Open config and presets folder in Documents"
            >
              <FolderOpen size={13} strokeWidth={1.6} aria-hidden="true" />
              <span>Documents</span>
            </button>
          </Tooltip>
          <span className="panel-tag">{isAdmin ? "Admin mode" : "Standard"}</span>
        </div>
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
                <Tooltip label="Smooth scroll inside Task Manager & admin apps" placement="top-end">
                  <button type="button" className="outline-pill-btn" onClick={onElevate}>
                    <span>Run as Admin</span>
                  </button>
                </Tooltip>
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
                <Tooltip label="Start via Task Scheduler without UAC prompt" placement="top">
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
                </Tooltip>
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
              <Tooltip label="Keep native precision touchpad gestures" placement="top">
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
              </Tooltip>
              <Tooltip label="Stop glide immediately when holding Ctrl/Alt" placement="top-end">
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
              </Tooltip>
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
              <Tooltip label="Click to record global toggle shortcut" placement="top">
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
              </Tooltip>

              <StageDropdown
                id="sync-hz-select"
                ariaLabel="Target refresh rate"
                value={String(settings.targetFps)}
                options={hzOptions}
                direction="up"
                mono
                minWidthClass="cs-dropdown-hz"
                onChange={(val) =>
                  onUpdateSettings({ ...settings, targetFps: Number(val) })
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
