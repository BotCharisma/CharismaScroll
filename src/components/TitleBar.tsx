import { type MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, X } from "lucide-react";
import { isTauriRuntime } from "../lib/tauri";

interface TitleBarProps {
  detectedHz: number;
  targetFps: number;
}

export function TitleBar({ detectedHz, targetFps }: TitleBarProps) {
  const displayHz = targetFps >= 60 ? targetFps : detectedHz;

  const handleDragMouseDown = (e: MouseEvent<HTMLElement>) => {
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

  const handleClose = () => {
    if (isTauriRuntime()) void getCurrentWindow().close();
  };

  return (
    <div className="drag-ceiling" onMouseDown={handleDragMouseDown}>
      <div className="corner-chrome">
        <span className="hz-badge" title="Active refresh sync">
          {displayHz}
          {"\u00A0"}Hz
        </span>
        <button
          type="button"
          className="caption-btn"
          onClick={handleMinimize}
          aria-label="Minimize window"
          title="Minimize"
        >
          <Minus size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="caption-btn caption-btn-close"
          onClick={handleClose}
          aria-label="Close to System Tray"
          title="Close to System Tray"
        >
          <X size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
