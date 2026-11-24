import { ArrowRight, ArrowUpDown, CornerUpLeft, MoveHorizontal } from "lucide-react";
import type { ScrollProfile } from "../lib/tauri";

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
      <button
        type="button"
        className="dock-power-btn"
        aria-pressed={enabled}
        onClick={onToggleEnabled}
      >
        <span className={enabled ? "power-led is-on" : "power-led"} aria-hidden="true" />
        <span>{enabled ? "Active" : "Paused"}</span>
      </button>

      <span className="dock-sep" aria-hidden="true" />

      <button
        type="button"
        className="dock-icon-btn"
        aria-pressed={profile.reverseVertical}
        aria-label="Natural vertical direction"
        title="Natural vertical direction"
        onClick={() =>
          onChangeProfile({ ...profile, reverseVertical: !profile.reverseVertical })
        }
      >
        <ArrowUpDown size={15} strokeWidth={1.5} aria-hidden="true" />
      </button>

      <button
        type="button"
        className="dock-icon-btn"
        aria-pressed={profile.shiftWheelHorizontal}
        aria-label="Shift + wheel horizontal pan"
        title="Shift + wheel horizontal pan"
        onClick={() =>
          onChangeProfile({
            ...profile,
            shiftWheelHorizontal: !profile.shiftWheelHorizontal,
          })
        }
      >
        <MoveHorizontal size={15} strokeWidth={1.5} aria-hidden="true" />
      </button>

      <button
        type="button"
        className="dock-icon-btn"
        aria-pressed={profile.stopOnReverse}
        aria-label="Stop momentum on direction reversal"
        title="Stop momentum on direction reversal"
        onClick={() =>
          onChangeProfile({ ...profile, stopOnReverse: !profile.stopOnReverse })
        }
      >
        <CornerUpLeft size={15} strokeWidth={1.5} aria-hidden="true" />
      </button>

      <button
        type="button"
        className="dock-cycle-btn"
        aria-label="Next scroll preset"
        title="Next scroll preset"
        onClick={onCyclePreset}
      >
        <ArrowRight size={17} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  );
}
