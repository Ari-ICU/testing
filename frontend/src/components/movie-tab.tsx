"use client";

import * as React from "react";
import {
  Clapperboard,
  Download,
  Copy,
  Check,
  Plus,
  Trash2,
  Film,
  RefreshCw,
  Clock,
  Wand2,
  Video,
  FileText,
  Volume2,
  Search,
  ChevronLeft,
  ChevronRight,
  StopCircle,
  Sparkles,
  CheckCircle2,
  Play,
  Pause,
  X,
} from "lucide-react";
import { getApiUrl } from "@/lib/api";
import { formatHumanDuration } from "@/lib/utils";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { CustomDropdown, DropdownOption } from "./ui/custom-dropdown";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";
import { Badge } from "./ui/badge";
import { WaveformPlayer } from "./ui/waveform-player";

interface SubtitledDialogueItem {
  id: string;
  index: number;
  start_time: number;
  end_time: number;
  character: string;
  voice: string;
  text: string;
  emotion: string;
  speed: number;
}

interface DialogueResultItem {
  line_index: number;
  character: string;
  voice: string;
  emotion: string;
  text: string;
  start_time: number;
  end_time: number;
  duration: number;
  audio_url: string;
}

interface MovieProgressState {
  active: boolean;
  current_line: number;
  completed_lines: number;
  total_lines: number;
  percent: number;
  stage: string;
  current_character: string;
  current_text: string;
  elapsed_sec: number;
  eta_sec: number | null;
}

interface ApiVoiceProfile {
  id: string;
  label?: string;
  description?: string;
  speaker_id?: string;
}

interface ApiModelMeta {
  id: string;
  name?: string;
  execution?: string;
  description?: string;
}

interface ApiParsedLine {
  index?: number;
  start_time?: number;
  end_time?: number;
  character?: string;
  voice?: string;
  text: string;
  emotion?: string;
  speed?: number;
  pause_after_sec?: number;
}

const EMOTION_OPTIONS: DropdownOption[] = [
  { value: "neutral", label: "💬 ធម្មតា (Neutral)", sublabel: "Natural dialogue cadence" },
  { value: "cinematic", label: "🎬 ភាពយន្ត (Cinematic)", sublabel: "Resonant movie narrator" },
  { value: "comedy", label: "🎭 កំប្លែង (Comedy)", sublabel: "Playful high-energy comedy" },
  { value: "stern", label: "⚖️ ម៉ឺងម៉ាត់ (Stern)", sublabel: "Deep commanding authority" },
  { value: "action", label: "⚔️ ប្រយុទ្ធ (Action)", sublabel: "Intense adrenaline delivery" },
  { value: "sad", label: "😢 សោកសៅ (Sorrow)", sublabel: "Emotional drama & soft sigh" },
  { value: "romantic", label: "💖 ស្នេហា (Romantic)", sublabel: "Tender heartfelt warmth" },
  { value: "suspense", label: "🤫 រន្ធត់ (Suspense)", sublabel: "Tense dramatic whisper" },
  { value: "happy", label: "😃 រីករាយ (Happy)", sublabel: "Bright joyful expression" },
];

const PAGE_SIZE = 15;

function formatShortTime(seconds: number): string {
  const safe = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(safe / 60);
  const secs = (safe % 60).toFixed(1).padStart(4, "0");
  return `${mins}:${secs}`;
}

function splitVoiceLabel(rawLabel: string, fallbackId: string, description?: string): { label: string; sublabel: string } {
  const idx = rawLabel.indexOf(" (");
  if (idx > 0 && rawLabel.endsWith(")")) {
    return {
      label: rawLabel.slice(0, idx).trim(),
      sublabel: rawLabel.slice(idx + 2, -1).trim(),
    };
  }
  return {
    label: rawLabel || fallbackId,
    sublabel: description || "",
  };
}

export function MovieTab() {
  const [voiceOptions, setVoiceOptions] = React.useState<DropdownOption[]>([]);
  const [modelOptions, setModelOptions] = React.useState<DropdownOption[]>([]);
  const [selectedModelId, setSelectedModelId] = React.useState("voxcpm2_khmer");
  const [isLoadingMeta, setIsLoadingMeta] = React.useState(true);

  const [sceneTitle, setSceneTitle] = React.useState("");
  const [lines, setLines] = React.useState<SubtitledDialogueItem[]>([]);

  // Editor Tab: "timeline" | "raw"
  const [viewMode, setViewMode] = React.useState<"timeline" | "raw">("timeline");
  const [rawEditorText, setRawEditorText] = React.useState("");

  // Timeline filter & pagination
  const [searchQuery, setSearchQuery] = React.useState("");
  const [characterFilter, setCharacterFilter] = React.useState("all");
  const [currentPage, setCurrentPage] = React.useState(1);

  // Bulk assignment toolbar
  const [bulkVoice, setBulkVoice] = React.useState("male_narrator");
  const [bulkEmotion, setBulkEmotion] = React.useState("cinematic");
  const [bulkSpeed, setBulkSpeed] = React.useState(1.0);

  // Media files
  const [srtFileName, setSrtFileName] = React.useState<string | null>(null);
  const [videoFile, setVideoFile] = React.useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = React.useState<string | null>(null);
  const [showVideoPreview, setShowVideoPreview] = React.useState(true);

  // Audio mixing & model config
  const [mixOriginalAudio, setMixOriginalAudio] = React.useState(true);
  const [bgVolume, setBgVolume] = React.useState(0.15);
  const [useLora, setUseLora] = React.useState(true);

  // Synthesis & Progress state
  const [isDubbing, setIsDubbing] = React.useState(false);
  const [progress, setProgress] = React.useState<MovieProgressState>({
    active: false,
    current_line: 0,
    completed_lines: 0,
    total_lines: 0,
    percent: 0,
    stage: "",
    current_character: "",
    current_text: "",
    elapsed_sec: 0,
    eta_sec: null,
  });

  // Output results
  const [dubbedVideoUrl, setDubbedVideoUrl] = React.useState<string | null>(null);
  const [masterAudioUrl, setMasterAudioUrl] = React.useState<string | null>(null);
  const [totalDuration, setTotalDuration] = React.useState<number>(0);
  const [srtSubtitles, setSrtSubtitles] = React.useState<string>("");
  const [resultLines, setResultLines] = React.useState<DialogueResultItem[]>([]);
  const [outputTab, setOutputTab] = React.useState<"video" | "audio" | "srt" | "clips">("video");
  const [copiedSrt, setCopiedSrt] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Per-line audio preview player
  const [playingLineIdx, setPlayingLineIdx] = React.useState<number | null>(null);
  const lineAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const isDubbingRef = React.useRef(false);
  isDubbingRef.current = isDubbing;

  // Cancel active backend dubbing if user reloads or leaves page
  React.useEffect(() => {
    const cancelIfRunning = () => {
      if (!isDubbingRef.current) return;
      abortControllerRef.current?.abort();
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(getApiUrl("/api/cancel"));
      }
    };
    window.addEventListener("beforeunload", cancelIfRunning);
    return () => {
      window.removeEventListener("beforeunload", cancelIfRunning);
      cancelIfRunning();
    };
  }, []);

  const srtInputRef = React.useRef<HTMLInputElement>(null);
  const scriptInputRef = React.useRef<HTMLInputElement>(null);
  const videoInputRef = React.useRef<HTMLInputElement>(null);

  // Load real voices and real models from API
  React.useEffect(() => {
    let active = true;

    Promise.all([
      fetch(getApiUrl("/api/voices")).then((r) => (r.ok ? r.json() : null)),
      fetch(getApiUrl("/api/models")).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([voicesRes, modelsRes]) => {
        if (!active) return;

        if (voicesRes?.voices) {
          const loadedVoices: DropdownOption[] = Object.values(
            voicesRes.voices as Record<string, ApiVoiceProfile>
          ).map((v) => {
            const { label, sublabel } = splitVoiceLabel(v.label || "", v.id, v.description);
            return {
              value: v.id,
              label,
              sublabel,
            };
          });
          setVoiceOptions(loadedVoices);
          if (loadedVoices.length > 0) {
            setBulkVoice((prev) =>
              loadedVoices.some((v) => v.value === prev) ? prev : loadedVoices[0].value
            );
          }
        }

        if (modelsRes?.models) {
          const loadedModels: DropdownOption[] = Object.values(
            modelsRes.models as Record<string, ApiModelMeta>
          ).map((m) => ({
            value: m.id,
            label: m.name || m.id,
            sublabel: m.execution || m.description,
            badge: m.id === "voxcpm2_khmer" ? "Recommended" : undefined,
          }));
          setModelOptions(loadedModels);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch studio metadata:", err);
      })
      .finally(() => {
        if (active) setIsLoadingMeta(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Revoke object URL on video change/unmount
  React.useEffect(() => {
    return () => {
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    };
  }, [videoPreviewUrl]);

  // Unique characters present in current timeline
  const characterList = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of lines) {
      const key = l.character.trim() || "អ្នកនិទាន";
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries());
  }, [lines]);

  // Filter lines by character and search query
  const filteredLines = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return lines.filter((l) => {
      if (characterFilter !== "all" && (l.character.trim() || "អ្នកនិទាន") !== characterFilter) {
        return false;
      }
      if (!q) return true;
      return (
        l.text.toLowerCase().includes(q) ||
        l.character.toLowerCase().includes(q) ||
        String(l.index).includes(q)
      );
    });
  }, [lines, characterFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredLines.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedLines = React.useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredLines.slice(start, start + PAGE_SIZE);
  }, [filteredLines, safePage]);

  const timelineEndSec = React.useMemo(() => {
    if (lines.length === 0) return 0;
    return Math.max(...lines.map((l) => l.end_time || 0));
  }, [lines]);

  // Fast map from line index -> synthesized audio URL
  const resultUrlByIndex = React.useMemo(() => {
    const map = new Map<number, string>();
    for (const r of resultLines) {
      map.set(r.line_index, r.audio_url);
    }
    return map;
  }, [resultLines]);

  const handleSelectVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoFile(file);
    setVideoPreviewUrl(URL.createObjectURL(file));
    setShowVideoPreview(true);
    if (!sceneTitle.trim()) {
      setSceneTitle(file.name.replace(/\.[^.]+$/, ""));
    }
  };

  const handleSelectSrtFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMessage(null);
    setSrtFileName(file.name);
    if (!sceneTitle.trim()) {
      setSceneTitle(file.name.replace(/\.[^.]+$/, ""));
    }
    const text = await file.text();
    setRawEditorText(text);
    await handleParseImportText(text, "srt");
    e.target.value = "";
  };

  const handleSelectScriptFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMessage(null);
    const text = await file.text();
    setRawEditorText(text);

    // If user already has SRT timecodes loaded, offer smart mapping directly
    if (lines.length > 0 && !/\d{2}:\d{2}:\d{2}/.test(text)) {
      applyScriptLinesToExistingTimestamps(text);
    } else {
      await handleParseImportText(text, "auto");
    }
    e.target.value = "";
  };

  const applyScriptLinesToExistingTimestamps = (rawScript: string) => {
    const scriptRows = rawScript
      .split(/\r?\n/)
      .map((r) => r.trim())
      .filter((r) => r.length > 0 && !r.startsWith("#"));

    if (scriptRows.length === 0) return;

    setLines((prev) =>
      prev.map((item, idx) => {
        const replacement = scriptRows[idx];
        if (!replacement) return item;
        // Strip optional "[Char]: " prefix if present
        const cleanMatch = replacement.match(/^\s*\[([^\]]+)\]\s*:\s*(.*)$/);
        if (cleanMatch) {
          return {
            ...item,
            character: cleanMatch[1].replace(/\([^)]*\)/, "").trim() || item.character,
            text: cleanMatch[2].trim(),
          };
        }
        return { ...item, text: replacement };
      })
    );
    setViewMode("timeline");
  };

  const handleParseImportText = async (inputText: string, mode: "auto" | "srt" | "script" = "auto") => {
    const content = inputText.trim();
    if (!content) {
      setErrorMessage("Please upload an .SRT file or enter Khmer script text first.");
      return;
    }

    setErrorMessage(null);
    const looksLikeSrt = mode === "srt" || (mode === "auto" && /\d{1,2}:\d{2}[,\.]\d{1,3}\s*-->/.test(content));

    try {
      if (looksLikeSrt) {
        const formData = new FormData();
        formData.append("srt_text", content);
        const res = await fetch(getApiUrl("/api/movie/parse-srt"), {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || "Failed to parse SRT subtitle content.");
        }
        const data = await res.json();
        if (data.lines?.length > 0) {
          setLines(
            (data.lines as ApiParsedLine[]).map((l, i) => ({
              id: `line_${Date.now()}_${i}`,
              index: l.index || i + 1,
              start_time: l.start_time ?? 0,
              end_time: l.end_time ?? 3,
              character: l.character || "អ្នកនិទាន",
              voice: l.voice || "male_narrator",
              text: l.text,
              emotion: l.emotion || "neutral",
              speed: l.speed || 1.0,
            }))
          );
          setViewMode("timeline");
          setCurrentPage(1);
        }
      } else {
        const res = await fetch(getApiUrl("/api/movie/parse-script"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ script_text: content }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || "Failed to parse Khmer script.");
        }
        const data = await res.json();
        if (data.lines?.length > 0) {
          let cursor = 0.5;
          const mapped: SubtitledDialogueItem[] = (data.lines as ApiParsedLine[]).map((l, i) => {
            // Estimate natural reading duration from character count (~12 chars/sec, min 2.2s)
            const estDur = Math.max(2.2, Number(((l.text?.length || 12) / 11.5).toFixed(1)));
            const start = Number(cursor.toFixed(1));
            const end = Number((start + estDur).toFixed(1));
            cursor = end + (Number(l.pause_after_sec) || 0.4);
            return {
              id: `line_${Date.now()}_${i}`,
              index: i + 1,
              start_time: start,
              end_time: end,
              character: l.character || "អ្នកនិទាន",
              voice: l.voice || "male_narrator",
              text: l.text,
              emotion: l.emotion || "neutral",
              speed: l.speed || 1.0,
            };
          });
          setLines(mapped);
          setViewMode("timeline");
          setCurrentPage(1);
        }
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Could not parse input content.");
    }
  };

  const handleAddLine = () => {
    const last = lines[lines.length - 1];
    const newStart = last ? Number((last.end_time + 0.4).toFixed(1)) : 0.0;
    const newEnd = Number((newStart + 3.0).toFixed(1));
    const nextIdx = lines.length + 1;

    setLines((prev) => [
      ...prev,
      {
        id: `line_${Date.now()}`,
        index: nextIdx,
        start_time: newStart,
        end_time: newEnd,
        character: "តួអង្គ",
        voice: bulkVoice || voiceOptions[0]?.value || "male_narrator",
        text: "",
        emotion: bulkEmotion || "neutral",
        speed: 1.0,
      },
    ]);
    setViewMode("timeline");
    const newTotalPages = Math.ceil((lines.length + 1) / PAGE_SIZE);
    setCurrentPage(newTotalPages);
  };

  const handleRemoveLine = (id: string) => {
    setLines((prev) =>
      prev
        .filter((l) => l.id !== id)
        .map((l, idx) => ({ ...l, index: idx + 1 }))
    );
  };

  const handleUpdateLine = (id: string, updates: Partial<SubtitledDialogueItem>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
  };

  const handleApplyBulk = () => {
    const targetIds = new Set(filteredLines.map((l) => l.id));
    if (targetIds.size === 0) return;
    setLines((prev) =>
      prev.map((l) =>
        targetIds.has(l.id)
          ? { ...l, voice: bulkVoice, emotion: bulkEmotion, speed: bulkSpeed }
          : l
      )
    );
  };

  const handleToggleLineAudio = (lineIdx: number, url: string) => {
    const fullUrl = getApiUrl(url);
    if (playingLineIdx === lineIdx) {
      lineAudioRef.current?.pause();
      setPlayingLineIdx(null);
      return;
    }
    if (!lineAudioRef.current) {
      lineAudioRef.current = new Audio();
    }
    lineAudioRef.current.src = fullUrl;
    lineAudioRef.current.play();
    lineAudioRef.current.onended = () => setPlayingLineIdx(null);
    setPlayingLineIdx(lineIdx);
  };

  const handleDubVideo = async () => {
    const validLines = lines.filter((l) => l.text.trim().length > 0);
    if (validLines.length === 0) {
      setErrorMessage("Please upload an .SRT subtitle file, paste Khmer script, or add at least one line first.");
      return;
    }

    setIsDubbing(true);
    setErrorMessage(null);
    setDubbedVideoUrl(null);
    setProgress({
      active: true,
      current_line: 0,
      completed_lines: 0,
      total_lines: validLines.length,
      percent: 1,
      stage: "Preparing Khmer dubbing job...",
      current_character: "",
      current_text: "",
      elapsed_sec: 0,
      eta_sec: null,
    });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Poll real-time progress from backend
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(getApiUrl(`/api/movie/progress?t=${Date.now()}`), {
          cache: "no-store",
        });
        if (res.ok) {
          const pData = await res.json();
          if (pData && typeof pData.percent === "number") {
            setProgress(pData);
          }
        }
      } catch {}
    }, 500);

    try {
      const formData = new FormData();
      formData.append("title", sceneTitle.trim() || "Khmer Dubbed Movie");
      formData.append("lines_json", JSON.stringify(validLines));
      formData.append("model_id", selectedModelId);
      formData.append("use_lora", useLora ? "true" : "false");
      formData.append("mix_original_audio", mixOriginalAudio ? "true" : "false");
      formData.append("bg_volume", String(bgVolume));

      if (videoFile) {
        formData.append("video", videoFile);
      }

      const res = await fetch(getApiUrl("/api/movie/dub-video"), {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Movie dubbing synthesis failed.");
      }

      const data = await res.json();
      setMasterAudioUrl(data.full_audio_url);
      setDubbedVideoUrl(data.video_url || null);
      setTotalDuration(data.total_duration_sec);
      setSrtSubtitles(data.srt_subtitles);
      setResultLines(data.lines || []);
      setOutputTab(data.video_url ? "video" : "audio");
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") {
        setErrorMessage(err instanceof Error ? err.message : "Failed to dub movie scene.");
      }
    } finally {
      clearInterval(pollInterval);
      setIsDubbing(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelDubbing = async () => {
    abortControllerRef.current?.abort();
    isDubbingRef.current = false;
    setIsDubbing(false);
    try {
      await Promise.all([
        fetch(getApiUrl("/api/cancel"), { method: "POST" }),
        fetch(getApiUrl("/api/movie/cancel"), { method: "POST" }),
      ]);
    } catch {}
  };

  const handleClearAll = async () => {
    await handleCancelDubbing();
    setLines([]);
    setSrtFileName(null);
    setRawEditorText("");
    setSearchQuery("");
    setCharacterFilter("all");
    setCurrentPage(1);
    setVideoFile(null);
    setVideoPreviewUrl(null);
    setDubbedVideoUrl(null);
    setMasterAudioUrl(null);
    setTotalDuration(0);
    setSrtSubtitles("");
    setResultLines([]);
    setErrorMessage(null);
  };

  const handleCopySrt = () => {
    if (!srtSubtitles) return;
    navigator.clipboard.writeText(srtSubtitles);
    setCopiedSrt(true);
    setTimeout(() => setCopiedSrt(false), 2000);
  };

  const handleDownloadSrt = () => {
    if (!srtSubtitles) return;
    const blob = new Blob([srtSubtitles], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(sceneTitle || "movie").replace(/[^\w\u1780-\u17FF]/g, "_")}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const validLinesCount = React.useMemo(
    () => lines.filter((l) => l.text.trim().length > 0).length,
    [lines]
  );

  const hasOutputs = Boolean(dubbedVideoUrl || masterAudioUrl || srtSubtitles);

  return (
    <div className="space-y-5 pb-10">
      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={srtInputRef}
        accept=".srt,.vtt"
        onChange={handleSelectSrtFile}
        className="hidden"
      />
      <input
        type="file"
        ref={scriptInputRef}
        accept=".txt,.srt"
        onChange={handleSelectScriptFile}
        className="hidden"
      />
      <input
        type="file"
        ref={videoInputRef}
        accept="video/mp4,video/quicktime,video/x-matroska,.mp4,.mov,.mkv"
        onChange={handleSelectVideo}
        className="hidden"
      />

      {/* Top Project Setup Bar */}
      <Card className="p-4 md:p-5 border-slate-800/90 bg-[#0b1120]/90">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
          <div className="md:col-span-5 space-y-1">
            <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              ឈ្មោះគម្រោងភាពយន្ត (Project Title)
            </label>
            <input
              type="text"
              value={sceneTitle}
              onChange={(e) => setSceneTitle(e.target.value)}
              placeholder="ឧ. រឿងភាគខ្មែរ - ឈុតទី ១..."
              className="w-full h-[38px] rounded-lg border border-slate-800 bg-[#070b14] px-3 text-xs text-white placeholder-slate-500 focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
            />
          </div>

          <div className="md:col-span-4 space-y-1">
            <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              ម៉ូដែលសំឡេង (TTS Engine)
            </label>
            <CustomDropdown
              compact
              value={selectedModelId}
              onChange={setSelectedModelId}
              options={modelOptions}
              placeholder={isLoadingMeta ? "Loading models..." : "Select engine"}
              className="[&>button]:h-[38px]"
            />
          </div>

          <div className="md:col-span-3 flex items-center justify-between md:justify-end gap-3">
            <div className="flex h-[38px] items-center gap-2.5 rounded-lg border border-slate-800 bg-[#070b14] px-3 w-full md:w-auto justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                <label htmlFor="use-lora-movie" className="cursor-pointer text-xs font-medium text-slate-200 select-none">
                  Khmer LoRA
                </label>
              </div>
              <Switch
                checked={useLora}
                onCheckedChange={setUseLora}
                disabled={selectedModelId !== "voxcpm2_khmer"}
                id="use-lora-movie"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
        {/* LEFT COLUMN (7 cols): Media Intake + Compact Paginated Timeline */}
        <div className="space-y-4 lg:col-span-7 min-w-0">
          {/* 1. Compact Upload Bar: Subtitle + Script + Video */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Upload SRT */}
            <button
              type="button"
              onClick={() => srtInputRef.current?.click()}
              className={`min-w-0 w-full overflow-hidden flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all cursor-pointer group ${
                srtFileName
                  ? "border-emerald-500/50 bg-emerald-950/20"
                  : "border-dashed border-slate-700/80 bg-[#0b1120]/70 hover:border-emerald-500/60 hover:bg-[#0e1628]"
              }`}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-100 truncate">
                  {srtFileName ? srtFileName : "1. Upload Subtitle (.SRT)"}
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  {lines.length > 0 ? `${lines.length} ឃ្លា (${formatShortTime(timelineEndSec)})` : "ជ្រើសរើស File .srt / .vtt"}
                </div>
              </div>
            </button>

            {/* Import Khmer Script (.txt) */}
            <button
              type="button"
              onClick={() => scriptInputRef.current?.click()}
              className="min-w-0 w-full overflow-hidden flex items-center gap-3 rounded-xl border border-dashed border-slate-700/80 bg-[#0b1120]/70 p-3.5 text-left hover:border-sky-500/60 hover:bg-[#0e1628] transition-all cursor-pointer group"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
                <Wand2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-100 truncate">
                  {lines.length > 0 ? "Sync Script (.TXT)" : "2. Import Script (.TXT)"}
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  {lines.length > 0 ? "បញ្ចូលអត្ថបទខ្មែរតាម SRT" : "នាំចូលអត្ថបទភាពយន្ត"}
                </div>
              </div>
            </button>

            {/* Upload Video */}
            <div
              onClick={() => videoInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && videoInputRef.current?.click()}
              className={`min-w-0 w-full overflow-hidden flex items-center gap-2.5 rounded-xl border p-3.5 text-left transition-all cursor-pointer group ${
                videoFile
                  ? "border-cyan-500/50 bg-cyan-950/20"
                  : "border-dashed border-slate-700/80 bg-[#0b1120]/70 hover:border-cyan-500/60 hover:bg-[#0e1628]"
              }`}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
                <Video className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-100 truncate">
                  {videoFile ? videoFile.name : "3. Upload Video (.MP4)"}
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  {videoFile ? `${(videoFile.size / (1024 * 1024)).toFixed(1)} MB` : "ជាជម្រើស (Optional)"}
                </div>
              </div>
              {videoFile && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setVideoFile(null);
                    setVideoPreviewUrl(null);
                  }}
                  className="p-1 text-slate-400 hover:text-rose-400 rounded cursor-pointer"
                  title="Remove video"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Collapsible Original Video Preview */}
          {videoPreviewUrl && (
            <Card className="p-3.5 border-slate-800 bg-[#0b1120]/80">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 font-medium text-slate-200 truncate">
                  <Film className="h-4 w-4 text-cyan-400 shrink-0" />
                  <span className="truncate">{videoFile?.name}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowVideoPreview((v) => !v)}
                  className="text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer shrink-0 ml-2"
                >
                  {showVideoPreview ? "Hide Preview" : "Show Preview"}
                </button>
              </div>
              {showVideoPreview && (
                <video src={videoPreviewUrl} controls className="mt-2.5 w-full max-h-52 rounded-lg bg-black" />
              )}
            </Card>
          )}

          {/* 2. Subtitle & Dialogue Timeline Card */}
          <Card className="p-0 overflow-visible border-slate-800 bg-[#0b1120]/90">
            {/* Header & Mode Switch */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 px-4 py-3.5">
              <div className="flex items-center gap-2.5">
                <Clock className="h-4 w-4 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    បន្ទាត់សន្ទនា &amp; Subtitle ({lines.length} Lines)
                  </h3>
                  {lines.length > 0 && (
                    <p className="text-[11px] text-slate-400">
                      រយៈពេលសរុប ~{formatShortTime(timelineEndSec)} · តួអង្គ {characterList.length}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-lg border border-slate-800 bg-[#070b14] p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode("timeline")}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      viewMode === "timeline"
                        ? "bg-slate-800 text-white"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Timeline ({lines.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("raw")}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      viewMode === "raw"
                        ? "bg-slate-800 text-white"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Paste SRT / Script
                  </button>
                </div>

                {(lines.length > 0 || isDubbing || rawEditorText || videoFile || hasOutputs) && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="px-2.5 py-1 text-xs text-slate-400 hover:text-rose-400 rounded-md hover:bg-rose-950/20 transition-colors cursor-pointer"
                    title="Clear all inputs and stop any active synthesis"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {viewMode === "raw" ? (
              /* Raw Paste SRT or Khmer Script Mode */
              <div className="p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                  <span>
                    បិទភ្ជាប់អត្ថបទ <b>.SRT Subtitle</b> ឬ <b>អត្ថបទសន្ទនាខ្មែរ</b> (មួយបន្ទាត់មួយឃ្លា) នៅខាងក្រោម
                  </span>
                </div>
                <textarea
                  value={rawEditorText}
                  onChange={(e) => setRawEditorText(e.target.value)}
                  rows={12}
                  placeholder={`ឧទាហរណ៍ SRT:\n1\n00:00:01,000 --> 00:00:03,800\n[អ្នកនិទាន]: សួស្តីបងប្អូនទាំងអស់គ្នា!\n\nឬបិទភ្ជាប់អត្ថបទខ្មែរផ្ទាល់:\nនៅថ្ងៃនេះមានរឿងចម្លែកមួយបានកើតឡើង។\nតោះយើងទៅមើលទាំងអស់គ្នា!`}
                  className="w-full rounded-xl border border-slate-800 bg-[#070b14] p-3.5 font-sans text-xs md:text-sm leading-relaxed text-slate-100 placeholder-slate-600 focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 resize-y"
                />
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {lines.length > 0 && !/\d{2}:\d{2}:\d{2}/.test(rawEditorText) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => applyScriptLinesToExistingTimestamps(rawEditorText)}
                      className="text-xs gap-1.5 border-sky-700/60 text-sky-300 hover:bg-sky-950/40"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      Replace Text Only (Keep {lines.length} SRT Timestamps)
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="emerald"
                    size="sm"
                    onClick={() => handleParseImportText(rawEditorText, "auto")}
                    className="text-xs gap-1.5"
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    Import into Timeline
                  </Button>
                </div>
              </div>
            ) : (
              /* Interactive Timeline Rows */
              <div className="p-4 space-y-3">
                {/* Empty State when no lines yet */}
                {lines.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-800 bg-[#070b14]/60 p-8 text-center space-y-4">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-800/80 text-emerald-400">
                      <FileText className="h-6 w-6" />
                    </div>
                    <div className="space-y-1 max-w-md mx-auto">
                      <h4 className="text-sm font-semibold text-slate-200">
                        ចាប់ផ្ដើមដោយ Upload Subtitle ឬ អត្ថបទខ្មែរ
                      </h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        ជ្រើសរើស File <code className="text-emerald-400">.srt</code> ឬ File អត្ថបទ <code className="text-sky-400">.txt</code> ពីខាងលើ ឬបិទភ្ជាប់អត្ថបទសន្ទនាផ្ទាល់ ដើម្បីបម្លែងជាសំឡេងភាពយន្តខ្មែរ។
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                      <Button
                        type="button"
                        variant="emerald"
                        size="sm"
                        onClick={() => srtInputRef.current?.click()}
                        className="text-xs gap-1.5"
                      >
                        <FileText className="h-3.5 w-3.5" /> Upload .SRT File
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setViewMode("raw")}
                        className="text-xs gap-1.5"
                      >
                        <Wand2 className="h-3.5 w-3.5" /> Paste Khmer Script
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleAddLine}
                        className="text-xs gap-1.5 text-slate-300"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Blank Line
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Search + Bulk Voice Assignment Bar */}
                    <div className="rounded-xl border border-slate-800/90 bg-[#070b14] p-3 space-y-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="relative flex-1 min-w-[180px]">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => {
                              setSearchQuery(e.target.value);
                              setCurrentPage(1);
                            }}
                            placeholder="ស្វែងរកតាមលេខ តួអង្គ ឬអត្ថបទខ្មែរ..."
                            className="w-full rounded-lg border border-slate-800 bg-[#0b1120] pl-8 pr-7 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-emerald-500/60 focus:outline-none"
                          />
                          {searchQuery && (
                            <button
                              type="button"
                              onClick={() => {
                                setSearchQuery("");
                                setCurrentPage(1);
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        {characterList.length > 1 && (
                          <div className="flex items-center gap-1 flex-wrap">
                            <button
                              type="button"
                              onClick={() => {
                                setCharacterFilter("all");
                                setCurrentPage(1);
                              }}
                              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                                characterFilter === "all"
                                  ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/40"
                                  : "bg-[#0b1120] text-slate-400 border border-slate-800 hover:text-slate-200"
                              }`}
                            >
                              All ({lines.length})
                            </button>
                            {characterList.slice(0, 5).map(([char, count]) => (
                              <button
                                key={char}
                                type="button"
                                onClick={() => {
                                  setCharacterFilter(char);
                                  setCurrentPage(1);
                                }}
                                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                                  characterFilter === char
                                    ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/40"
                                    : "bg-[#0b1120] text-slate-400 border border-slate-800 hover:text-slate-200"
                                }`}
                              >
                                {char} ({count})
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* One-click Bulk Voice/Emotion Assign */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-2 border-t border-slate-800/80 items-center">
                        <div className="sm:col-span-4">
                          <CustomDropdown
                            compact
                            searchable
                            value={bulkVoice}
                            options={voiceOptions}
                            onChange={setBulkVoice}
                            placeholder="Bulk Voice"
                          />
                        </div>
                        <div className="sm:col-span-4">
                          <CustomDropdown
                            compact
                            value={bulkEmotion}
                            options={EMOTION_OPTIONS}
                            onChange={setBulkEmotion}
                            placeholder="Bulk Emotion"
                          />
                        </div>
                        <div className="sm:col-span-4 flex items-center gap-1.5">
                          <input
                            type="number"
                            step="0.05"
                            min="0.7"
                            max="1.3"
                            value={bulkSpeed}
                            onChange={(e) => setBulkSpeed(parseFloat(e.target.value) || 1.0)}
                            className="w-16 rounded-lg border border-slate-800 bg-[#0b1120] px-2 py-1.5 text-center font-mono text-xs text-slate-200 focus:outline-none"
                            title="Bulk Speech Speed"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={handleApplyBulk}
                            className="flex-1 h-8 text-[11px] whitespace-nowrap"
                          >
                            Apply to {filteredLines.length} Lines
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Compact Timeline Rows */}
                    <div className="space-y-2">
                      {pagedLines.length === 0 ? (
                        <div className="py-8 text-center text-xs text-slate-500">
                          No subtitle lines match your filter.
                        </div>
                      ) : (
                        pagedLines.map((line) => {
                          const slotSec = Math.max(0, (line.end_time || 0) - (line.start_time || 0));
                          const audioUrl = resultUrlByIndex.get(line.index);
                          const isPlaying = playingLineIdx === line.index;

                          return (
                            <div
                              key={line.id}
                              className="rounded-xl border border-slate-800/90 bg-[#070b14] p-2.5 sm:p-3 space-y-2 hover:border-slate-700/80 transition-colors"
                            >
                              {/* Compact Top Metadata Strip */}
                              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                                {/* Index + Timecode Badge */}
                                <div className="sm:col-span-5 flex items-center gap-1.5 min-w-0">
                                  <span className="flex h-5 min-w-[22px] px-1 shrink-0 items-center justify-center rounded bg-slate-800 text-[10px] font-mono font-semibold text-slate-300">
                                    #{line.index}
                                  </span>

                                  {/* Start & End Editable Time Inputs */}
                                  <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-[#0b1120] px-1.5 py-0.5 text-[11px] font-mono">
                                    <input
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      value={line.start_time}
                                      onChange={(e) =>
                                        handleUpdateLine(line.id, { start_time: parseFloat(e.target.value) || 0 })
                                      }
                                      className="w-[62px] bg-transparent text-emerald-400 tabular-nums focus:outline-none text-right"
                                      aria-label="Start seconds"
                                    />
                                    <span className="text-slate-600">→</span>
                                    <input
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      value={line.end_time}
                                      onChange={(e) =>
                                        handleUpdateLine(line.id, { end_time: parseFloat(e.target.value) || 0 })
                                      }
                                      className="w-[62px] bg-transparent text-cyan-400 tabular-nums focus:outline-none text-right"
                                      aria-label="End seconds"
                                    />
                                    <span className="text-[10px] text-slate-500 pl-1 border-l border-slate-800">
                                      {slotSec.toFixed(1)}s
                                    </span>
                                  </div>
                                </div>

                                {/* Character + Voice + Emotion + Actions */}
                                <div className="sm:col-span-7 flex items-center gap-1.5 min-w-0">
                                  <input
                                    type="text"
                                    value={line.character}
                                    onChange={(e) => handleUpdateLine(line.id, { character: e.target.value })}
                                    className="w-24 shrink-0 rounded-lg border border-slate-800 bg-[#0b1120] px-2 py-1.5 text-xs font-medium text-slate-200 focus:border-emerald-500/60 focus:outline-none"
                                    placeholder="តួអង្គ"
                                  />

                                  <div className="flex-1 min-w-0">
                                    <CustomDropdown
                                      compact
                                      value={line.voice}
                                      options={voiceOptions}
                                      onChange={(val) => handleUpdateLine(line.id, { voice: val })}
                                      placeholder="Voice"
                                    />
                                  </div>

                                  <div className="w-[125px] shrink-0">
                                    <CustomDropdown
                                      compact
                                      value={line.emotion}
                                      options={EMOTION_OPTIONS}
                                      onChange={(val) => handleUpdateLine(line.id, { emotion: val })}
                                      placeholder="Tone"
                                    />
                                  </div>

                                  {audioUrl && (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleLineAudio(line.index, audioUrl)}
                                      className={`p-1.5 rounded-lg shrink-0 transition-colors cursor-pointer ${
                                        isPlaying
                                          ? "bg-emerald-500 text-slate-950"
                                          : "bg-slate-800 text-emerald-400 hover:bg-slate-700"
                                      }`}
                                      title="Play dubbed audio for this line"
                                    >
                                      {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => handleRemoveLine(line.id)}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 shrink-0 transition-colors cursor-pointer"
                                    title="Delete line"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Clean Dialogue Input */}
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={line.text}
                                  onChange={(e) => handleUpdateLine(line.id, { text: e.target.value })}
                                  placeholder="វាយអត្ថបទសន្ទនាភាសាខ្មែរ..."
                                  className="w-full rounded-lg border border-slate-800/80 bg-[#0b1120] px-3 py-1.5 text-sm text-slate-100 placeholder-slate-600 focus:border-emerald-500/60 focus:outline-none font-sans"
                                />
                                <span
                                  className="shrink-0 text-[10px] font-mono text-slate-400 px-1.5 py-1 rounded bg-[#0b1120] border border-slate-800 cursor-pointer select-none hover:text-white"
                                  title="Click to cycle speech speed (0.9x / 1.0x / 1.1x)"
                                  onClick={() => {
                                    const nextSpeed =
                                      line.speed < 0.98 ? 1.0 : line.speed < 1.08 ? 1.1 : 0.9;
                                    handleUpdateLine(line.id, { speed: nextSpeed });
                                  }}
                                >
                                  {line.speed.toFixed(1)}x
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Pagination & Add Line Footer */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddLine}
                        className="text-xs gap-1.5 border-dashed border-slate-700 hover:border-emerald-500/60 hover:text-emerald-400"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Line
                      </Button>

                      {totalPages > 1 && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-slate-400 text-[11px] font-mono">
                            {(safePage - 1) * PAGE_SIZE + 1}–
                            {Math.min(safePage * PAGE_SIZE, filteredLines.length)} of {filteredLines.length}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={safePage <= 1}
                              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                              className="h-7 px-2"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </Button>
                            <span className="px-2 font-mono text-[11px] text-slate-300">
                              {safePage} / {totalPages}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={safePage >= totalPages}
                              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                              className="h-7 px-2"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* RIGHT COLUMN (5 cols, Sticky): Action Bar, Mixing, Progress & Result Studio */}
        <div className="space-y-4 lg:col-span-5 lg:sticky lg:top-20">
          {/* Action & Mixing Control Card */}
          <Card className="p-4 md:p-5 border-slate-800 bg-[#0b1120]/95 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Clapperboard className="h-4 w-4 text-emerald-400" />
                ការកំណត់ &amp; ដំណើរការបញ្ចូលសំឡេង
              </h3>
              <Badge variant="outline" className="text-[10px] font-mono text-slate-400 border-slate-700">
                48kHz Studio
              </Badge>
            </div>

            {/* Audio Mix Controls (Shown when video uploaded or anytime) */}
            <div className="rounded-xl border border-slate-800 bg-[#070b14] p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                    <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                    រក្សាសំឡេង Background ដើម
                  </span>
                  <p className="text-[11px] text-slate-500">
                    ទុកសំឡេងភ្លេង/SFX ដើមក្នុងកម្រិតទាបនៅពេលបញ្ចូលសំឡេងខ្មែរ
                  </p>
                </div>
                <Switch
                  checked={mixOriginalAudio}
                  onCheckedChange={setMixOriginalAudio}
                  id="mix-audio-right"
                />
              </div>

              {mixOriginalAudio && (
                <div className="pt-2 border-t border-slate-800/70">
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>Original Background Volume</span>
                    <span className="font-mono text-emerald-400">{Math.round(bgVolume * 100)}%</span>
                  </div>
                  <Slider
                    value={[bgVolume]}
                    min={0.0}
                    max={0.4}
                    step={0.01}
                    onValueChange={([val]) => setBgVolume(val)}
                  />
                </div>
              )}
            </div>

            {/* Pre-flight Ready Summary */}
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border ${
                  validLinesCount > 0
                    ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-300"
                    : "border-slate-800 bg-[#070b14] text-slate-500"
                }`}
              >
                <CheckCircle2 className="h-3 w-3" /> {validLinesCount} Subtitle Lines
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border ${
                  videoFile
                    ? "border-cyan-800/60 bg-cyan-950/30 text-cyan-300"
                    : "border-slate-800 bg-[#070b14] text-slate-400"
                }`}
              >
                <Video className="h-3 w-3" /> {videoFile ? "Video Attached (MP4 Out)" : "Audio + SRT Output"}
              </span>
            </div>

            {errorMessage && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-300">
                {errorMessage}
              </div>
            )}

            {/* Real-Time Progress Panel while Dubbing */}
            {isDubbing && (
              <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/20 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    {progress.total_lines > 0
                      ? `Line ${progress.current_line} / ${progress.total_lines}`
                      : "Starting..."}
                  </span>
                  <span className="font-mono text-emerald-400 font-semibold">{progress.percent}%</span>
                </div>

                <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-300"
                    style={{ width: `${Math.max(3, progress.percent)}%` }}
                  />
                </div>

                <div className="text-[11px] text-slate-300 truncate">
                  {progress.stage || "Synthesizing Khmer dialogue..."}
                </div>
                {progress.current_text && (
                  <div className="text-[11px] text-slate-400 italic truncate bg-[#070b14]/60 px-2 py-1 rounded">
                    “{progress.current_text}”
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>Elapsed: {formatHumanDuration(progress.elapsed_sec || 0)}</span>
                  {progress.eta_sec !== null && progress.eta_sec > 0 && (
                    <span>ETA: ~{formatHumanDuration(progress.eta_sec)}</span>
                  )}
                </div>
              </div>
            )}

            {/* Primary CTA Buttons */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={handleDubVideo}
                disabled={isDubbing || validLinesCount === 0}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-5 text-sm shadow-md shadow-emerald-950/40 gap-2 cursor-pointer"
              >
                {isDubbing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    កំពុងបញ្ចូលសំឡេង ({progress.percent}%)...
                  </>
                ) : (
                  <>
                    <Clapperboard className="h-4 w-4" />
                    ចាប់ផ្ដើមបញ្ចូលសំឡេង ({validLinesCount} Lines)
                  </>
                )}
              </Button>

              {isDubbing && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleCancelDubbing}
                  className="py-5 px-3.5 gap-1.5 text-xs"
                  title="Stop Dubbing"
                >
                  <StopCircle className="h-4 w-4" /> Stop
                </Button>
              )}
            </div>
          </Card>

          {/* Clean Output & Export Panel */}
          <Card className="p-0 overflow-hidden border-slate-800 bg-[#0b1120]/95">
            {!hasOutputs ? (
              <div className="p-8 text-center space-y-2">
                <Film className="h-9 w-9 text-slate-700 mx-auto" />
                <p className="text-xs font-medium text-slate-300">លទ្ធផលនឹងបង្ហាញនៅទីនេះ (Result Preview)</p>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto leading-relaxed">
                  ក្រោយពីចុច &quot;ចាប់ផ្ដើមបញ្ចូលសំឡេង&quot; បងនឹងទទួលបាន Video MP4, Master 48kHz WAV និង Subtitle SRT នៅត្រង់នេះ។
                </p>
              </div>
            ) : (
              <div>
                {/* Output Tabs */}
                <div className="flex items-center gap-1 border-b border-slate-800 bg-[#070b14] p-2">
                  {dubbedVideoUrl && (
                    <button
                      type="button"
                      onClick={() => setOutputTab("video")}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        outputTab === "video"
                          ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/40"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      🎬 Video
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOutputTab("audio")}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      outputTab === "audio"
                        ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/40"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    🎧 Master WAV
                  </button>
                  <button
                    type="button"
                    onClick={() => setOutputTab("srt")}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      outputTab === "srt"
                        ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/40"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    📝 SRT
                  </button>
                  <button
                    type="button"
                    onClick={() => setOutputTab("clips")}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      outputTab === "clips"
                        ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/40"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    🎞️ Clips ({resultLines.length})
                  </button>
                </div>

                {/* Output Body */}
                <div className="p-4">
                  {outputTab === "video" && dubbedVideoUrl && (
                    <div className="space-y-3">
                      <video
                        src={getApiUrl(dubbedVideoUrl)}
                        controls
                        className="w-full rounded-xl bg-black max-h-72 shadow-md"
                      />
                      <a
                        href={getApiUrl(dubbedVideoUrl)}
                        download={`${(sceneTitle || "dubbed_movie").replace(/[^\w\u1780-\u17FF]/g, "_")}.mp4`}
                        className="block"
                      >
                        <Button variant="emerald" size="sm" className="w-full gap-2 font-semibold">
                          <Download className="h-4 w-4" /> Download Dubbed Video (MP4)
                        </Button>
                      </a>
                    </div>
                  )}

                  {outputTab === "audio" && masterAudioUrl && (
                    <div className="space-y-3">
                      <WaveformPlayer
                        audioUrl={getApiUrl(masterAudioUrl)}
                        title={sceneTitle || "Master Dub Track"}
                        duration={totalDuration}
                        subtitle={`48kHz Studio · ${resultLines.length} Subtitles`}
                      />
                      <a
                        href={getApiUrl(masterAudioUrl)}
                        download={`${(sceneTitle || "movie_audio").replace(/[^\w\u1780-\u17FF]/g, "_")}.wav`}
                        className="block"
                      >
                        <Button variant="outline" size="sm" className="w-full gap-2 text-slate-200">
                          <Download className="h-4 w-4" /> Download Master Audio (48kHz WAV)
                        </Button>
                      </a>
                    </div>
                  )}

                  {outputTab === "srt" && srtSubtitles && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">Synchronized Khmer SRT</span>
                        <div className="flex items-center gap-1.5">
                          <Button variant="ghost" size="sm" onClick={handleCopySrt} className="h-7 px-2 text-xs gap-1">
                            {copiedSrt ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                            {copiedSrt ? "Copied" : "Copy"}
                          </Button>
                          <Button variant="outline" size="sm" onClick={handleDownloadSrt} className="h-7 px-2.5 text-xs gap-1">
                            <Download className="h-3.5 w-3.5" /> .SRT
                          </Button>
                        </div>
                      </div>
                      <pre className="max-h-64 overflow-y-auto rounded-xl border border-slate-800 bg-[#070b14] p-3 font-mono text-xs leading-relaxed text-slate-300">
                        {srtSubtitles}
                      </pre>
                    </div>
                  )}

                  {outputTab === "clips" && (
                    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                      {resultLines.map((item) => (
                        <div
                          key={item.line_index}
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#070b14] p-2.5 text-xs"
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[10px] text-slate-500">#{item.line_index}</span>
                              <span className="font-semibold text-emerald-400 truncate">{item.character}</span>
                              <span className="font-mono text-[10px] text-slate-500">
                                {formatShortTime(item.start_time)}
                              </span>
                            </div>
                            <p className="truncate text-slate-300">{item.text}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleToggleLineAudio(item.line_index, item.audio_url)}
                            className={`p-2 rounded-full shrink-0 cursor-pointer transition-colors ${
                              playingLineIdx === item.line_index
                                ? "bg-emerald-500 text-slate-950"
                                : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                            }`}
                          >
                            {playingLineIdx === item.line_index ? (
                              <Pause className="h-3.5 w-3.5" />
                            ) : (
                              <Play className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
