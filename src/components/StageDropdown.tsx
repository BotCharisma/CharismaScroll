import { useEffect, useRef, useState, type KeyboardEvent } from "react";
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
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selected = options.find((opt) => opt.value === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
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

      {open && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          aria-label={ariaLabel}
          className={`cs-dropdown-menu cs-dropdown-${direction}`}
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
        </ul>
      )}
    </div>
  );
}
