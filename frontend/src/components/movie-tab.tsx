"use client";

import * as React from "react";
import {
  Clapperboard,
  Play,
  Download,
  Copy,
  Check,
  Plus,
  Trash2,
  Film,
  RefreshCw,
  Clock,
  Layers,
  Wand2,
  Video,
  FileText,
  Upload,
  Volume2,
  CheckCircle2,
} from "lucide-react";
import { getApiUrl } from "@/lib/api";
import { formatHumanDuration } from "@/lib/utils";
import { Button } from "./ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
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

const EMOTION_OPTIONS: DropdownOption[] = [
  { value: "comedy", label: "🎭 កំប្លែង (Comedy Dub)", sublabel: "Playful laughter & high-energy comedy cadence" },
  { value: "stern", label: "⚖️ ម៉ឺងម៉ាត់ (Stern / Authority)", sublabel: "Deep commanding courtroom authority" },
  { value: "cinematic", label: "🎬 ភាពយន្ត (Cinematic Narrator)", sublabel: "Epic movie trailer narrator with resonant pause" },
  { value: "action", label: "⚔️ ប្រយុទ្ធ (Action Combat)", sublabel: "High adrenaline shouting & combat delivery" },
  { value: "sad", label: "😢 សោកសៅ (Melodrama / Sorrow)", sublabel: "Emotional drama, soft trembling sigh" },
  { value: "romantic", label: "💖 ស្នេហា (Romantic / Warm)", sublabel: "Tender heartfelt warmth, soft breathy delivery" },
  { value: "suspense", label: "🤫 រន្ធត់ (Suspense Thriller)", sublabel: "Eerie tension, dark dramatic whisper" },
  { value: "happy", label: "😃 រីករាយ (Happy / Bright)", sublabel: "Joyful smile, bright energetic tone" },
  { value: "neutral", label: "💬 ធម្មតា (Natural Neutral)", sublabel: "Standard natural dialogue pacing" },
];

export function MovieTab() {
  const [voiceOptions, setVoiceOptions] = React.useState<DropdownOption[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = React.useState(true);

  // Mode: "srt_upload" | "dialogue_list"
  const [inputMode, setInputMode] = React.useState<"srt_upload" | "dialogue_list">("srt_upload");

  const [sceneTitle, setSceneTitle] = React.useState("ភាពយន្តបញ្ចូលសំឡេងខ្មែរ");
  const [srtText, setSrtText] = React.useState<string>(`1
00:00:01,000 --> 00:00:03,800
[អ្នកនិទាន (cinematic)]: នៅសាលាក្តីក្រុងខៃហ្វុង ថ្ងៃនេះមានរឿងចម្លែកមួយបានកើតឡើង។

2
00:00:04,400 --> 00:00:07,200
[ទិនហ្វី (comedy)]: ឥឡូវឆាប់ដោះលែងគេទាំងពីរទៅ ឲ្យខ្ញុំធ្វើអីក៏បានដែរ លោកម្ចាស់!

3
00:00:07,800 --> 00:00:11,000
[ប៉ាវចិន (stern)]: ហ៊ានប្រមាថតុលាការឬ? ឈប់សើចភ្លាម! ឆ្មាំទាំងឡាយ យកកាំបិតក្បាលឆ្កែមក!`);

  const [lines, setLines] = React.useState<SubtitledDialogueItem[]>([
    {
      id: "line_1",
      index: 1,
      start_time: 1.0,
      end_time: 3.8,
      character: "អ្នកនិទាន",
      voice: "male_narrator",
      text: "នៅសាលាក្តីក្រុងខៃហ្វុង ថ្ងៃនេះមានរឿងចម្លែកមួយបានកើតឡើង។",
      emotion: "cinematic",
      speed: 0.95,
    },
    {
      id: "line_2",
      index: 2,
      start_time: 4.4,
      end_time: 7.2,
      character: "ទិនហ្វី",
      voice: "tinfy",
      text: "ឥឡូវឆាប់ដោះលែងគេទាំងពីរទៅ ឲ្យខ្ញុំធ្វើអីក៏បានដែរ លោកម្ចាស់!",
      emotion: "comedy",
      speed: 1.05,
    },
    {
      id: "line_3",
      index: 3,
      start_time: 7.8,
      end_time: 11.0,
      character: "ប៉ាវចិន",
      voice: "pao_chin",
      text: "ហ៊ានប្រមាថតុលាការឬ? ឈប់សើចភ្លាម! ឆ្មាំទាំងឡាយ យកកាំបិតក្បាលឆ្កែមក!",
      emotion: "stern",
      speed: 1.0,
    },
  ]);

  // Video File state
  const [videoFile, setVideoFile] = React.useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = React.useState<string | null>(null);

  // Audio Mixing state
  const [mixOriginalAudio, setMixOriginalAudio] = React.useState(true);
  const [bgVolume, setBgVolume] = React.useState(0.15);
  const [useLora, setUseLora] = React.useState(true);

  // Synthesis output state
  const [isDubbing, setIsDubbing] = React.useState(false);
  const [dubbedVideoUrl, setDubbedVideoUrl] = React.useState<string | null>(null);
  const [masterAudioUrl, setMasterAudioUrl] = React.useState<string | null>(null);
  const [totalDuration, setTotalDuration] = React.useState<number>(0);
  const [srtSubtitles, setSrtSubtitles] = React.useState<string>("");
  const [resultLines, setResultLines] = React.useState<DialogueResultItem[]>([]);
  const [copiedSrt, setCopiedSrt] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const videoInputRef = React.useRef<HTMLInputElement>(null);

  // Fetch real Cambodian voices directly from API
  React.useEffect(() => {
    setIsLoadingVoices(true);
    fetch(getApiUrl("/api/voices"))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.voices) {
          const loaded: DropdownOption[] = Object.values(data.voices).map((v: any) => ({
            value: v.id,
            label: v.label || v.id,
            sublabel: v.description || undefined,
          }));
          setVoiceOptions(loaded);
        }
      })
      .catch((err) => {
        console.error("Failed to load real voices:", err);
      })
      .finally(() => {
        setIsLoadingVoices(false);
      });
  }, []);

  // Handle Video file selection
  const handleSelectVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoPreviewUrl(url);
    }
  };

  // Handle Subtitle (.srt) file upload
  const handleSelectSrtFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setSrtText(text);
    handleParseSrtString(text);
  };

  const handleParseSrtString = async (rawSrt?: string) => {
    const content = rawSrt !== undefined ? rawSrt : srtText;
    if (!content.trim()) return;

    try {
      const formData = new FormData();
      formData.append("srt_text", content);

      const res = await fetch(getApiUrl("/api/movie/parse-srt"), {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Failed to parse SRT subtitles");
      const data = await res.json();
      if (data.lines && data.lines.length > 0) {
        setLines(
          data.lines.map((l: any, i: number) => ({
            id: `line_${Date.now()}_${i}`,
            index: l.index || i + 1,
            start_time: l.start_time,
            end_time: l.end_time,
            character: l.character || "អ្នកនិទាន",
            voice: l.voice || "male_narrator",
            text: l.text,
            emotion: l.emotion || "neutral",
            speed: l.speed || 1.0,
          }))
        );
        setInputMode("dialogue_list");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Could not parse SRT subtitle file.");
    }
  };

  const handleAddLine = () => {
    const last = lines[lines.length - 1];
    const newStart = last ? Number((last.end_time + 0.5).toFixed(1)) : 0.0;
    const newEnd = Number((newStart + 3.0).toFixed(1));

    setLines((prev) => [
      ...prev,
      {
        id: `line_${Date.now()}`,
        index: prev.length + 1,
        start_time: newStart,
        end_time: newEnd,
        character: "តួអង្គ",
        voice: voiceOptions[0]?.value || "male",
        text: "",
        emotion: "neutral",
        speed: 1.0,
      },
    ]);
  };

  const handleRemoveLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const handleUpdateLine = (id: string, updates: Partial<SubtitledDialogueItem>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
  };

  // Run Movie / Video Dubbing
  const handleDubVideo = async () => {
    setIsDubbing(true);
    setErrorMessage(null);
    setDubbedVideoUrl(null);

    try {
      const validLines = lines.filter((l) => l.text.trim().length > 0);
      if (validLines.length === 0) {
        throw new Error("Please enter or import at least one Khmer subtitle line.");
      }

      const formData = new FormData();
      formData.append("title", sceneTitle || "Khmer Movie Scene");
      formData.append("lines_json", JSON.stringify(validLines));
      formData.append("model_id", "voxcpm2_khmer");
      formData.append("use_lora", useLora ? "true" : "false");
      formData.append("mix_original_audio", mixOriginalAudio ? "true" : "false");
      formData.append("bg_volume", String(bgVolume));

      if (videoFile) {
        formData.append("video", videoFile);
      }

      const res = await fetch(getApiUrl("/api/movie/dub-video"), {
        method: "POST",
        body: formData,
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
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to dub movie scene.");
    } finally {
      setIsDubbing(false);
    }
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
    a.download = `${sceneTitle.replace(/[^\w\u1780-\u17FF]/g, "_") || "movie_subtitles"}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Studio Banner */}
      <Card className="border-slate-800 bg-[#070c18] shadow-sm">
        <CardContent className="p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Badge variant="emerald" className="text-[11px] font-medium">
                  <Clapperboard className="mr-1 h-3.5 w-3.5" /> Movie &amp; Video Dubbing Studio
                </Badge>
                <Badge variant="outline" className="border-slate-800 text-slate-400 text-[11px]">
                  SRT + Video Auto-Sync
                </Badge>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl font-sans">
                បញ្ចូលសំឡេងភាពយន្តតាម Subtitle &amp; Video (Text-to-Voice Dubbing)
              </h2>
              <p className="text-xs md:text-sm text-slate-400 max-w-2xl">
                បញ្ចូល File Subtitle (SRT) និង Video ដើម្បីសំយោគសំឡេងខ្មែរតាមពេលវេលាជាក់លាក់ (Exact Timecodes) រួចបញ្ចូលសំឡេងចូលក្នុងវីដេអូដោយស្វ័យប្រវត្តិ។
              </p>
            </div>

            <div className="flex items-center gap-3 self-start md:self-auto">
              <div className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-[#090f1d] px-3.5 py-2">
                <Switch checked={useLora} onCheckedChange={setUseLora} id="use-lora-movie" />
                <label htmlFor="use-lora-movie" className="cursor-pointer text-xs font-medium text-slate-200 select-none">
                  Use Fine-Tuned LoRA
                </label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Subtitle & Video Inputs (7 cols) */}
        <div className="space-y-4 lg:col-span-7">
          {/* 1. Upload Video & Subtitle Card */}
          <Card className="border-slate-800 bg-[#070c18]">
            <CardHeader className="pb-3 border-b border-slate-800/80">
              <CardTitle className="text-base text-slate-100 flex items-center gap-2">
                <Upload className="h-4 w-4 text-emerald-400" />
                បញ្ចូល File Subtitle (SRT) &amp; File វីដេអូ (Video)
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Upload File Subtitle និងវីដេអូ ដើម្បីផ្គុំសំឡេងខ្មែរចូលក្នុងវីដេអូ
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-4 space-y-4">
              {/* Dual Upload Area: SRT + Video */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* SRT Subtitle Upload */}
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".srt,.vtt,.txt"
                  onChange={handleSelectSrtFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-[#090f1d] p-4 text-center hover:border-emerald-500/60 transition-colors cursor-pointer group"
                >
                  <FileText className="h-6 w-6 text-emerald-400 mb-1.5 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-semibold text-slate-200">
                    {lines.length > 0 ? `Loaded ${lines.length} Subtitles` : "Upload Subtitle (.SRT)"}
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5">ចុចដើម្បីជ្រើសរើស File .srt</span>
                </button>

                {/* Video Upload */}
                <input
                  type="file"
                  ref={videoInputRef}
                  accept="video/mp4,video/quicktime,video/x-matroska,.mp4,.mov,.mkv"
                  onChange={handleSelectVideo}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className={`flex flex-col items-center justify-center rounded-xl border border-dashed p-4 text-center transition-colors cursor-pointer group ${
                    videoFile
                      ? "border-emerald-500/50 bg-emerald-500/5"
                      : "border-slate-800 bg-[#090f1d] hover:border-cyan-500/60"
                  }`}
                >
                  <Video className={`h-6 w-6 mb-1.5 group-hover:scale-110 transition-transform ${
                    videoFile ? "text-emerald-400" : "text-cyan-400"
                  }`} />
                  <span className="text-xs font-semibold text-slate-200 truncate max-w-[200px]">
                    {videoFile ? videoFile.name : "Upload Movie Video (.MP4)"}
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5">
                    {videoFile ? `${(videoFile.size / (1024 * 1024)).toFixed(1)} MB` : "ចុចដើម្បីជ្រើសរើស Video"}
                  </span>
                </button>
              </div>

              {/* Video Preview if selected */}
              {videoPreviewUrl && (
                <div className="rounded-xl border border-slate-800 bg-[#090f1d] p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Film className="h-3.5 w-3.5 text-cyan-400" />
                      Original Video Preview: {videoFile?.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setVideoFile(null);
                        setVideoPreviewUrl(null);
                      }}
                      className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                  <video src={videoPreviewUrl} controls className="w-full max-h-56 rounded-lg bg-black" />
                </div>
              )}

              {/* Audio Mixing Options */}
              <div className="rounded-xl border border-slate-800 bg-[#090f1d] p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                      រក្សាសំឡេងផ្ទៃខាងក្រោយវីដេអូដើម (Keep Original Music/SFX)
                    </span>
                    <p className="text-[11px] text-slate-500">
                      រក្សាសំឡេងតន្ត្រី និងសម្លេង Effect ដើមរបស់រឿងក្នុងកម្រិតទាប (15%) ហើយបញ្ចូលសំឡេងខ្មែរពីលើ
                    </p>
                  </div>
                  <Switch checked={mixOriginalAudio} onCheckedChange={setMixOriginalAudio} id="mix-audio" />
                </div>

                {mixOriginalAudio && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>កម្រិតសំឡេងដើម (Background SFX Volume)</span>
                      <span className="font-mono text-emerald-400">{Math.round(bgVolume * 100)}%</span>
                    </div>
                    <Slider
                      value={[bgVolume]}
                      min={0.05}
                      max={0.35}
                      step={0.01}
                      onValueChange={([val]) => setBgVolume(val)}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 2. Subtitle Timeline & Dialogue Cards */}
          <Card className="border-slate-800 bg-[#070c18]">
            <CardHeader className="pb-3 border-b border-slate-800/80">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-0.5">
                  <CardTitle className="text-base text-slate-100 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-emerald-400" />
                    តារាង Subtitle តាមពេលវេលា ({lines.length} Lines)
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400">
                    កំណត់តួអង្គ សំឡេង និង Timecodes នីមួយៗ
                  </CardDescription>
                </div>

                <div className="flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-slate-800 bg-[#0a101f] p-1">
                  <button
                    type="button"
                    onClick={() => setInputMode("dialogue_list")}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      inputMode === "dialogue_list"
                        ? "bg-slate-800 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Dialogue Cards
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode("srt_upload")}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      inputMode === "srt_upload"
                        ? "bg-slate-800 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    SRT Text Editor
                  </button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-4 space-y-4">
              {inputMode === "srt_upload" ? (
                /* Raw SRT Editor */
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>អាច Paste អត្ថបទ Subtitle SRT ដោយផ្ទាល់នៅទីនេះ</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleParseSrtString()}
                      className="h-7 text-xs text-emerald-400 hover:text-emerald-300 gap-1.5"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      Parse SRT into Cards
                    </Button>
                  </div>
                  <textarea
                    value={srtText}
                    onChange={(e) => setSrtText(e.target.value)}
                    rows={12}
                    className="w-full rounded-xl border border-slate-800 bg-[#090f1d] p-4 font-mono text-xs leading-relaxed text-slate-100 placeholder-slate-600 focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 resize-y"
                    placeholder="1\n00:00:01,000 --> 00:00:04,000\n[ទិនហ្វី (comedy)]: ឥឡូវឆាប់ដោះលែងគេទៅ!"
                  />
                </div>
              ) : (
                /* Dialogue Line Cards with Timestamps */
                <div className="space-y-3">
                  {lines.map((line, idx) => (
                    <div
                      key={line.id}
                      className="rounded-xl border border-slate-800 bg-[#090f1d] p-3.5 space-y-2.5 transition-colors hover:border-slate-700"
                    >
                      {/* Top Row: Index + Timecode + Character + Voice + Emotion + Delete */}
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-center">
                        <div className="flex items-center gap-2 sm:col-span-4">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-300">
                            {idx + 1}
                          </span>
                          <input
                            type="text"
                            value={line.character}
                            onChange={(e) => handleUpdateLine(line.id, { character: e.target.value })}
                            className="w-full rounded-lg border border-slate-800 bg-[#070c18] px-2.5 py-1.5 text-xs font-semibold text-white focus:border-emerald-500/60 focus:outline-none"
                            placeholder="ឈ្មោះតួអង្គ"
                          />
                        </div>

                        <div className="sm:col-span-4">
                          <CustomDropdown
                            value={line.voice}
                            options={voiceOptions}
                            onChange={(val) => handleUpdateLine(line.id, { voice: val })}
                            placeholder={isLoadingVoices ? "Loading voices..." : "Voice"}
                          />
                        </div>

                        <div className="flex items-center gap-2 sm:col-span-4">
                          <div className="flex-1 min-w-0">
                            <CustomDropdown
                              value={line.emotion}
                              options={EMOTION_OPTIONS}
                              onChange={(val) => handleUpdateLine(line.id, { emotion: val })}
                              placeholder="Emotion"
                            />
                          </div>
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(line.id)}
                              className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-950/20 transition-colors"
                              title="Delete line"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Khmer Dialogue Text */}
                      <textarea
                        value={line.text}
                        onChange={(e) => handleUpdateLine(line.id, { text: e.target.value })}
                        rows={2}
                        className="w-full rounded-lg border border-slate-800 bg-[#070c18] px-3.5 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-emerald-500/60 focus:outline-none font-sans leading-relaxed resize-y"
                        placeholder="អត្ថបទសន្ទនាជាភាសាខ្មែរ..."
                      />

                      {/* Subtitle Timestamp Controls */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-800/60 text-xs text-slate-400">
                        <div className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Start:</span>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={line.start_time}
                            onChange={(e) => handleUpdateLine(line.id, { start_time: parseFloat(e.target.value) || 0 })}
                            className="w-16 rounded border border-slate-800 bg-[#070c18] px-1.5 py-0.5 text-center font-mono text-xs text-emerald-400 focus:outline-none"
                          />
                          <span>s</span>
                          <span className="text-slate-600">→</span>
                          <span>End:</span>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={line.end_time}
                            onChange={(e) => handleUpdateLine(line.id, { end_time: parseFloat(e.target.value) || 0 })}
                            className="w-16 rounded border border-slate-800 bg-[#070c18] px-1.5 py-0.5 text-center font-mono text-xs text-cyan-400 focus:outline-none"
                          />
                          <span>s</span>
                          <span className="text-slate-500 text-[11px]">
                            ({(line.end_time - line.start_time).toFixed(1)}s slot)
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span>Speed:</span>
                          <span className="font-mono text-white text-xs">{line.speed.toFixed(2)}x</span>
                        </div>
                      </div>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddLine}
                    className="w-full border-dashed border-slate-800 bg-transparent text-slate-300 hover:border-emerald-500/60 hover:text-emerald-400 py-4"
                  >
                    <Plus className="mr-2 h-4 w-4" /> បន្ថែមបន្ទាត់សន្ទនា (Add Dialogue Line)
                  </Button>
                </div>
              )}

              {errorMessage && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3 text-xs text-rose-400">
                  {errorMessage}
                </div>
              )}

              {/* Dub Button */}
              <Button
                type="button"
                onClick={handleDubVideo}
                disabled={isDubbing}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-6 text-base shadow-md shadow-emerald-950/40 gap-2 cursor-pointer"
              >
                {isDubbing ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    កំពុងសំយោគសំឡេង និងផ្គុំចូលវីដេអូ (Dubbing Video &amp; Subtitles)...
                  </>
                ) : (
                  <>
                    <Clapperboard className="h-5 w-5" />
                    🎬 ចាប់ផ្ដើមបញ្ចូលសំឡេងភាពយន្ត (Dub Video &amp; Subtitles)
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Output Video Player, Master WAV, & SRT (5 cols) */}
        <div className="space-y-4 lg:col-span-5">
          {/* Dubbed Video Player Card (If video generated) */}
          <Card className="border-slate-800 bg-[#070c18]">
            <CardHeader className="pb-3 border-b border-slate-800/80">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-slate-100 flex items-center gap-2">
                  <Video className="h-4 w-4 text-emerald-400" />
                  វីដេអូដែលបានបញ្ចូលសំឡេងរួច (Dubbed Video)
                </CardTitle>
                {dubbedVideoUrl && (
                  <Badge variant="emerald" className="font-mono text-xs py-0">
                    Ready
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs text-slate-400">
                វីដេអូដែលបានបញ្ចូលសំឡេងខ្មែរស្របតាម Subtitle យ៉ាងសុក្រិត
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-4 space-y-3">
              {dubbedVideoUrl ? (
                <div className="space-y-3">
                  <video
                    src={getApiUrl(dubbedVideoUrl)}
                    controls
                    className="w-full rounded-xl bg-black max-h-72 shadow-md"
                  />
                  <a
                    href={getApiUrl(dubbedVideoUrl)}
                    download={`${sceneTitle.replace(/[^\w\u1780-\u17FF]/g, "_") || "dubbed_movie"}.mp4`}
                    className="block"
                  >
                    <Button variant="emerald" size="sm" className="w-full gap-2 font-semibold">
                      <Download className="h-4 w-4" /> Download Dubbed Video (MP4)
                    </Button>
                  </a>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-[#090f1d] p-7 text-center text-slate-500">
                  <Video className="h-9 w-9 text-slate-700 mb-2" />
                  <p className="text-sm font-medium text-slate-300">មិនទាន់មានវីដេអូនៅឡើយទេ</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Upload file វីដេអូ (.mp4) រួចចុច Dubbing ដើម្បីទាញយកវីដេអូជាភាសាខ្មែរ
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Master 48kHz Audio Track */}
          <Card className="border-slate-800 bg-[#070c18]">
            <CardHeader className="pb-3 border-b border-slate-800/80">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-slate-100 flex items-center gap-2">
                  <Play className="h-4 w-4 text-emerald-400" />
                  សំឡេង Master Track (48kHz WAV)
                </CardTitle>
                {totalDuration > 0 && (
                  <Badge variant="emerald" className="font-mono text-xs py-0">
                    {formatHumanDuration(totalDuration)}
                  </Badge>
                )}
              </div>
            </CardHeader>

            <CardContent className="pt-4">
              {masterAudioUrl ? (
                <div className="space-y-3">
                  <WaveformPlayer
                    audioUrl={getApiUrl(masterAudioUrl)}
                    title={sceneTitle}
                    subtitle={`48kHz Studio Quality • ${resultLines.length} Subtitles`}
                  />
                  <a
                    href={getApiUrl(masterAudioUrl)}
                    download={`${sceneTitle.replace(/[^\w\u1780-\u17FF]/g, "_") || "movie_audio"}.wav`}
                    className="block"
                  >
                    <Button variant="outline" size="sm" className="w-full border-slate-800 hover:bg-slate-800 text-slate-200">
                      <Download className="mr-2 h-4 w-4" /> Download Master Audio (WAV)
                    </Button>
                  </a>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-800 bg-[#090f1d] p-6 text-center text-xs text-slate-600">
                  សំឡេង Master WAV នឹងបង្ហាញនៅទីនេះក្រោយពេលសំយោគរួចរាល់
                </div>
              )}
            </CardContent>
          </Card>

          {/* Synchronized SRT Subtitles */}
          <Card className="border-slate-800 bg-[#070c18]">
            <CardHeader className="pb-3 border-b border-slate-800/80">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base text-slate-100 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-emerald-400" />
                    ចំណងជើងរង (SRT Subtitles)
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400">
                    Timecodes ស្របតាមសំឡេង សម្រាប់ Premiere, CapCut ឬ DaVinci
                  </CardDescription>
                </div>
                {srtSubtitles && (
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" onClick={handleCopySrt} className="h-8 px-2 text-xs text-slate-300">
                      {copiedSrt ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDownloadSrt} className="h-8 px-2 text-xs border-slate-800 text-slate-300">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent className="pt-4">
              {srtSubtitles ? (
                <pre className="max-h-52 overflow-y-auto rounded-xl border border-slate-800 bg-[#090f1d] p-3.5 font-mono text-xs leading-relaxed text-slate-300">
                  {srtSubtitles}
                </pre>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-800 bg-[#090f1d] p-6 text-center text-xs text-slate-600">
                  Subtitle SRT នឹងត្រូវបាន Export ដោយស្វ័យប្រវត្តិកំឡុងពេល Dubbing
                </div>
              )}
            </CardContent>
          </Card>

          {/* Individual Dialogue Audition Lines */}
          {resultLines.length > 0 && (
            <Card className="border-slate-800 bg-[#070c18]">
              <CardHeader className="pb-3 border-b border-slate-800/80">
                <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-emerald-400" />
                  ស្ដាប់សំឡេងតាមបន្ទាត់ Subtitle នីមួយៗ ({resultLines.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {resultLines.map((item) => (
                    <div
                      key={item.line_index}
                      className="flex items-center justify-between rounded-lg border border-slate-800 bg-[#090f1d] p-2.5 text-xs"
                    >
                      <div className="space-y-0.5 overflow-hidden pr-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-emerald-400">{item.character}</span>
                          <span className="font-mono text-[10px] text-slate-500">
                            {item.start_time.toFixed(1)}s - {item.end_time.toFixed(1)}s
                          </span>
                          <Badge variant="outline" className="border-slate-800 text-[10px] py-0 text-slate-400">
                            {item.emotion}
                          </Badge>
                        </div>
                        <p className="truncate text-slate-300">{item.text}</p>
                      </div>
                      <audio controls src={getApiUrl(item.audio_url)} className="h-7 w-28" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
