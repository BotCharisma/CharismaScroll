import { useEffect, useState } from "react";
import { AppsGameTab } from "./components/AppsGameTab";
import { LiveWorkbench } from "./components/LiveWorkbench";
import { ScrollStudioTab } from "./components/ScrollStudioTab";
import { SystemTab } from "./components/SystemTab";
import { TopBar, type ActiveTab } from "./components/TopBar";
import { TitleBar } from "./components/TitleBar";
import { COPY } from "./lib/i18n";
import {
  applyPreset,
  elevateToAdmin,
  getAppSnapshot,
  PRESET_PROFILES,
  setTelemetryActive,
  subscribeScrollTelemetry,
  subscribeSnapshotUpdated,
  toggleEngine,
  updateSettings,
  type AppRule,
  type AppSettings,
  type AppSnapshot,
  type ScrollProfile,
  type ScrollTelemetry,
} from "./lib/tauri";

function readTabFromUrl(): ActiveTab {
  if (typeof window === "undefined") return "scroll";
  const param = new URLSearchParams(window.location.search).get("tab");
  if (param === "apps" || param === "system" || param === "scroll") {
    return param;
  }
  return "scroll";
}

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>(readTabFromUrl);
  const [telemetry, setTelemetry] = useState<ScrollTelemetry | null>(null);
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : true
  );

  useEffect(() => {
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

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onMq = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mq.addEventListener("change", onMq);

    const onPop = () => setActiveTab(readTabFromUrl());
    window.addEventListener("popstate", onPop);

    return () => {
      void setTelemetryActive(false);
      unlistenSnap?.();
      unlistenTel?.();
      mq.removeEventListener("change", onMq);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  const settings = snapshot?.settings;
  const lang = settings?.language ?? "vi";
  const resolvedTheme: "dark" | "light" =
    settings?.theme === "system"
      ? systemPrefersDark
        ? "dark"
        : "light"
      : settings?.theme === "light"
        ? "light"
        : "dark";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dataset.theme = resolvedTheme;
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute("content", resolvedTheme === "dark" ? "#1c1f24" : "#f5f7fa");
    }
  }, [lang, resolvedTheme]);

  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url.toString());
  };

  if (!snapshot || !settings) {
    return null;
  }

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

  const handleSelectPreset = (presetId: string) => {
    const nextProfile = PRESET_PROFILES[presetId] ?? PRESET_PROFILES.classic;
    setSnapshot({
      ...snapshot,
      settings: {
        ...settings,
        activePreset: presetId,
        globalProfile: { ...nextProfile },
      },
    });
    void applyPreset(presetId).then(setSnapshot);
  };

  const handleChangeGlobalProfile = (nextProfile: ScrollProfile) => {
    commitSettings({
      ...settings,
      activePreset: "custom",
      globalProfile: nextProfile,
    });
  };

  const handleChangeRules = (appRules: AppRule[]) => {
    commitSettings({ ...settings, appRules });
  };

  const handleResetDefaults = () => {
    commitSettings({
      enabled: true,
      activePreset: "classic",
      globalProfile: { ...PRESET_PROFILES.classic },
      appRules: [],
      gameModeFullscreen: true,
      bypassTouchpad: true,
      passthroughCtrlAlt: true,
      hotkey: "Alt+Shift+S",
      targetFps: 0,
      language: settings.language,
      theme: settings.theme,
      startWithWindows: false,
      startAsAdmin: false,
    });
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-workbench">
        {COPY[lang].skipToMain}
      </a>

      <TitleBar
        detectedHz={snapshot.detectedHz}
        targetFps={settings.targetFps}
        lang={lang}
        onToggleLang={() =>
          commitSettings((prev) => ({
            ...prev,
            language: prev.language === "vi" ? "en" : "vi",
          }))
        }
        resolvedTheme={resolvedTheme}
        onToggleTheme={() =>
          commitSettings((prev) => ({
            ...prev,
            theme:
              (prev.theme === "system"
                ? systemPrefersDark
                  ? "dark"
                  : "light"
                : prev.theme) === "dark"
                ? "light"
                : "dark",
          }))
        }
      />

      <TopBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        enabled={settings.enabled}
        onToggleEnabled={handleToggleEnabled}
        hotkey={settings.hotkey}
        lang={lang}
      />

      <div className="workbench-scroll">
        <main id="main-workbench" className="workbench-grid">
          {activeTab === "scroll" && (
            <ScrollStudioTab
              profile={settings.globalProfile}
              activePreset={settings.activePreset}
              onSelectPreset={handleSelectPreset}
              onChangeProfile={handleChangeGlobalProfile}
              lang={lang}
            />
          )}

          {activeTab === "apps" && (
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
              lang={lang}
            />
          )}

          {activeTab === "system" && (
            <SystemTab
              settings={settings}
              isAdmin={snapshot.isAdmin}
              detectedHz={snapshot.detectedHz}
              onUpdateSettings={commitSettings}
              onElevate={() => void elevateToAdmin()}
              onResetDefaults={handleResetDefaults}
              lang={lang}
            />
          )}

          <LiveWorkbench
            profile={settings.globalProfile}
            enabled={settings.enabled}
            detectedHz={snapshot.detectedHz}
            targetFps={settings.targetFps}
            telemetry={telemetry}
            lang={lang}
          />
        </main>
      </div>
    </div>
  );
}
export default App;
