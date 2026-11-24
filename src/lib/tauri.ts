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
}

export interface AppSnapshot {
  settings: AppSettings;
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

const STORAGE_KEY = "charisma_scroll_obsidian_v2";

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
  };
}

function saveMockSettings(settings: AppSettings): AppSnapshot {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage write failure
  }
  return {
    settings,
    isAdmin: false,
    detectedHz: 185,
    lastScrolledExe: "chrome.exe",
    version: "0.2.0",
  };
}

export async function getAppSnapshot(): Promise<AppSnapshot> {
  if (!isTauriRuntime()) {
    return saveMockSettings(loadMockSettings());
  }
  return invoke<AppSnapshot>("get_app_snapshot");
}

export async function updateSettings(settings: AppSettings): Promise<AppSnapshot> {
  if (!isTauriRuntime()) {
    return saveMockSettings(settings);
  }
  return invoke<AppSnapshot>("update_settings", { settings });
}

export async function applyPreset(presetId: PresetId): Promise<AppSnapshot> {
  if (!isTauriRuntime()) {
    const current = loadMockSettings();
    const next: AppSettings = {
      ...current,
      activePreset: presetId,
      globalProfile: { ...(PRESET_PROFILES[presetId] ?? PRESET_PROFILES.classic) },
    };
    return saveMockSettings(next);
  }
  return invoke<AppSnapshot>("apply_preset", { presetId });
}

export async function toggleEngine(): Promise<AppSnapshot> {
  if (!isTauriRuntime()) {
    const current = loadMockSettings();
    return saveMockSettings({ ...current, enabled: !current.enabled });
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
