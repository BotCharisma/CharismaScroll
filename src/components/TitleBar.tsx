import { type MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { HelpCircle, Minus, X } from "lucide-react";
import { isTauriRuntime } from "../lib/tauri";
import { Tooltip } from "./Tooltip";

interface TitleBarProps {
  detectedHz: number;
  targetFps: number;
  onOpenTour: () => void;
}

export function TitleBar({ detectedHz, targetFps, onOpenTour }: TitleBarProps) {
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
        <Tooltip label="Active refresh sync" placement="bottom">
          <span className="hz-badge">
            {displayHz}
            {"\u00A0"}Hz
          </span>
        </Tooltip>

        <Tooltip label="Quick guide" placement="bottom">
          <button
            type="button"
            className="caption-btn"
            onClick={onOpenTour}
            aria-label="Open quick guide"
          >
            <HelpCircle size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </Tooltip>

        <Tooltip label="Minimize" placement="bottom">
          <button
            type="button"
            className="caption-btn"
            onClick={handleMinimize}
            aria-label="Minimize window"
          >
            <Minus size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </Tooltip>

        <Tooltip label="Close to System Tray" placement="bottom-end">
          <button
            type="button"
            className="caption-btn caption-btn-close"
            data-tour="close"
            onClick={handleClose}
            aria-label="Close to System Tray"
          >
            <X size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
