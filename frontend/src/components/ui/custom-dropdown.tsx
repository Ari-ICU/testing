"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DropdownOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "emerald" | "cyan" | "amber" | "rose";
  icon?: React.ReactNode | string;
  group?: string;
}

export interface CustomDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  searchable?: boolean;
  compact?: boolean;
}

interface MenuCoords {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
  openUp: boolean;
}

export function CustomDropdown({
  value,
  onChange,
  options,
  label,
  placeholder = "Select an option...",
  disabled = false,
  className,
  searchable = false,
  compact = false,
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [coords, setCoords] = React.useState<MenuCoords | null>(null);

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  const computeCoords = React.useCallback((): MenuCoords | null => {
    const el = triggerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const width = compact
      ? Math.min(Math.max(rect.width, 280), vw - 24)
      : Math.min(rect.width, vw - 24);
    const left = Math.max(12, Math.min(rect.left, vw - width - 12));

    const spaceBelow = vh - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(320, Math.max(140, (openUp ? spaceAbove : spaceBelow) - 6));

    return openUp
      ? { bottom: vh - rect.top + 6, left, width, maxHeight, openUp: true }
      : { top: rect.bottom + 6, left, width, maxHeight, openUp: false };
  }, [compact]);

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) {
      setCoords(computeCoords());
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  // Focus search input without scrolling viewport when opened
  React.useEffect(() => {
    if (isOpen && searchable) {
      requestAnimationFrame(() => {
        searchInputRef.current?.focus({ preventScroll: true });
      });
    }
  }, [isOpen, searchable]);

  // Reposition on window resize/scroll, close on outside click or Escape
  React.useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    function handleScrollOrResize(event: Event) {
      // Ignore scrolling inside the dropdown menu itself
      if (event.type === "scroll" && menuRef.current?.contains(event.target as Node)) {
        return;
      }
      const next = computeCoords();
      if (next) setCoords(next);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, { capture: true, passive: true });

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [isOpen, computeCoords]);

  const filteredOptions = React.useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.sublabel && opt.sublabel.toLowerCase().includes(q))
    );
  }, [options, search]);

  const menuNode =
    typeof document !== "undefined" && coords
      ? createPortal(
          <AnimatePresence onExitComplete={() => setCoords(null)}>
            {isOpen && (
              <motion.div
                ref={menuRef}
                initial={{ opacity: 0, y: coords.openUp ? -4 : 4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: coords.openUp ? -3 : 3, scale: 0.98 }}
                transition={{ duration: 0.14, ease: "easeOut" }}
                style={{
                  position: "fixed",
                  top: coords.top,
                  bottom: coords.bottom,
                  left: coords.left,
                  width: coords.width,
                  maxHeight: coords.maxHeight,
                  zIndex: 9999,
                }}
                className="rounded-xl border border-slate-700/90 bg-[#0a101d] p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.75)] overflow-y-auto"
              >
                {searchable && (
                  <div className="p-1.5 mb-1 border-b border-slate-800 flex items-center gap-2 sticky top-0 bg-[#0a101d] z-10">
                    <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search..."
                      className="w-full bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
                    />
                  </div>
                )}

                <div className="space-y-0.5">
                  {filteredOptions.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-500">
                      No matching options
                    </div>
                  ) : (
                    filteredOptions.map((opt) => {
                      const isSelected = opt.value === value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            onChange(opt.value);
                            setIsOpen(false);
                            setSearch("");
                          }}
                          className={cn(
                            "w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer select-none",
                            isSelected
                              ? "bg-emerald-950/60 text-emerald-200 border border-emerald-800/50"
                              : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {opt.icon && (
                              <span className="flex-shrink-0 text-base flex items-center justify-center w-6 h-6 rounded bg-slate-800/80">
                                {opt.icon}
                              </span>
                            )}
                            <div className="min-w-0 flex-1">
                              <div
                                className={cn(
                                  "text-xs md:text-sm font-medium truncate",
                                  isSelected ? "text-emerald-100" : "text-slate-200"
                                )}
                              >
                                {opt.label}
                              </div>
                              {opt.sublabel && (
                                <div className="text-[11px] text-slate-400 truncate">
                                  {opt.sublabel}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {opt.badge && (
                              <span
                                className={cn(
                                  "text-[10px] font-medium px-1.5 py-0.5 rounded border",
                                  isSelected
                                    ? "border-emerald-700 bg-emerald-900/60 text-emerald-200"
                                    : "border-slate-700 bg-slate-800 text-slate-300"
                                )}
                              >
                                {opt.badge}
                              </span>
                            )}
                            {isSelected && (
                              <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )
      : null;

  return (
    <div className={cn("relative w-full", className)}>
      {label && (
        <label className="block text-xs font-medium text-slate-300 mb-1.5">
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className={cn(
          "w-full flex items-center justify-between border text-left transition-all duration-150 select-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/40",
          compact ? "gap-2 px-2.5 py-1.5 rounded-lg" : "gap-3 px-3.5 py-2.5 rounded-lg",
          isOpen
            ? "border-emerald-500/70 bg-[#0d1527] shadow-sm"
            : "border-slate-800 bg-[#0b1120] hover:border-slate-700 hover:bg-[#0e1628]",
          disabled && "opacity-50 cursor-not-allowed pointer-events-none"
        )}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {selectedOption?.icon && !compact && (
            <span className="flex-shrink-0 text-base flex items-center justify-center w-6 h-6 rounded bg-slate-800/80">
              {selectedOption.icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className={cn("font-medium text-slate-100 truncate", compact ? "text-xs" : "text-sm")}>
              {selectedOption ? selectedOption.label : placeholder}
            </div>
            {selectedOption?.sublabel && !compact && (
              <div className="text-xs text-slate-400 truncate">
                {selectedOption.sublabel}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {selectedOption?.badge && !compact && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded border border-emerald-800/60 bg-emerald-950/40 text-emerald-300">
              {selectedOption.badge}
            </span>
          )}
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <ChevronDown className={cn("text-slate-400", compact ? "w-3.5 h-3.5" : "w-4 h-4")} />
          </motion.div>
        </div>
      </button>

      {menuNode}
    </div>
  );
}
