import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Check,
  ExternalLink,
  Power,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import {
  applyPreset,
  getAppSnapshot,
  subscribeSnapshotUpdated,
  subscribeTrayMenuOpened,
  toggleEngine,
  trayHideMenu,
  trayOpenMain,
  trayQuitApp,
  trayResizeMenu,
  trayToggleRecentApp,
  type AppSnapshot,
} from "../lib/tauri";

const BUILTIN_PRESETS = [
  { id: "classic", label: "Classic Flow" },
  { id: "macbook", label: "Trackpad Glide" },
  { id: "coding", label: "Snappy Code" },
  { id: "cinema", label: "Cinema Drift" },
] as const;

export function TrayMenuPopup() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.documentElement.lang = "en";
    document.documentElement.dataset.theme = "dark";
    document.documentElement.classList.add("is-tray-view");
    document.body.classList.add("is-tray-view");

    const refresh = () => {
      void getAppSnapshot().then(setSnapshot);
    };
    refresh();

    let unlistenSnap: (() => void) | undefined;
    let unlistenOpen: (() => void) | undefined;

    void subscribeSnapshotUpdated((next) => setSnapshot(next)).then((fn) => {
      unlistenSnap = fn;
    });
    void subscribeTrayMenuOpened(() => refresh()).then((fn) => {
      unlistenOpen = fn;
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        void trayHideMenu();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      unlistenSnap?.();
      unlistenOpen?.();
    };
  }, []);

  useLayoutEffect(() => {
    const el = shellRef.current;
    if (!el) return;

    const syncSize = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > 40) {
        void trayResizeMenu(h);
      }
    };

    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [snapshot]);

  const settings = snapshot?.settings;
  const enabled = settings?.enabled ?? true;
  const activePreset = settings?.activePreset ?? "classic";
  const customPresets = snapshot?.customPresets ?? [];
  const recentExe = snapshot?.lastScrolledExe ?? null;
  const recentDisabled = Boolean(
    recentExe &&
      settings?.appRules.some(
        (r) =>
          r.exeName.toLowerCase() === recentExe.toLowerCase() &&
          r.mode === "Disabled"
      )
  );

  return (
    <div ref={shellRef} className="tray-popup" role="menu" aria-label="CharismaScroll tray menu">
      <div className="tray-brand-bar">
        <span className="tray-brand-title" translate="no">
          CharismaScroll
        </span>
        <span className="tray-hotkey-pill mono-num">{settings?.hotkey ?? "Alt+Shift+S"}</span>
      </div>

      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={enabled}
        className={`tray-status-card${enabled ? " is-active" : ""}`}
        onClick={async () => {
          const next = await toggleEngine();
          setSnapshot(next);
        }}
      >
        <span className="tray-status-left">
          <span className={`tray-status-dot${enabled ? " is-active" : ""}`} aria-hidden="true" />
          <span className="tray-status-copy">
            <span className="tray-status-label">
              {enabled ? "Smoothing Active" : "Smoothing Paused"}
            </span>
            <span className="tray-status-sub">
              {enabled ? "Click to pause wheel physics" : "Click to resume smooth glide"}
            </span>
          </span>
        </span>
        <span className={`tray-switch${enabled ? " is-on" : ""}`} aria-hidden="true">
          <span className="tray-switch-thumb" />
        </span>
      </button>

      <div className="tray-divider" />

      <div className="tray-section-label">Presets</div>
      <div className="tray-list">
        {BUILTIN_PRESETS.map((preset) => {
          const isSelected = activePreset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              role="menuitemradio"
              aria-checked={isSelected}
              className={`tray-item${isSelected ? " is-selected" : ""}`}
              onClick={async () => {
                const next = await applyPreset(preset.id);
                setSnapshot(next);
                void trayHideMenu();
              }}
            >
              <span className="tray-item-name">{preset.label}</span>
              {isSelected && <Check size={14} strokeWidth={2.2} className="tray-check" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {customPresets.length > 0 && (
        <>
          <div className="tray-divider" />
          <div className="tray-section-label">Custom</div>
          <div className="tray-list tray-custom-list">
            {customPresets.map((cp) => {
              const isSelected = activePreset === cp.id;
              return (
                <button
                  key={cp.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  className={`tray-item${isSelected ? " is-selected" : ""}`}
                  onClick={async () => {
                    const next = await applyPreset(cp.id);
                    setSnapshot(next);
                    void trayHideMenu();
                  }}
                >
                  <span className="tray-item-name">{cp.name}</span>
                  {isSelected && <Check size={14} strokeWidth={2.2} className="tray-check" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </>
      )}

      {recentExe && (
        <>
          <div className="tray-divider" />
          <button
            type="button"
            role="menuitem"
            className="tray-item tray-item-action"
            onClick={async () => {
              const next = await trayToggleRecentApp();
              setSnapshot(next);
              void trayHideMenu();
            }}
          >
            <span className="tray-item-left">
              {recentDisabled ? (
                <ShieldCheck size={14} strokeWidth={1.7} className="tray-item-icon is-signal" aria-hidden="true" />
              ) : (
                <ShieldOff size={14} strokeWidth={1.7} className="tray-item-icon" aria-hidden="true" />
              )}
              <span className="tray-item-name">
                {recentDisabled ? `Re-enable for ${recentExe}` : `Bypass for ${recentExe}`}
              </span>
            </span>
          </button>
        </>
      )}

      <div className="tray-divider" />

      <div className="tray-footer">
        <button
          type="button"
          role="menuitem"
          className="tray-item tray-item-action"
          onClick={() => {
            void trayOpenMain();
          }}
        >
          <span className="tray-item-left">
            <ExternalLink size={14} strokeWidth={1.7} className="tray-item-icon" aria-hidden="true" />
            <span className="tray-item-name">Open CharismaScroll</span>
          </span>
        </button>

        <button
          type="button"
          role="menuitem"
          className="tray-item tray-item-danger"
          onClick={() => {
            void trayQuitApp();
          }}
        >
          <span className="tray-item-left">
            <Power size={14} strokeWidth={1.7} className="tray-item-icon" aria-hidden="true" />
            <span className="tray-item-name">Quit CharismaScroll</span>
          </span>
        </button>
      </div>
    </div>
  );
}
