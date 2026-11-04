"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Cpu, Disc3, PanelLeftClose, PanelLeftOpen, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SidebarItem {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
}

interface AppSidebarProps {
  items: SidebarItem[];
  activeId: string;
  onChange: (id: string) => void;
  backendOnline: boolean | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn("flex items-center gap-3 min-w-0", collapsed && "justify-center")}>
      <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-tr from-emerald-600 to-cyan-500 flex items-center justify-center shadow-sm">
        <Disc3 className="w-5 h-5 text-zinc-950 animate-spin-slow" />
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <div className="text-sm font-bold tracking-tight text-white truncate">
            🇰🇭 KhmerVoice AI
          </div>
          <div className="text-[10px] font-mono text-emerald-400/90 uppercase tracking-wider">
            VoxCPM 2 Studio
          </div>
        </div>
      )}
    </div>
  );
}

function NavList({
  items,
  activeId,
  onSelect,
  collapsed,
  layoutId,
}: {
  items: SidebarItem[];
  activeId: string;
  onSelect: (id: string) => void;
  collapsed: boolean;
  layoutId: string;
}) {
  return (
    <nav className="flex flex-col gap-1">
      {!collapsed && (
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Workspace
        </div>
      )}
      {items.map((item) => {
        const isActive = item.id === activeId;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            title={collapsed ? item.label : undefined}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg text-left transition-colors cursor-pointer",
              collapsed ? "justify-center p-2.5" : "px-3 py-2.5",
              isActive ? "text-white" : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/40"
            )}
          >
            {isActive && (
              <motion.div
                layoutId={layoutId}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                className="absolute inset-0 rounded-lg bg-slate-800/80 border border-slate-700/70"
              >
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r bg-emerald-400" />
              </motion.div>
            )}
            <Icon
              className={cn(
                "relative w-[18px] h-[18px] shrink-0 transition-colors",
                isActive ? "text-emerald-400" : "text-slate-500 group-hover:text-slate-300"
              )}
            />
            {!collapsed && (
              <span className="relative min-w-0">
                <span className="block text-sm font-medium truncate">{item.label}</span>
                {item.description && (
                  <span className="block text-[11px] text-slate-500 truncate">
                    {item.description}
                  </span>
                )}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function StatusFooter({
  backendOnline,
  collapsed,
}: {
  backendOnline: boolean | null;
  collapsed: boolean;
}) {
  const dot = (
    <span
      className={cn(
        "w-2 h-2 rounded-full shrink-0",
        backendOnline === null
          ? "bg-slate-500 animate-pulse"
          : backendOnline
          ? "bg-emerald-400 shadow-[0_0_8px_#10b981]"
          : "bg-rose-500"
      )}
    />
  );

  if (collapsed) {
    return (
      <div
        className="flex flex-col items-center gap-3 py-2"
        title={backendOnline ? "Backend online · Apple M2 Pro" : "Backend offline"}
      >
        {dot}
        <Cpu className="w-4 h-4 text-emerald-400/80" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#080d19] border border-slate-800 text-xs">
        {dot}
        <span className="font-mono text-[11px] text-slate-300 truncate">
          {backendOnline === null
            ? "Checking backend…"
            : backendOnline
            ? "Backend 127.0.0.1:8000"
            : "Backend offline"}
        </span>
      </div>
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-950/30 border border-emerald-800/50 text-xs text-emerald-300 font-medium">
        <Cpu className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">Apple M2 Pro · 48kHz</span>
      </div>
    </div>
  );
}

export function AppSidebar({
  items,
  activeId,
  onChange,
  backendOnline,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onMobileClose,
}: AppSidebarProps) {
  // Close the mobile drawer on Escape
  React.useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onMobileClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen, onMobileClose]);

  return (
    <>
      {/* Desktop sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 72 : 264 }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        className="hidden lg:flex sticky top-0 h-screen shrink-0 flex-col border-r border-slate-800/90 bg-[#0a0f1d]/90 backdrop-blur-md"
      >
        <div
          className={cn(
            "h-16 flex items-center border-b border-slate-800/80",
            collapsed ? "justify-center px-2" : "justify-between px-4"
          )}
        >
          <Brand collapsed={collapsed} />
          {!collapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="p-1.5 rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 transition-colors cursor-pointer"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className={cn("flex-1 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}>
          <NavList
            items={items}
            activeId={activeId}
            onSelect={onChange}
            collapsed={collapsed}
            layoutId="sidebar-active-desktop"
          />
        </div>

        <div className={cn("border-t border-slate-800/80", collapsed ? "p-2" : "p-3")}>
          {collapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="w-full flex justify-center p-2 mb-1 rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 transition-colors cursor-pointer"
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}
          <StatusFooter backendOnline={backendOnline} collapsed={collapsed} />
        </div>
      </motion.aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onMobileClose}
              className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />
            <motion.aside
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 340, damping: 36 }}
              className="lg:hidden fixed inset-y-0 left-0 z-50 w-72 flex flex-col border-r border-slate-800 bg-[#0a0f1d]"
            >
              <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800/80">
                <Brand collapsed={false} />
                <button
                  type="button"
                  onClick={onMobileClose}
                  className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/60 cursor-pointer"
                  aria-label="Close menu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-4">
                <NavList
                  items={items}
                  activeId={activeId}
                  onSelect={(id) => {
                    onChange(id);
                    onMobileClose();
                  }}
                  collapsed={false}
                  layoutId="sidebar-active-mobile"
                />
              </div>
              <div className="p-3 border-t border-slate-800/80">
                <StatusFooter backendOnline={backendOnline} collapsed={false} />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

