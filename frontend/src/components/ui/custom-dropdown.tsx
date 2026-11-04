"use client";

import * as React from "react";
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
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Click outside listener
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const filteredOptions = React.useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.sublabel && opt.sublabel.toLowerCase().includes(q))
    );
  }, [options, search]);

  return (
    <div className={cn("relative w-full", className)} ref={dropdownRef}>
      {label && (
        <label className="block text-xs font-medium text-slate-300 mb-1.5">
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border text-left transition-all duration-150 select-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/40",
          isOpen
            ? "border-emerald-500/70 bg-[#0d1527] shadow-sm"
            : "border-slate-800 bg-[#0b1120] hover:border-slate-700 hover:bg-[#0e1628]",
          disabled && "opacity-50 cursor-not-allowed pointer-events-none"
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {selectedOption?.icon && (
            <span className="flex-shrink-0 text-base flex items-center justify-center w-6 h-6 rounded bg-slate-800/80">
              {selectedOption.icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-slate-100 truncate">
              {selectedOption ? selectedOption.label : placeholder}
            </div>
            {selectedOption?.sublabel && (
              <div className="text-xs text-slate-400 truncate">
                {selectedOption.sublabel}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {selectedOption?.badge && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded border border-emerald-800/60 bg-emerald-950/40 text-emerald-300">
              {selectedOption.badge}
            </span>
          )}
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </motion.div>
        </div>
      </button>

      {/* Popover Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 3, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="absolute z-50 mt-1.5 w-full rounded-xl border border-slate-700/80 bg-[#0a101d] p-1.5 shadow-2xl backdrop-blur-md max-h-80 overflow-y-auto"
          >
            {searchable && (
              <div className="p-1.5 mb-1 border-b border-slate-800 flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
                  autoFocus
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
                          <div className={cn("text-xs md:text-sm font-medium truncate", isSelected ? "text-emerald-100" : "text-slate-200")}>
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
                          <span className={cn(
                            "text-[10px] font-medium px-1.5 py-0.5 rounded border",
                            isSelected
                              ? "border-emerald-700 bg-emerald-900/60 text-emerald-200"
                              : "border-slate-700 bg-slate-800 text-slate-300"
                          )}>
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
      </AnimatePresence>
    </div>
  );
}

