import { Lightbulb, X } from "lucide-react";

export interface MicroTip {
  id: string;
  text: string;
}

interface ContextualTipProps {
  tip: MicroTip | null;
  onDismiss: (id: string) => void;
}

export function ContextualTip({ tip, onDismiss }: ContextualTipProps) {
  if (!tip) return null;

  return (
    <div className="contextual-tip" role="status" aria-live="polite">
      <span className="tip-icon" aria-hidden="true">
        <Lightbulb size={14} strokeWidth={1.6} />
      </span>
      <span className="tip-text">{tip.text}</span>
      <button
        type="button"
        className="tip-dismiss"
        aria-label="Dismiss tip"
        onClick={() => onDismiss(tip.id)}
      >
        <X size={13} strokeWidth={1.6} aria-hidden="true" />
      </button>
    </div>
  );
}
