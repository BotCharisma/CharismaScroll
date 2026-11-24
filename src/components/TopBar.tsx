import { AppWindow, Settings2, Sliders } from "lucide-react";
import { COPY, type Lang } from "../lib/i18n";

export type ActiveTab = "scroll" | "apps" | "system";

interface TopBarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  enabled: boolean;
  onToggleEnabled: () => void;
  hotkey: string;
  lang: Lang;
}

export function TopBar({
  activeTab,
  onTabChange,
  enabled,
  onToggleEnabled,
  hotkey,
  lang,
}: TopBarProps) {
  const t = COPY[lang];
  const hotkeyParts = hotkey.split("+").map((part) => part.trim()).filter(Boolean);

  return (
    <div className="top-bar">
      <nav className="tab-nav" role="tablist" aria-label={t.tabs.scroll}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "scroll"}
          className="tab-btn"
          onClick={() => onTabChange("scroll")}
        >
          <Sliders size={16} strokeWidth={1.5} aria-hidden="true" />
          <span>{t.tabs.scroll}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "apps"}
          className="tab-btn"
          onClick={() => onTabChange("apps")}
        >
          <AppWindow size={16} strokeWidth={1.5} aria-hidden="true" />
          <span>{t.tabs.apps}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "system"}
          className="tab-btn"
          onClick={() => onTabChange("system")}
        >
          <Settings2 size={16} strokeWidth={1.5} aria-hidden="true" />
          <span>{t.tabs.system}</span>
        </button>
      </nav>

      <div className="top-controls">
        <button
          type="button"
          className="master-toggle"
          aria-pressed={enabled}
          onClick={onToggleEnabled}
        >
          <span className="power-indicator" aria-hidden="true" />
          <span>{enabled ? t.status.active : t.status.paused}</span>
          <span className="keycap-group" translate="no" aria-hidden="true">
            {hotkeyParts.map((part) => (
              <kbd key={part} className="keycap">
                {part}
              </kbd>
            ))}
          </span>
        </button>
      </div>
    </div>
  );
}
