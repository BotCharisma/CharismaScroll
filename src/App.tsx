import { useEffect, useMemo, useState } from "react";
import { AppsGameTab } from "./components/AppsGameTab";
import { ContextualTip, type MicroTip } from "./components/ContextualTip";
import { FloatingDock } from "./components/FloatingDock";
import { MotionStagePanel } from "./components/MotionStagePanel";
import { OnboardingTour } from "./components/OnboardingTour";
import { StageLeft, type StageSection } from "./components/StageLeft";
import { SystemTab } from "./components/SystemTab";
import { TestPadDrawer } from "./components/TestPadDrawer";
import { TitleBar } from "./components/TitleBar";
import {
  applyPreset,
  deleteCustomPreset,
  elevateToAdmin,
  getAppSnapshot,
  openStorageFolder,
  PRESET_ORDER,
  PRESET_PROFILES,
  saveCustomPreset,
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

function readTourQuery(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("tour") === "1";
}

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [activeSection, setActiveSection] = useState<StageSection>(readSectionFromUrl);
  const [testPadOpen, setTestPadOpen] = useState(false);
  const [telemetry, setTelemetry] = useState<ScrollTelemetry | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourInitialized, setTourInitialized] = useState(false);

  useEffect(() => {
    document.documentElement.lang = "en";
    document.documentElement.dataset.theme = "dark";

    void getAppSnapshot().then((snap) => {
      setSnapshot(snap);
      if (readTourQuery() || !snap.settings.onboardingCompleted) {
        setActiveSection("motion");
        setTourOpen(true);
      }
      setTourInitialized(true);
    });
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

  const activeTip = useMemo<MicroTip | null>(() => {
    if (!snapshot || !tourInitialized || tourOpen || testPadOpen) return null;
    if (!snapshot.settings.onboardingCompleted) return null;

    const dismissed = new Set(snapshot.settings.dismissedTips ?? []);

    if (
      activeSection === "motion" &&
      snapshot.settings.activePreset === "custom" &&
      !dismissed.has("tip-save-preset")
    ) {
      return {
        id: "tip-save-preset",
        text: "Like this feel? Click Save above to store it as a custom preset in Documents.",
      };
    }

    if (activeSection === "motion" && !dismissed.has("tip-param-rows")) {
      return {
        id: "tip-param-rows",
        text: "Click any parameter title to open its slider and left-side usage guide.",
      };
    }

    if (activeSection === "apps" && !dismissed.has("tip-tray-bypass")) {
      return {
        id: "tip-tray-bypass",
        text: "Right-click the System Tray icon to bypass your last-scrolled app in one click.",
      };
    }

    if (activeSection === "system" && !dismissed.has("tip-storage-docs")) {
      return {
        id: "tip-storage-docs",
        text: "Settings & presets live in Documents\\CharismaScroll so OneDrive backs them up.",
      };
    }

    return null;
  }, [snapshot, tourInitialized, tourOpen, testPadOpen, activeSection]);

  if (!snapshot) return null;

  const { settings, customPresets, storageDir } = snapshot;

  const commitSettings = (updater: AppSettings | ((prev: AppSettings) => AppSettings)) => {
    setSnapshot((prevSnap) => {
      if (!prevSnap) return prevSnap;
      const next = typeof updater === "function" ? updater(prevSnap.settings) : updater;
      void updateSettings(next).then(setSnapshot);
      return { ...prevSnap, settings: next };
    });
  };

  const handleToggleEnabled = () => {
    void toggleEngine().then(setSnapshot);
  };

  const handleApplyPreset = (presetId: string) => {
    const customMatch = customPresets.find((cp) => cp.id === presetId);
    const nextProfile = customMatch
      ? customMatch.profile
      : PRESET_PROFILES[presetId as PresetId] ?? PRESET_PROFILES.classic;

    setSnapshot((prev) =>
      prev
        ? {
            ...prev,
            settings: {
              ...prev.settings,
              activePreset: presetId,
              globalProfile: { ...nextProfile },
            },
          }
        : prev
    );
    void applyPreset(presetId).then(setSnapshot);
  };

  const handleCyclePreset = () => {
    const allIds: string[] = [...PRESET_ORDER, ...customPresets.map((cp) => cp.id)];
    const curIdx = allIds.indexOf(settings.activePreset);
    const nextId = allIds[(curIdx + 1) % allIds.length];
    handleApplyPreset(nextId);
  };

  const handleSaveCustomPreset = async (name: string, profile: ScrollProfile) => {
    const nextSnap = await saveCustomPreset(name, profile);
    setSnapshot(nextSnap);
  };

  const handleDeleteCustomPreset = async (id: string) => {
    const nextSnap = await deleteCustomPreset(id);
    setSnapshot(nextSnap);
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

  const handleOpenTour = () => {
    setActiveSection("motion");
    setTestPadOpen(false);
    setTourOpen(true);
  };

  const handleFinishTour = () => {
    setTourOpen(false);
    if (!settings.onboardingCompleted) {
      commitSettings((prev) => ({ ...prev, onboardingCompleted: true }));
    }
  };

  const handleDismissTip = (tipId: string) => {
    commitSettings((prev) => ({
      ...prev,
      dismissedTips: Array.from(new Set([...(prev.dismissedTips ?? []), tipId])),
    }));
  };

  return (
    <div className="stage-shell">
      <a className="skip-link" href="#stage-main">
        Skip to workspace controls
      </a>

      <TitleBar
        detectedHz={snapshot.detectedHz}
        targetFps={settings.targetFps}
        onOpenTour={handleOpenTour}
      />

      <StageLeft
        activePreset={settings.activePreset}
        customPresets={customPresets}
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
            customPresets={customPresets}
            onChangeProfile={handleChangeGlobalProfile}
            onApplyPreset={handleApplyPreset}
            onSaveCustomPreset={handleSaveCustomPreset}
            onDeleteCustomPreset={handleDeleteCustomPreset}
            onOpenStorageFolder={() => void openStorageFolder()}
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
            storageDir={storageDir}
            onUpdateSettings={commitSettings}
            onElevate={() => void elevateToAdmin()}
            onOpenStorageFolder={() => void openStorageFolder()}
          />
        )}

        <ContextualTip tip={activeTip} onDismiss={handleDismissTip} />
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

      <OnboardingTour open={tourOpen} onFinish={handleFinishTour} />
    </div>
  );
}

export default App;
