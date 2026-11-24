import { useEffect, useState } from "react";
import { AppsGameTab } from "./components/AppsGameTab";
import { FloatingDock } from "./components/FloatingDock";
import { MotionStagePanel } from "./components/MotionStagePanel";
import { StageLeft, type StageSection } from "./components/StageLeft";
import { SystemTab } from "./components/SystemTab";
import { TestPadDrawer } from "./components/TestPadDrawer";
import { TitleBar } from "./components/TitleBar";
import {
  applyPreset,
  elevateToAdmin,
  getAppSnapshot,
  PRESET_ORDER,
  PRESET_PROFILES,
  setTelemetryActive,
  subscribeScrollTelemetry,
  subscribeSnapshotUpdated,
  toggleEngine,
  updateSettings,
  type AppRule,
  type AppSettings,
  type AppSnapshot,
  type PresetId,
  type ScrollProfile,
  type ScrollTelemetry,
} from "./lib/tauri";

function readSectionFromUrl(): StageSection {
  if (typeof window === "undefined") return "motion";
  const param = new URLSearchParams(window.location.search).get("tab");
  if (param === "apps" || param === "system" || param === "motion") {
    return param;
  }
  return "motion";
}

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [activeSection, setActiveSection] = useState<StageSection>(readSectionFromUrl);
  const [testPadOpen, setTestPadOpen] = useState(false);
  const [telemetry, setTelemetry] = useState<ScrollTelemetry | null>(null);

  useEffect(() => {
    document.documentElement.lang = "en";
    document.documentElement.dataset.theme = "dark";

    void getAppSnapshot().then(setSnapshot);
    void setTelemetryActive(true);

    let unlistenSnap: (() => void) | undefined;
    let unlistenTel: (() => void) | undefined;

    void subscribeSnapshotUpdated((next) => setSnapshot(next)).then((fn) => {
      unlistenSnap = fn;
    });
    void subscribeScrollTelemetry((sample) => setTelemetry(sample)).then((fn) => {
      unlistenTel = fn;
    });

    const onPop = () => setActiveSection(readSectionFromUrl());
    window.addEventListener("popstate", onPop);

    return () => {
      void setTelemetryActive(false);
      unlistenSnap?.();
      unlistenTel?.();
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  const handleSelectSection = (section: StageSection) => {
    setActiveSection(section);
    setTestPadOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", section);
    window.history.replaceState(null, "", url.toString());
  };

  if (!snapshot) return null;

  const { settings } = snapshot;

  const commitSettings = (updater: AppSettings | ((prev: AppSettings) => AppSettings)) => {
    setSnapshot((prevSnap) => {
      if (!prevSnap) return prevSnap;
      const next =
        typeof updater === "function" ? updater(prevSnap.settings) : updater;
      void updateSettings(next).then(setSnapshot);
      return { ...prevSnap, settings: next };
    });
  };

  const handleToggleEnabled = () => {
    void toggleEngine().then(setSnapshot);
  };

  const handleCyclePreset = () => {
    const curIdx = PRESET_ORDER.indexOf(settings.activePreset as PresetId);
    const nextPreset: PresetId = PRESET_ORDER[(curIdx + 1) % PRESET_ORDER.length];
    const nextProfile = PRESET_PROFILES[nextPreset];

    setSnapshot((prev) =>
      prev
        ? {
            ...prev,
            settings: {
              ...prev.settings,
              activePreset: nextPreset,
              globalProfile: { ...nextProfile },
            },
          }
        : prev
    );
    void applyPreset(nextPreset).then(setSnapshot);
  };

  const handleChangeGlobalProfile = (nextProfile: ScrollProfile) => {
    commitSettings((prev) => ({
      ...prev,
      activePreset: "custom",
      globalProfile: nextProfile,
    }));
  };

  const handleChangeRules = (appRules: AppRule[]) => {
    commitSettings((prev) => ({ ...prev, appRules }));
  };

  return (
    <div className="stage-shell">
      <a className="skip-link" href="#stage-main">
        Skip to workspace controls
      </a>

      <TitleBar detectedHz={snapshot.detectedHz} targetFps={settings.targetFps} />

      <StageLeft
        activePreset={settings.activePreset}
        activeSection={activeSection}
        onSelectSection={handleSelectSection}
        telemetry={telemetry}
      />

      <main
        id="stage-main"
        className={testPadOpen ? "stage-right is-covered" : "stage-right"}
      >
        {activeSection === "motion" && (
          <MotionStagePanel
            profile={settings.globalProfile}
            activePreset={settings.activePreset}
            onChangeProfile={handleChangeGlobalProfile}
          />
        )}

        {activeSection === "apps" && (
          <AppsGameTab
            gameModeFullscreen={settings.gameModeFullscreen}
            onToggleGameMode={() =>
              commitSettings((prev) => ({
                ...prev,
                gameModeFullscreen: !prev.gameModeFullscreen,
              }))
            }
            appRules={settings.appRules}
            globalProfile={settings.globalProfile}
            onChangeRules={handleChangeRules}
          />
        )}

        {activeSection === "system" && (
          <SystemTab
            settings={settings}
            isAdmin={snapshot.isAdmin}
            detectedHz={snapshot.detectedHz}
            onUpdateSettings={commitSettings}
            onElevate={() => void elevateToAdmin()}
          />
        )}
      </main>

      <FloatingDock
        enabled={settings.enabled}
        onToggleEnabled={handleToggleEnabled}
        profile={settings.globalProfile}
        onChangeProfile={handleChangeGlobalProfile}
        onCyclePreset={handleCyclePreset}
      />

      <TestPadDrawer
        open={testPadOpen}
        onToggleOpen={() => setTestPadOpen((v) => !v)}
        profile={settings.globalProfile}
        enabled={settings.enabled}
        telemetry={telemetry}
      />
    </div>
  );
}

export default App;
