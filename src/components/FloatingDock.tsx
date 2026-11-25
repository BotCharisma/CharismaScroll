import { ArrowRight, ArrowUpDown, CornerUpLeft, MoveHorizontal } from "lucide-react";
import type { ScrollProfile } from "../lib/tauri";
import { Tooltip } from "./Tooltip";

interface FloatingDockProps {
  enabled: boolean;
  onToggleEnabled: () => void;
  profile: ScrollProfile;
  onChangeProfile: (next: ScrollProfile) => void;
  onCyclePreset: () => void;
}

export function FloatingDock({
  enabled,
  onToggleEnabled,
  profile,
  onChangeProfile,
  onCyclePreset,
}: FloatingDockProps) {
  return (
    <div className="floating-dock" role="toolbar" aria-label="Quick scroll controls">
      <Tooltip label={enabled ? "Pause smooth scrolling" : "Resume smooth scrolling"} placement="top">
        <button
          type="button"
          className="dock-power-btn"
          aria-pressed={enabled}
          onClick={onToggleEnabled}
        >
          <span className={enabled ? "power-led is-on" : "power-led"} aria-hidden="true" />
          <span>{enabled ? "Active" : "Paused"}</span>
        </button>
      </Tooltip>

      <span className="dock-sep" aria-hidden="true" />

      <Tooltip label="Natural vertical direction" placement="top">
        <button
          type="button"
          className="dock-icon-btn"
          aria-pressed={profile.reverseVertical}
          aria-label="Natural vertical direction"
          onClick={() =>
            onChangeProfile({ ...profile, reverseVertical: !profile.reverseVertical })
          }
        >
          <ArrowUpDown size={15} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </Tooltip>

      <Tooltip label="Shift + wheel horizontal pan" placement="top">
        <button
          type="button"
          className="dock-icon-btn"
          aria-pressed={profile.shiftWheelHorizontal}
          aria-label="Shift + wheel horizontal pan"
          onClick={() =>
            onChangeProfile({
              ...profile,
              shiftWheelHorizontal: !profile.shiftWheelHorizontal,
            })
          }
        >
          <MoveHorizontal size={15} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </Tooltip>

      <Tooltip label="Stop glide on direction reversal" placement="top">
        <button
          type="button"
          className="dock-icon-btn"
          aria-pressed={profile.stopOnReverse}
          aria-label="Stop momentum on direction reversal"
          onClick={() =>
            onChangeProfile({ ...profile, stopOnReverse: !profile.stopOnReverse })
          }
        >
          <CornerUpLeft size={15} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </Tooltip>

      <Tooltip label="Cycle scroll preset" placement="top">
        <button
          type="button"
          className="dock-cycle-btn"
          data-tour="cycle"
          aria-label="Next scroll preset"
          onClick={onCyclePreset}
        >
          <ArrowRight size={17} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </Tooltip>
    </div>
  );
}
