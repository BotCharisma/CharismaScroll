import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface DropdownOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface StageDropdownProps {
  id: string;
  ariaLabel: string;
  value: string;
  placeholder?: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  direction?: "up" | "down";
  mono?: boolean;
  minWidthClass?: string;
}

export function StageDropdown({
  id,
  ariaLabel,
  value,
  placeholder = "Select…",
  options,
  onChange,
  direction = "down",
  mono = false,
  minWidthClass = "",
}: StageDropdownProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLUListElement | null>(null);

  const selected = options.find((opt) => opt.value === value);

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const gap = 6;
      const margin = 12;
      const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
      const spaceAbove = rect.top - gap - margin;
      const openUp =
        direction === "up"
          ? spaceAbove >= 120 || spaceAbove >= spaceBelow
          : spaceBelow < 160 && spaceAbove > spaceBelow;

      const width = Math.max(rect.width, 168);
      const maxLeft = Math.max(margin, window.innerWidth - width - margin);
      const left = Math.min(Math.max(margin, rect.left), maxLeft);

      if (openUp) {
        setMenuStyle({
          position: "fixed",
          left,
          bottom: window.innerHeight - rect.top + gap,
          width,
          maxHeight: Math.max(120, Math.min(264, spaceAbove)),
        });
      } else {
        setMenuStyle({
          position: "fixed",
          left,
          top: rect.bottom + gap,
          width,
          maxHeight: Math.max(120, Math.min(264, spaceBelow)),
        });
      }
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, direction]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        rootRef.current &&
        !rootRef.current.contains(target) &&
        (!menuRef.current || !menuRef.current.contains(target))
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const idx = options.findIndex((o) => o.value === value);
      const nextIdx =
        e.key === "ArrowDown"
          ? (idx + 1) % options.length
          : (idx - 1 + options.length) % options.length;
      if (options[nextIdx]) onChange(options[nextIdx].value);
    }
  };

  return (
    <div ref={rootRef} className={`cs-dropdown ${minWidthClass}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={`${id}-listbox`}
        aria-label={ariaLabel}
        className={`cs-dropdown-trigger${mono ? " mono-num" : ""}${open ? " is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="cs-dropdown-label">
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={1.6}
          aria-hidden="true"
          className={open ? "cs-dropdown-chevron is-open" : "cs-dropdown-chevron"}
        />
      </button>

      {open &&
        menuStyle &&
        createPortal(
          <ul
            ref={menuRef}
            id={`${id}-listbox`}
            role="listbox"
            aria-label={ariaLabel}
            className="cs-dropdown-menu"
            style={menuStyle}
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <li key={opt.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    className={`cs-dropdown-item${mono ? " mono-num" : ""}${
                      isSelected ? " is-selected" : ""
                    }`}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    <span className="cs-dropdown-item-text">
                      <span>{opt.label}</span>
                      {opt.sublabel && (
                        <span className="cs-dropdown-sub mono-num" translate="no">
                          {opt.sublabel}
                        </span>
                      )}
                    </span>
                    {isSelected && (
                      <Check
                        size={13}
                        strokeWidth={2}
                        className="cs-dropdown-check"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body
        )}
    </div>
  );
}
