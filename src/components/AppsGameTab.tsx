import { useEffect, useState } from "react";
import { Gamepad2, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import {
  getRunningApps,
  type AppRule,
  type AppRuleMode,
  type RunningAppInfo,
  type ScrollProfile,
} from "../lib/tauri";

interface AppsGameTabProps {
  gameModeFullscreen: boolean;
  onToggleGameMode: () => void;
  appRules: AppRule[];
  globalProfile: ScrollProfile;
  onChangeRules: (rules: AppRule[]) => void;
}

export function AppsGameTab({
  gameModeFullscreen,
  onToggleGameMode,
  appRules,
  globalProfile,
  onChangeRules,
}: AppsGameTabProps) {
  const [runningApps, setRunningApps] = useState<RunningAppInfo[]>([]);
  const [selectedExe, setSelectedExe] = useState("");
  const [manualExe, setManualExe] = useState("");
  const [deletedRule, setDeletedRule] = useState<{ rule: AppRule; index: number } | null>(null);

  const loadRunning = async () => {
    const list = await getRunningApps();
    setRunningApps(list);
  };

  useEffect(() => {
    void loadRunning();
  }, []);

  const addRule = (exeRaw: string, displayRaw?: string) => {
    let exe = exeRaw.trim();
    if (!exe) return;
    if (!exe.toLowerCase().endsWith(".exe")) exe = `${exe}.exe`;
    if (appRules.some((r) => r.exeName.toLowerCase() === exe.toLowerCase())) {
      setSelectedExe("");
      setManualExe("");
      return;
    }
    const displayName =
      displayRaw && displayRaw.trim().length > 0
        ? displayRaw.trim()
        : exe.replace(/\.exe$/i, "");

    onChangeRules([
      {
        exeName: exe,
        displayName,
        mode: "Disabled",
        profile: { ...globalProfile },
      },
      ...appRules,
    ]);
    setSelectedExe("");
    setManualExe("");
    setDeletedRule(null);
  };

  const handleAdd = () => {
    if (manualExe.trim()) {
      addRule(manualExe);
      return;
    }
    if (selectedExe) {
      const match = runningApps.find((a) => a.exeName === selectedExe);
      addRule(selectedExe, match?.displayName);
    }
  };

  const updateRule = (exeName: string, updater: (r: AppRule) => AppRule) => {
    onChangeRules(appRules.map((r) => (r.exeName === exeName ? updater(r) : r)));
  };

  const removeRule = (exeName: string) => {
    const idx = appRules.findIndex((r) => r.exeName === exeName);
    if (idx === -1) return;
    setDeletedRule({ rule: appRules[idx], index: idx });
    onChangeRules(appRules.filter((r) => r.exeName !== exeName));
  };

  const undoRemove = () => {
    if (!deletedRule) return;
    const next = [...appRules];
    next.splice(Math.min(deletedRule.index, next.length), 0, deletedRule.rule);
    onChangeRules(next);
    setDeletedRule(null);
  };

  return (
    <div className="panel-content">
      <div className="panel-header">
        <h2 className="panel-heading">
          App
          <br />
          profiles
        </h2>
        <span className="panel-tag tabular-num">
          {appRules.length} {appRules.length === 1 ? "rule" : "rules"}
        </span>
      </div>

      <div className="spec-rows">
        <div className="spec-row">
          <div className="spec-row-main">
            <label htmlFor="sw-game-mode" className="spec-label-btn">
              <span className="spec-glyph" aria-hidden="true">
                <Gamepad2 size={15} strokeWidth={1.5} />
              </span>
              <span>Fullscreen game pause</span>
            </label>
            <button
              id="sw-game-mode"
              type="button"
              role="switch"
              aria-checked={gameModeFullscreen}
              className="switch-capsule"
              onClick={onToggleGameMode}
            >
              <span className="switch-dot" />
            </button>
          </div>
        </div>
      </div>

      <div className="compact-add-bar">
        <select
          id="open-app-select"
          name="openApp"
          aria-label="Select running application"
          className="stage-select"
          value={selectedExe}
          onChange={(e) => {
            setSelectedExe(e.target.value);
            if (e.target.value) setManualExe("");
          }}
        >
          <option value="">Running window…</option>
          {runningApps.map((app) => (
            <option key={app.exeName} value={app.exeName}>
              {app.displayName} ({app.exeName})
            </option>
          ))}
        </select>

        <input
          id="exe-input"
          name="manualExe"
          type="text"
          autoComplete="off"
          spellCheck={false}
          aria-label="Executable filename"
          placeholder="or figma.exe…"
          className="stage-input"
          value={manualExe}
          onChange={(e) => setManualExe(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
        />

        <button
          type="button"
          className="step-btn"
          aria-label="Refresh running windows"
          title="Refresh running windows"
          onClick={() => void loadRunning()}
        >
          <RefreshCw size={13} strokeWidth={1.5} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="outline-pill-btn"
          disabled={!selectedExe && !manualExe.trim()}
          onClick={handleAdd}
        >
          <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
          <span>Add</span>
        </button>
      </div>

      {deletedRule && (
        <div className="undo-toast" aria-live="polite">
          <span>
            Removed{" "}
            <bdi className="mono-num" translate="no">
              {deletedRule.rule.exeName}
            </bdi>
          </span>
          <button type="button" className="outline-pill-btn" onClick={undoRemove}>
            <RotateCcw size={12} strokeWidth={1.5} aria-hidden="true" />
            <span>Undo</span>
          </button>
        </div>
      )}

      {appRules.length === 0 ? (
        <p className="empty-note">All Windows apps currently follow your active stage preset</p>
      ) : (
        <div className="apps-scroll-list">
          {appRules.map((rule) => (
            <div key={rule.exeName} className="app-rule-row">
              <div className="app-rule-top">
                <div className="app-identity">
                  <span className="app-title">{rule.displayName}</span>
                  <bdi className="app-exe" translate="no">
                    {rule.exeName}
                  </bdi>
                </div>

                <div className="spec-controls">
                  <button
                    type="button"
                    className="pill-choice"
                    aria-pressed={rule.mode === "Custom"}
                    onClick={() =>
                      updateRule(rule.exeName, (r) => ({
                        ...r,
                        mode: ("Disabled" === r.mode ? "Custom" : "Disabled") as AppRuleMode,
                      }))
                    }
                  >
                    {rule.mode === "Disabled" ? "Bypassed" : "Custom"}
                  </button>

                  <button
                    type="button"
                    className="step-btn"
                    aria-label={`Remove ${rule.exeName}`}
                    title="Remove rule"
                    onClick={() => removeRule(rule.exeName)}
                  >
                    <Trash2 size={13} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </div>
              </div>

              {rule.mode === "Custom" && (
                <div className="app-inline-tune">
                  <label htmlFor={`px-${rule.exeName}`} className="app-exe">
                    px
                  </label>
                  <input
                    id={`px-${rule.exeName}`}
                    name={`px-${rule.exeName}`}
                    type="number"
                    inputMode="numeric"
                    autoComplete="off"
                    min={40}
                    max={300}
                    step={5}
                    className="mini-num-input"
                    value={rule.profile.stepSizePx}
                    onChange={(e) =>
                      updateRule(rule.exeName, (r) => ({
                        ...r,
                        profile: { ...r.profile, stepSizePx: Number(e.target.value) || 90 },
                      }))
                    }
                  />
                  <label htmlFor={`ms-${rule.exeName}`} className="app-exe">
                    ms
                  </label>
                  <input
                    id={`ms-${rule.exeName}`}
                    name={`ms-${rule.exeName}`}
                    type="number"
                    inputMode="numeric"
                    autoComplete="off"
                    min={100}
                    max={1000}
                    step={10}
                    className="mini-num-input"
                    value={rule.profile.animationTimeMs}
                    onChange={(e) =>
                      updateRule(rule.exeName, (r) => ({
                        ...r,
                        profile: { ...r.profile, animationTimeMs: Number(e.target.value) || 240 },
                      }))
                    }
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
