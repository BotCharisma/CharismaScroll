import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type EasingCurve = "OutExpo" | "OutQuint" | "OutCubic" | "OutQuart" | "Linear";
export type AppRuleMode = "Disabled" | "Custom";
export type PresetId = "classic" | "macbook" | "coding" | "cinema";

export interface ScrollProfile {
  stepSizePx: number;
  animationTimeMs: number;
  accelerationDeltaMs: number;
  accelerationMax: number;
  easing: EasingCurve;
  reverseVertical: boolean;
  reverseHorizontal: boolean;
  horizontalSmooth: boolean;
  shiftWheelHorizontal: boolean;
  stopOnReverse: boolean;
}

export interface CustomPreset {
  id: string;
  name: string;
  profile: ScrollProfile;
}

export interface AppRule {
  exeName: string;
  displayName: string;
  mode: AppRuleMode;
  profile: ScrollProfile;
}

export interface AppSettings {
  enabled: boolean;
  activePreset: string;
  globalProfile: ScrollProfile;
  appRules: AppRule[];
  gameModeFullscreen: boolean;
  bypassTouchpad: boolean;
  passthroughCtrlAlt: boolean;
  hotkey: string;
  targetFps: number;
  language: string;
  theme: string;
  startWithWindows: boolean;
  startAsAdmin: boolean;
  onboardingCompleted: boolean;
  dismissedTips: string[];
}

export interface AppSnapshot {
  settings: AppSettings;
  customPresets: CustomPreset[];
  storageDir: string;
  isAdmin: boolean;
  detectedHz: number;
  lastScrolledExe: string | null;
  version: string;
}

export interface RunningAppInfo {
  exeName: string;
  displayName: string;
  windowTitle: string;
}

export interface ScrollTelemetry {
  progress: number;
  velocityPxPerSec: number;
  axis: "vertical" | "horizontal";
  monitorHz: number;
  activeExe: string;
}

export interface PresetStageMeta {
  id: PresetId;
  line1: string;
  line2: string;
  summary: string;
}

export const PRESET_ORDER: PresetId[] = ["classic", "macbook", "coding", "cinema"];

export const PRESET_STAGE_META: Record<PresetId, PresetStageMeta> = {
  classic: {
    id: "classic",
    line1: "Classic",
    line2: "flow",
    summary: "Balanced everyday glide",
  },
  macbook: {
    id: "macbook",
    line1: "Trackpad",
    line2: "glide",
    summary: "Long exponential cushion",
  },
  coding: {
    id: "coding",
    line1: "Snappy",
    line2: "code",
    summary: "Crisp stop for editors",
  },
  cinema: {
    id: "cinema",
    line1: "Cinema",
    line2: "drift",
    summary: "Deep slow-settling travel",
  },
};

export const PRESET_PROFILES: Record<PresetId, ScrollProfile> = {
  classic: {
    stepSizePx: 110,
    animationTimeMs: 420,
    accelerationDeltaMs: 70,
    accelerationMax: 2.8,
    easing: "OutQuint",
    reverseVertical: false,
    reverseHorizontal: false,
    horizontalSmooth: true,
    shiftWheelHorizontal: true,
    stopOnReverse: true,
  },
  macbook: {
    stepSizePx: 95,
    animationTimeMs: 520,
    accelerationDeltaMs: 85,
    accelerationMax: 3.4,
    easing: "OutExpo",
    reverseVertical: false,
    reverseHorizontal: false,
    horizontalSmooth: true,
    shiftWheelHorizontal: true,
    stopOnReverse: true,
  },
  coding: {
    stepSizePx: 90,
    animationTimeMs: 210,
    accelerationDeltaMs: 55,
    accelerationMax: 2.0,
    easing: "OutCubic",
    reverseVertical: false,
    reverseHorizontal: false,
    horizontalSmooth: true,
    shiftWheelHorizontal: true,
    stopOnReverse: true,
  },
  cinema: {
    stepSizePx: 135,
    animationTimeMs: 680,
    accelerationDeltaMs: 80,
    accelerationMax: 3.0,
    easing: "OutQuart",
    reverseVertical: false,
    reverseHorizontal: false,
    horizontalSmooth: true,
    shiftWheelHorizontal: true,
    stopOnReverse: true,
  },
};

export function evaluateEasing(curve: EasingCurve, t: number): number {
  const c = Math.max(0, Math.min(1, t));
  if (c <= 0) return 0;
  if (c >= 1) return 1;
  switch (curve) {
    case "OutExpo":
      return 1 - Math.pow(2, -10 * c);
    case "OutQuint":
      return 1 - Math.pow(1 - c, 5);
    case "OutQuart":
      return 1 - Math.pow(1 - c, 4);
    case "OutCubic":
      return 1 - Math.pow(1 - c, 3);
    case "Linear":
      return c;
  }
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const STORAGE_KEY = "charisma_scroll_obsidian_v3";
const PRESETS_KEY = "charisma_scroll_custom_presets_v3";

function loadMockSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as AppSettings;
    }
  } catch {
    // Ignore storage read failure
  }
  return {
    enabled: true,
    activePreset: "classic",
    globalProfile: { ...PRESET_PROFILES.classic },
    appRules: [
      {
        exeName: "Code.exe",
        displayName: "VS Code",
        mode: "Custom",
        profile: { ...PRESET_PROFILES.coding },
      },
      {
        exeName: "photoshop.exe",
        displayName: "Photoshop",
        mode: "Disabled",
        profile: { ...PRESET_PROFILES.classic },
      },
    ],
    gameModeFullscreen: true,
    bypassTouchpad: true,
    passthroughCtrlAlt: true,
    hotkey: "Alt+Shift+S",
    targetFps: 0,
    language: "en",
    theme: "dark",
    startWithWindows: false,
    startAsAdmin: false,
    onboardingCompleted: false,
    dismissedTips: [],
  };
}

function loadMockPresets(): CustomPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (raw) return JSON.parse(raw) as CustomPreset[];
  } catch {
    // Ignore storage read failure
  }
  return [
    {
      id: "custom-night-reader",
      name: "Night Reader",
      profile: {
        ...PRESET_PROFILES.macbook,
        stepSizePx: 85,
        animationTimeMs: 560,
      },
    },
  ];
}

function saveMockState(settings: AppSettings, presets?: CustomPreset[]): AppSnapshot {
  const activePresets = presets ?? loadMockPresets();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    localStorage.setItem(PRESETS_KEY, JSON.stringify(activePresets));
  } catch {
    // Ignore storage write failure
  }
  return {
    settings,
    customPresets: activePresets,
    storageDir: "C:\\Users\\Demo\\OneDrive\\Documents\\CharismaScroll",
    isAdmin: false,
    detectedHz: 185,
    lastScrolledExe: "chrome.exe",
    version: "0.3.0",
  };
}

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  version: string | null;
  body: string | null;
  date: string | null;
}

export interface UpdateProgressPayload {
  downloaded: number;
  total: number | null;
  stage: "downloading" | "installing";
}

export async function getAppSnapshot(): Promise<AppSnapshot> {
  if (!isTauriRuntime()) {
    return saveMockState(loadMockSettings(), loadMockPresets());
  }
  return invoke<AppSnapshot>("get_app_snapshot");
}

export async function updateSettings(settings: AppSettings): Promise<AppSnapshot> {
  if (!isTauriRuntime()) {
    return saveMockState(settings);
  }
  return invoke<AppSnapshot>("update_settings", { settings });
}

export async function applyPreset(presetId: string): Promise<AppSnapshot> {
  if (!isTauriRuntime()) {
    const current = loadMockSettings();
    const presets = loadMockPresets();
    const foundCustom = presets.find((p) => p.id === presetId);
    const nextProfile = foundCustom
      ? { ...foundCustom.profile }
      : { ...(PRESET_PROFILES[presetId as PresetId] ?? PRESET_PROFILES.classic) };
    return saveMockState({
      ...current,
      activePreset: presetId,
      globalProfile: nextProfile,
    });
  }
  return invoke<AppSnapshot>("apply_preset", { presetId });
}

export async function saveCustomPreset(
  name: string,
  profile: ScrollProfile
): Promise<AppSnapshot> {
  if (!isTauriRuntime()) {
    const clean = name.trim();
    const slug =
      clean
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "custom";
    const id = `custom-${slug}`;
    const existing = loadMockPresets().filter((p) => p.id !== id);
    const nextPresets = [...existing, { id, name: clean, profile: { ...profile } }].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    const current = loadMockSettings();
    return saveMockState(
      { ...current, activePreset: id, globalProfile: { ...profile } },
      nextPresets
    );
  }
  return invoke<AppSnapshot>("save_custom_preset", { name, profile });
}

export async function deleteCustomPreset(presetId: string): Promise<AppSnapshot> {
  if (!isTauriRuntime()) {
    const nextPresets = loadMockPresets().filter((p) => p.id !== presetId);
    const current = loadMockSettings();
    const nextSettings =
      current.activePreset === presetId
        ? { ...current, activePreset: "custom" }
        : current;
    return saveMockState(nextSettings, nextPresets);
  }
  return invoke<AppSnapshot>("delete_custom_preset", { presetId });
}

export async function openStorageFolder(): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("open_storage_folder");
}

export async function toggleEngine(): Promise<AppSnapshot> {
  if (!isTauriRuntime()) {
    const current = loadMockSettings();
    return saveMockState({ ...current, enabled: !current.enabled });
  }
  return invoke<AppSnapshot>("toggle_engine");
}

export async function getRunningApps(): Promise<RunningAppInfo[]> {
  if (!isTauriRuntime()) {
    return [
      { exeName: "chrome.exe", displayName: "Google Chrome", windowTitle: "Google Chrome" },
      { exeName: "msedge.exe", displayName: "Microsoft Edge", windowTitle: "Microsoft Edge" },
      { exeName: "Figma.exe", displayName: "Figma", windowTitle: "Figma" },
      { exeName: "Discord.exe", displayName: "Discord", windowTitle: "Discord" },
    ];
  }
  return invoke<RunningAppInfo[]>("get_running_apps");
}

export async function elevateToAdmin(): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("elevate_to_admin");
}

export async function setTelemetryActive(active: boolean): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("set_telemetry_active", { active });
}

export async function subscribeSnapshotUpdated(
  cb: (snapshot: AppSnapshot) => void
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => {};
  return listen<AppSnapshot>("snapshot-updated", (event) => cb(event.payload));
}

export async function subscribeScrollTelemetry(
  cb: (sample: ScrollTelemetry) => void
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => {};
  return listen<ScrollTelemetry>("scroll-telemetry", (event) => cb(event.payload));
}

export async function subscribeTrayMenuOpened(cb: () => void): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => {};
  return listen<void>("tray-menu-opened", () => cb());
}

export async function trayOpenMain(): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("tray_open_main");
}

export async function trayQuitApp(): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("tray_quit_app");
}

export async function trayHideMenu(): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("tray_hide_menu");
}

export async function trayResizeMenu(height: number): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("tray_resize_menu", { height });
}

export async function trayToggleRecentApp(): Promise<AppSnapshot> {
  if (!isTauriRuntime()) {
    return getAppSnapshot();
  }
  return invoke<AppSnapshot>("tray_toggle_recent_app");
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  if (!isTauriRuntime()) {
    return {
      available: false,
      currentVersion: "0.3.0",
      version: null,
      body: null,
      date: null,
    };
  }
  return invoke<UpdateInfo>("check_for_update");
}

export async function installUpdate(): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("install_update");
}

export async function subscribeUpdateProgress(
  cb: (progress: UpdateProgressPayload) => void
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => {};
  return listen<UpdateProgressPayload>("update-progress", (event) => cb(event.payload));
}
