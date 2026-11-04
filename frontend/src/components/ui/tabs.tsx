"use client";

import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 p-1 rounded-xl bg-[#0b1120] border border-slate-800/90 overflow-x-auto select-none",
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative flex items-center gap-2 px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap z-10",
              isActive ? "text-white font-semibold" : "text-slate-400 hover:text-slate-200"
            )}
          >
            {isActive && (
              <motion.div
                layoutId="active-tab-pill"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className="absolute inset-0 bg-slate-800 border border-slate-700/80 rounded-lg -z-10 shadow-sm"
              />
            )}
            {tab.icon && <span className="text-base">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge && (
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-mono",
                  isActive
                    ? "bg-emerald-950/80 text-emerald-300 border border-emerald-700/60"
                    : "bg-slate-900 text-slate-400 border border-slate-800"
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

