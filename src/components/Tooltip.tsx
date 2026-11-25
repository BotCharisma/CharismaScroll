import { useEffect, useRef, useState, type ReactNode } from "react";

export type TooltipPlacement =
  | "top"
  | "top-start"
  | "top-end"
  | "bottom"
  | "bottom-end"
  | "left"
  | "right";

interface TooltipProps {
  label: string;
  placement?: TooltipPlacement;
  children: ReactNode;
}

// Shared warm-state timestamp so adjacent toolbar tooltips appear instantaneously once one is open
let lastClosedAt = 0;

export function Tooltip({ label, placement = "top", children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [instant, setInstant] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  const handleEnter = () => {
    clearTimer();
    const isWarm = Date.now() - lastClosedAt < 380;
    if (isWarm) {
      setInstant(true);
      setOpen(true);
    } else {
      setInstant(false);
      timerRef.current = window.setTimeout(() => {
        setOpen(true);
      }, 360);
    }
  };

  const handleLeave = () => {
    clearTimer();
    if (open) {
      lastClosedAt = Date.now();
    }
    setOpen(false);
  };

  const handleFocus = () => {
    clearTimer();
    setInstant(true);
    setOpen(true);
  };

  const handleBlur = () => {
    clearTimer();
    setOpen(false);
  };

  return (
    <span
      className="cs-tip-anchor"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={`cs-tooltip cs-tooltip-${placement}${instant ? " is-instant" : ""}`}
        >
          {label}
        </span>
      )}
    </span>
  );
}
