import { useEffect, useState } from "react";
import { Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { COPY, type Lang } from "../lib/i18n";
import {
  getRunningApps,
  type AppRule,
  type AppRuleMode,
  type EasingCurve,
  type RunningAppInfo,
  type ScrollProfile,
} from "../lib/tauri";

interface AppsGameTabProps {
  gameModeFullscreen: boolean;
  onToggleGameMode: () => void;
  appRules: AppRule[];
  globalProfile: ScrollProfile;
  onChangeRules: (rules: AppRule[]) => void;
  lang: Lang;
}

export function AppsGameTab({
  gameModeFullscreen,
  onToggleGameMode,
  appRules,
  globalProfile,
  onChangeRules,
  lang,
}: AppsGameTabProps) {
  const t = COPY[lang].appsTab;
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
    if (!exe.toLowerCase().endsWith(".exe")) {
      exe = `${exe}.exe`;
    }
    if (appRules.some((r) => r.exeName.toLowerCase() === exe.toLowerCase())) {
      setSelectedExe("");
      setManualExe("");
      return;
    }
    const displayName =
      displayRaw && displayRaw.trim().length > 0
        ? displayRaw.trim()
        : exe.replace(/\.exe$/i, "");

    const newRule: AppRule = {
      exeName: exe,
      displayName,
      mode: "Disabled",
      profile: { ...globalProfile },
    };
    onChangeRules([newRule, ...appRules]);
    setSelectedExe("");
    setManualExe("");
    setDeletedRule(null);
  };

  const handleAddSubmit = () => {
    if (manualExe.trim()) {
      addRule(manualExe);
      return;
    }
    if (selectedExe) {
      const match = runningApps.find((a) => a.exeName === selectedExe);
      addRule(selectedExe, match?.displayName);
    }
  };

  const updateRule = (exeName: string, updater: (rule: AppRule) => AppRule) => {
    onChangeRules(appRules.map((r) => (r.exeName === exeName ? updater(r) : r)));
  };

  const removeRule = (exeName: string) => {
    const idx = appRules.findIndex((r) => r.exeName === exeName);
    if (idx === -1) return;
    const removed = appRules[idx];
    setDeletedRule({ rule: removed, index: idx });
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
    <div className="controls-pane">
      <div className="pane-header">
        <h1 className="pane-title">{t.title}</h1>
        <p className="pane-lead">{t.lead}</p>
      </div>

      <section className="section-block" aria-labelledby="gamemode-heading">
        <h2 id="gamemode-heading" className="section-title">
          {t.gameModeHeading}
        </h2>
        <div className="switch-row">
          <div className="switch-text">
            <label htmlFor="sw-game-mode" className="switch-label">
              {t.gameMode}
            </label>
            <p className="switch-desc">{t.gameModeDesc}</p>
          </div>
          <button
            id="sw-game-mode"
            type="button"
            role="switch"
            aria-checked={gameModeFullscreen}
            className="toggle-pill"
            onClick={onToggleGameMode}
          >
            <span className="toggle-thumb" />
          </button>
        </div>
      </section>

      <section className="section-block" aria-labelledby="add-rule-heading">
        <h2 id="add-rule-heading" className="section-title">
          {t.addTitle}
        </h2>

        <div className="field-row">
          <select
            id="running-app-select"
            name="runningApp"
            aria-label={t.runningSelectLabel}
            className="select-input"
            value={selectedExe}
            onChange={(e) => {
              setSelectedExe(e.target.value);
              if (e.target.value) setManualExe("");
            }}
          >
            <option value="">{t.runningPlaceholder}</option>
            {runningApps.map((app) => (
              <option key={app.exeName} value={app.exeName}>
                {app.displayName} ({app.exeName})
              </option>
            ))}
          </select>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => void loadRunning()}
            aria-label={t.refreshRunning}
          >
            <RefreshCw size={16} strokeWidth={1.5} aria-hidden="true" />
            <span>{t.refreshRunning}</span>
          </button>
        </div>

        <div className="field-row">
          <input
            id="manual-exe-input"
            name="manualExe"
            type="text"
            autoComplete="off"
            spellCheck={false}
            aria-label={t.manualPlaceholder}
            placeholder={t.manualPlaceholder}
            className="text-input"
            value={manualExe}
            onChange={(e) => setManualExe(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddSubmit();
              }
            }}
          />

          <button
            type="button"
            className="btn-primary"
            disabled={!selectedExe && !manualExe.trim()}
            onClick={handleAddSubmit}
          >
            <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
            <span>{t.addButton}</span>
          </button>
        </div>
      </section>

      <section className="section-block" aria-labelledby="rules-list-heading">
        <h2 id="rules-list-heading" className="section-title">
          {t.rulesTitle}
        </h2>

        {deletedRule && (
          <div className="status-banner" aria-live="polite">
            <span>
              {t.undoDeleted}{" "}
              <bdi className="mono-num" translate="no">
                {deletedRule.rule.exeName}
              </bdi>
            </span>
            <button type="button" className="btn-secondary" onClick={undoRemove}>
              <RotateCcw size={15} strokeWidth={1.5} aria-hidden="true" />
              <span>{t.undoAction}</span>
            </button>
          </div>
        )}

        {appRules.length === 0 ? (
          <div className="empty-well">
            <span className="rule-name">{t.emptyTitle}</span>
            <p className="switch-desc">{t.emptyDesc}</p>
          </div>
        ) : (
          <div className="rules-list">
            {appRules.map((rule) => (
              <div key={rule.exeName} className="rule-item">
                <div className="rule-main">
                  <div className="rule-identity">
                    <span className="rule-name">{rule.displayName}</span>
                    <bdi className="rule-exe" translate="no">
                      {rule.exeName}
                    </bdi>
                  </div>

                  <div className="rule-actions">
                    <select
                      name={`mode-${rule.exeName}`}
                      aria-label={`${t.modeLabel} ${rule.displayName}`}
                      className="select-input"
                      value={rule.mode}
                      onChange={(e) =>
                        updateRule(rule.exeName, (prev) => ({
                          ...prev,
                          mode: e.target.value as AppRuleMode,
                        }))
                      }
                    >
                      <option value="Disabled">{t.modeDisabled}</option>
                      <option value="Custom">{t.modeCustom}</option>
                    </select>

                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`${t.removeRule} ${rule.exeName}`}
                      title={t.removeRule}
                      onClick={() => removeRule(rule.exeName)}
                    >
                      <Trash2 size={16} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {rule.mode === "Custom" && (
                  <div className="rule-custom-well">
                    <div className="mini-field">
                      <label htmlFor={`step-${rule.exeName}`} className="mini-label">
                        {t.customStep}
                      </label>
                      <input
                        id={`step-${rule.exeName}`}
                        name={`step-${rule.exeName}`}
                        autoComplete="off"
                        type="number"
                        inputMode="numeric"
                        min={40}
                        max={300}
                        step={5}
                        className="text-input mono-num"
                        value={rule.profile.stepSizePx}
                        onChange={(e) =>
                          updateRule(rule.exeName, (prev) => ({
                            ...prev,
                            profile: {
                              ...prev.profile,
                              stepSizePx: Number(e.target.value) || 90,
                            },
                          }))
                        }
                      />
                    </div>

                    <div className="mini-field">
                      <label htmlFor={`dur-${rule.exeName}`} className="mini-label">
                        {t.customDuration}
                      </label>
                      <input
                        id={`dur-${rule.exeName}`}
                        name={`dur-${rule.exeName}`}
                        autoComplete="off"
                        type="number"
                        inputMode="numeric"
                        min={100}
                        max={1000}
                        step={10}
                        className="text-input mono-num"
                        value={rule.profile.animationTimeMs}
                        onChange={(e) =>
                          updateRule(rule.exeName, (prev) => ({
                            ...prev,
                            profile: {
                              ...prev.profile,
                              animationTimeMs: Number(e.target.value) || 240,
                            },
                          }))
                        }
                      />
                    </div>

                    <div className="mini-field">
                      <label htmlFor={`curve-${rule.exeName}`} className="mini-label">
                        {t.customEasing}
                      </label>
                      <select
                        id={`curve-${rule.exeName}`}
                        name={`curve-${rule.exeName}`}
                        className="select-input"
                        value={rule.profile.easing}
                        onChange={(e) =>
                          updateRule(rule.exeName, (prev) => ({
                            ...prev,
                            profile: {
                              ...prev.profile,
                              easing: e.target.value as EasingCurve,
                            },
                          }))
                        }
                      >
                        <option value="OutQuint">OutQuint</option>
                        <option value="OutExpo">OutExpo</option>
                        <option value="OutCubic">OutCubic</option>
                        <option value="OutQuart">OutQuart</option>
                        <option value="Linear">Linear</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
