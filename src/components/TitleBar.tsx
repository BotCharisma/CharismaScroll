import { useEffect, useState, type MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Languages, Minus, Monitor, Moon, Square, Sun, X } from "lucide-react";
import { COPY, type Lang } from "../lib/i18n";
import { isTauriRuntime } from "../lib/tauri";

interface TitleBarProps {
  detectedHz: number;
  targetFps: number;
  lang: Lang;
  onToggleLang: () => void;
  resolvedTheme: "dark" | "light";
  onToggleTheme: () => void;
}

export function TitleBar({
  detectedHz,
  targetFps,
  lang,
  onToggleLang,
  resolvedTheme,
  onToggleTheme,
}: TitleBarProps) {
  const t = COPY[lang];
  const displayHz = targetFps >= 60 ? targetFps : detectedHz;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    const win = getCurrentWindow();
    void win.isMaximized().then(setMaximized).catch(() => {});

    let unlisten: (() => void) | undefined;
    void win
      .onResized(() => {
        void win.isMaximized().then(setMaximized).catch(() => {});
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});

    return () => {
      unlisten?.();
    };
  }, []);

  const handleBarMouseDown = (e: MouseEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, a, input, select")) return;
    if (!isTauriRuntime()) return;
    const win = getCurrentWindow();
    if (e.detail === 2) {
      void win.toggleMaximize();
    } else {
      void win.startDragging();
    }
  };

  const handleMinimize = () => {
    if (isTauriRuntime()) void getCurrentWindow().minimize();
  };

  const handleMaximize = () => {
    if (isTauriRuntime()) void getCurrentWindow().toggleMaximize();
  };

  const handleClose = () => {
    if (isTauriRuntime()) void getCurrentWindow().close();
  };

  return (
    <header className="shell-header" onMouseDown={handleBarMouseDown}>
      <div className="brand-lockup">
        <div className="brand-mark" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect
              x="4.5"
              y="1.5"
              width="7"
              height="13"
              rx="3.5"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <rect x="7" y="4.5" width="2" height="4" rx="1" fill="var(--color-signal)" />
          </svg>
        </div>
        <span className="brand-name" translate="no">
          CharismaScroll
        </span>
        <span className="hz-chip mono-num" title={t.systemTab.fpsLabel}>
          <Monitor size={13} strokeWidth={1.5} aria-hidden="true" />
          <span>
            {displayHz}
            {"\u00A0"}Hz
          </span>
        </span>
      </div>

      <div className="shell-drag-space" aria-hidden="true" />

      <div className="shell-actions">
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleLang}
          aria-label={t.status.switchLang}
          title={t.status.switchLang}
        >
          <Languages size={15} strokeWidth={1.5} aria-hidden="true" />
          <span className="mono-num">{lang === "vi" ? "VI" : "EN"}</span>
        </button>

        <button
          type="button"
          className="icon-btn"
          onClick={onToggleTheme}
          aria-label={
            resolvedTheme === "dark" ? t.status.switchThemeLight : t.status.switchThemeDark
          }
          title={
            resolvedTheme === "dark" ? t.status.switchThemeLight : t.status.switchThemeDark
          }
        >
          {resolvedTheme === "dark" ? (
            <Sun size={15} strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <Moon size={15} strokeWidth={1.5} aria-hidden="true" />
          )}
        </button>

        <span className="bar-divider" aria-hidden="true" />

        <div className="caption-controls">
          <button
            type="button"
            className="caption-btn"
            onClick={handleMinimize}
            aria-label={t.window.minimize}
            title={t.window.minimize}
          >
            <Minus size={15} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="caption-btn"
            onClick={handleMaximize}
            aria-label={maximized ? t.window.restore : t.window.maximize}
            title={maximized ? t.window.restore : t.window.maximize}
          >
            {maximized ? (
              <Copy size={13} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Square size={13} strokeWidth={1.5} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className="caption-btn caption-btn-close"
            onClick={handleClose}
            aria-label={t.window.closeToTray}
            title={t.window.closeToTray}
          >
            <X size={15} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
