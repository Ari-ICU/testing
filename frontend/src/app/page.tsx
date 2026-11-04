"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Disc3, Dna, Flame, Library, Menu } from "lucide-react";
import { getApiUrl } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { AppSidebar, type SidebarItem } from "@/components/app-sidebar";
import { StudioTab } from "@/components/studio-tab";
import { FinetuneTab } from "@/components/finetune-tab";
import { HistoryTab } from "@/components/history-tab";

const NAV_ITEMS: SidebarItem[] = [
  {
    id: "studio",
    label: "Speech Studio",
    description: "Voice cloning & TTS",
    icon: Dna,
  },
  {
    id: "finetune",
    label: "LoRA Fine-Tuning",
    description: "Train a custom voice",
    icon: Flame,
  },
  {
    id: "history",
    label: "Audio Library",
    description: "Generated audio history",
    icon: Library,
  },
];

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  studio: {
    title: "Voice Cloning & Speech Studio",
    subtitle: "Natural Khmer TTS with zero-shot and ultimate voice cloning",
  },
  finetune: {
    title: "Voice Clone LoRA Fine-Tuning",
    subtitle: "Train a LoRA adapter on your own voice recordings",
  },
  history: {
    title: "Generated Audio Library",
    subtitle: "Browse, replay and download previously generated audio",
  },
};

const SIDEBAR_COLLAPSED_KEY = "kv-sidebar-collapsed";

export default function Home() {
  const [mounted, setMounted] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("studio");
  const [backendOnline, setBackendOnline] = React.useState<boolean | null>(null);
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    setMounted(true);
  }, []);

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((prev) => {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, prev ? "0" : "1");
      return !prev;
    });
  }, []);

  const closeMobile = React.useCallback(() => setMobileOpen(false), []);

  // Check backend health
  React.useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch(getApiUrl("/api/models"));
        setBackendOnline(res.ok);
      } catch (_) {
        setBackendOnline(false);
      }
    }
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  if (!mounted) {
    return (
      <main
        className="min-h-screen bg-[#070b14] text-slate-100 flex items-center justify-center font-sans"
        suppressHydrationWarning
      >
        <div
          className="flex items-center gap-3 text-slate-400 text-sm"
          suppressHydrationWarning
        >
          <Disc3 className="w-5 h-5 animate-spin text-emerald-400" />
          <span>Loading KhmerVoice AI Studio...</span>
        </div>
      </main>
    );
  }

  const page = PAGE_TITLES[activeTab];

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex font-sans">
      <AppSidebar
        items={NAV_ITEMS}
        activeId={activeTab}
        onChange={setActiveTab}
        backendOnline={backendOnline}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onMobileClose={closeMobile}
      />

      <main className="flex-1 min-w-0 flex flex-col">
        {/* Page header */}
        <header className="h-16 border-b border-slate-800/90 bg-[#0a0f1d]/80 backdrop-blur-md sticky top-0 z-30">
          <div className="h-full px-4 md:px-6 lg:px-8 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/60 cursor-pointer"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-sm md:text-base font-semibold tracking-tight text-white truncate">
                  {page.title}
                </h1>
                <Badge variant="emerald" className="hidden sm:inline-flex text-[10px] py-0">
                  VoxCPM 2
                </Badge>
              </div>
              <p className="text-xs text-slate-400 truncate hidden sm:block">{page.subtitle}</p>
            </div>
          </div>
        </header>

        {/* Tab panels */}
        <div className="flex-1 w-full px-4 md:px-6 lg:px-8 py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {activeTab === "studio" && <StudioTab />}
              {activeTab === "finetune" && <FinetuneTab />}
              {activeTab === "history" && <HistoryTab />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <footer className="border-t border-slate-800/80 bg-[#060a12] py-4 text-xs text-slate-500">
          <div className="px-4 md:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div>
              Built with <b>Next.js</b> + <b>Motion</b> + <b>Tailwind CSS</b>
            </div>
            <div className="text-[11px] font-mono">
              VoxCPM 2 Khmer · ravuthz/VoxCPM2-khmer · M2 Pro 16GB
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
