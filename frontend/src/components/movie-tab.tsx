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
  Sliders,
  AudioWaveform,
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

interface DialogueLine {
  id: string;
  character: string;
  voice: string;
  text: string;
  emotion: string;
  speed: number;
  pause_after_sec: number;
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

  const [sceneTitle, setSceneTitle] = React.useState("ឈុតភាពយន្តថ្មី");
  const [scriptMode, setScriptMode] = React.useState<"lines" | "script">("lines");

  const [scriptText, setScriptText] = React.useState<string>(
    `[អ្នកនិទាន (cinematic)]: នៅសាលាក្តីក្រុងខៃហ្វុង ថ្ងៃនេះមានរឿងចម្លែកមួយបានកើតឡើង។\n[ទិនហ្វី (comedy)]: ឥឡូវឆាប់ដោះលែងគេទាំងពីរទៅ ឲ្យខ្ញុំធ្វើអីក៏បានដែរ លោកម្ចាស់!\n[ប៉ាវចិន (stern)]: ហ៊ានប្រមាថតុលាការឬ? ឈប់សើចភ្លាម! ឆ្មាំទាំងឡាយ យកកាំបិតក្បាលឆ្កែមក!`
  );

  const [lines, setLines] = React.useState<DialogueLine[]>([
    {
      id: "l1",
      character: "អ្នកនិទាន",
      voice: "male_narrator",
      text: "នៅសាលាក្តីក្រុងខៃហ្វុង ថ្ងៃនេះមានរឿងចម្លែកមួយបានកើតឡើង។",
      emotion: "cinematic",
      speed: 0.95,
      pause_after_sec: 0.5,
    },
    {
      id: "l2",
      character: "ទិនហ្វី",
      voice: "tinfy",
      text: "ឥឡូវឆាប់ដោះលែងគេទាំងពីរទៅ ឲ្យខ្ញុំធ្វើអីក៏បានដែរ លោកម្ចាស់!",
      emotion: "comedy",
      speed: 1.05,
      pause_after_sec: 0.4,
    },
    {
      id: "l3",
      character: "ប៉ាវចិន",
      voice: "pao_chin",
      text: "ហ៊ានប្រមាថតុលាការឬ? ឈប់សើចភ្លាម! ឆ្មាំទាំងឡាយ យកកាំបិតក្បាលឆ្កែមក!",
      emotion: "stern",
      speed: 1.0,
      pause_after_sec: 0.5,
    },
  ]);

  const [useLora, setUseLora] = React.useState(true);
  const [isDubbing, setIsDubbing] = React.useState(false);
  const [masterAudioUrl, setMasterAudioUrl] = React.useState<string | null>(null);
  const [totalDuration, setTotalDuration] = React.useState<number>(0);
  const [srtSubtitles, setSrtSubtitles] = React.useState<string>("");
  const [resultLines, setResultLines] = React.useState<DialogueResultItem[]>([]);
  const [copiedSrt, setCopiedSrt] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

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

  const handleParseScript = async (rawScript?: string) => {
    const textToParse = rawScript !== undefined ? rawScript : scriptText;
    if (!textToParse.trim()) return;
    try {
      const res = await fetch(getApiUrl("/api/movie/parse-script"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script_text: textToParse }),
      });
      if (!res.ok) throw new Error("Failed to parse script");
      const data = await res.json();
      if (data.lines && data.lines.length > 0) {
        setLines(
          data.lines.map((l: any, i: number) => ({
            id: `line_${Date.now()}_${i}`,
            character: l.character,
            voice: l.voice,
            text: l.text,
            emotion: l.emotion,
            speed: l.speed || 1.0,
            pause_after_sec: l.pause_after_sec || 0.4,
          }))
        );
        setScriptMode("lines");
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleAddLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: `line_${Date.now()}`,
        character: "តួអង្គ",
        voice: voiceOptions[0]?.value || "male",
        text: "",
        emotion: "neutral",
        speed: 1.0,
        pause_after_sec: 0.4,
      },
    ]);
  };

  const handleRemoveLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const handleUpdateLine = (id: string, updates: Partial<DialogueLine>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
  };

  const handleDubScene = async () => {
    setIsDubbing(true);
    setErrorMessage(null);
    try {
      const payload: any = {
        title: sceneTitle || "Khmer Movie Scene",
        model_id: "voxcpm2_khmer",
        use_lora: useLora,
      };

      if (scriptMode === "script" && scriptText.trim()) {
        payload.script_text = scriptText.trim();
      } else {
        const validLines = lines.filter((l) => l.text.trim().length > 0);
        if (validLines.length === 0) {
          throw new Error("Please enter dialogue text for at least one character line.");
        }
        payload.lines = validLines;
      }

      const res = await fetch(getApiUrl("/api/movie/dub"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Movie dubbing synthesis failed.");
      }

      const data = await res.json();
      setMasterAudioUrl(data.full_audio_url);
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
      {/* Studio Header Card */}
      <Card className="border-slate-800 bg-[#070c18] shadow-sm">
        <CardContent className="p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Badge variant="emerald" className="text-[11px] font-medium">
                  <Clapperboard className="mr-1 h-3.5 w-3.5" /> Movie &amp; Drama Studio
                </Badge>
                <Badge variant="outline" className="border-slate-800 text-slate-400 text-[11px]">
                  48kHz Master Output
                </Badge>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl font-sans">
                បញ្ចូលសំឡេងភាពយន្ត (Multi-Character Movie Dubbing)
              </h2>
              <p className="text-xs md:text-sm text-slate-400 max-w-2xl">
                បញ្ចូលសំឡេងតួអង្គច្រើនក្នុងឈុតតែមួយ ផ្គុំជាបទសំឡេង Master 48kHz ដោយស្វ័យប្រវត្តិ រួមទាំងបង្កើត Subtitle SRT ស្របតាមពេលវេលានិយាយពិតប្រាកដ។
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
        {/* Left Column: Script / Dialogue Line Builder (7 cols) */}
        <div className="space-y-4 lg:col-span-7">
          <Card className="border-slate-800 bg-[#070c18]">
            <CardHeader className="pb-3 border-b border-slate-800/80">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-base text-slate-100 flex items-center gap-2">
                    <Film className="h-4 w-4 text-emerald-400" />
                    តារាងសន្ទនាភាពយន្ត (Dialogue Lines)
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400">
                    កំណត់តួអង្គ សំឡេង អារម្មណ៍ និងសម្ដីសន្ទនានីមួយៗ
                  </CardDescription>
                </div>

                <div className="flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-slate-800 bg-[#0a101f] p-1">
                  <button
                    type="button"
                    onClick={() => setScriptMode("lines")}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      scriptMode === "lines"
                        ? "bg-slate-800 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Dialogue Lines
                  </button>
                  <button
                    type="button"
                    onClick={() => setScriptMode("script")}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      scriptMode === "script"
                        ? "bg-slate-800 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Raw Script Text
                  </button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-4 space-y-4">
              {/* Scene Title Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">ចំណងជើងឈុត (Scene Title)</label>
                <input
                  type="text"
                  value={sceneTitle}
                  onChange={(e) => setSceneTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-[#090f1d] px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                  placeholder="ឧ. ឈុតទីមួយ៖ ជួបគ្នានៅសាលាក្តី..."
                />
              </div>

              {scriptMode === "script" ? (
                /* Raw Script Editor */
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>
                      ទម្រង់សរសេរ៖ <code className="text-emerald-400 font-mono">[ឈ្មោះតួ (emotion)]: សម្ដីសន្ទនា</code>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleParseScript()}
                      className="h-7 text-xs text-emerald-400 hover:text-emerald-300 gap-1.5"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      Convert to Dialogue Cards
                    </Button>
                  </div>
                  <textarea
                    value={scriptText}
                    onChange={(e) => setScriptText(e.target.value)}
                    rows={12}
                    className="w-full rounded-xl border border-slate-800 bg-[#090f1d] p-4 font-mono text-sm leading-relaxed text-slate-100 placeholder-slate-600 focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 resize-y"
                    placeholder="[អ្នកនិទាន (cinematic)]: ខ្យល់បក់ត្រជាក់...\n[ទិនហ្វី (comedy)]: ឥឡូវឆាប់ដោះលែងគេទៅ!\n[ប៉ាវចិន (stern)]: ឈប់សើចភ្លាម!"
                  />
                </div>
              ) : (
                /* Visual Dialogue Cards */
                <div className="space-y-3">
                  {lines.map((line, idx) => (
                    <div
                      key={line.id}
                      className="rounded-xl border border-slate-800 bg-[#090f1d] p-3.5 space-y-3 transition-colors hover:border-slate-700"
                    >
                      {/* Top Row: Line Number + Character Name + Voice + Emotion + Delete */}
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12 sm:items-center">
                        <div className="flex items-center gap-2 sm:col-span-4">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-slate-300">
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
                            placeholder={isLoadingVoices ? "Loading voices..." : "Select Voice"}
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

                      {/* Dialogue Khmer Text */}
                      <textarea
                        value={line.text}
                        onChange={(e) => handleUpdateLine(line.id, { text: e.target.value })}
                        rows={2}
                        className="w-full rounded-lg border border-slate-800 bg-[#070c18] px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-emerald-500/60 focus:outline-none font-sans leading-relaxed resize-y"
                        placeholder="វាយបញ្ចូលសម្ដីសន្ទនាជាភាសាខ្មែរ..."
                      />

                      {/* Sliders: Speech Speed & Pause */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-800/60">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-slate-400">
                            <span>ល្បឿននិយាយ (Speed)</span>
                            <span className="font-mono text-emerald-400">{line.speed.toFixed(2)}x</span>
                          </div>
                          <Slider
                            value={[line.speed]}
                            min={0.8}
                            max={1.25}
                            step={0.02}
                            onValueChange={([val]) => handleUpdateLine(line.id, { speed: val })}
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-slate-400">
                            <span>គម្លាតដកដង្ហើម (Pause After)</span>
                            <span className="font-mono text-cyan-400">{line.pause_after_sec.toFixed(2)}s</span>
                          </div>
                          <Slider
                            value={[line.pause_after_sec]}
                            min={0.1}
                            max={1.5}
                            step={0.05}
                            onValueChange={([val]) => handleUpdateLine(line.id, { pause_after_sec: val })}
                          />
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
                    <Plus className="mr-2 h-4 w-4" /> បន្ថែមប្រយោគសន្ទនា (Add Dialogue Line)
                  </Button>
                </div>
              )}

              {errorMessage && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3 text-xs text-rose-400">
                  {errorMessage}
                </div>
              )}

              {/* Action Button */}
              <Button
                type="button"
                onClick={handleDubScene}
                disabled={isDubbing}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-6 text-base shadow-md shadow-emerald-950/40 gap-2 cursor-pointer"
              >
                {isDubbing ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    កំពុងសំយោគបញ្ចូលសំឡេងភាពយន្ត (Dubbing Movie Scene)...
                  </>
                ) : (
                  <>
                    <Clapperboard className="h-5 w-5" />
                    🎬 ចាប់ផ្ដើមបញ្ចូលសំឡេងភាពយន្ត (Dub Movie Scene)
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Master Output, SRT Subtitles, Timeline (5 cols) */}
        <div className="space-y-4 lg:col-span-5">
          {/* Master Scene Player Card */}
          <Card className="border-slate-800 bg-[#070c18]">
            <CardHeader className="pb-3 border-b border-slate-800/80">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-slate-100 flex items-center gap-2">
                  <AudioWaveform className="h-4 w-4 text-emerald-400" />
                  សំឡេងភាពយន្តពេញលេញ (Master Track)
                </CardTitle>
                {totalDuration > 0 && (
                  <Badge variant="emerald" className="font-mono text-xs py-0">
                    {formatHumanDuration(totalDuration)}
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs text-slate-400">
                សំឡេង 48kHz Master ដែលបានផ្គុំគ្រប់តួអង្គរួចរាល់
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-4">
              {masterAudioUrl ? (
                <div className="space-y-4">
                  <WaveformPlayer
                    audioUrl={getApiUrl(masterAudioUrl)}
                    title={sceneTitle}
                    subtitle={`48kHz Master Output • ${resultLines.length} Dialogue Lines`}
                  />
                  <a
                    href={getApiUrl(masterAudioUrl)}
                    download={`${sceneTitle.replace(/[^\w\u1780-\u17FF]/g, "_") || "movie_scene"}.wav`}
                    className="block"
                  >
                    <Button variant="outline" size="sm" className="w-full border-slate-800 hover:bg-slate-800 text-slate-200">
                      <Download className="mr-2 h-4 w-4" /> Download Scene Audio (WAV)
                    </Button>
                  </a>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-[#090f1d] p-8 text-center text-slate-500">
                  <Clapperboard className="h-10 w-10 text-slate-700 mb-2" />
                  <p className="text-sm font-medium text-slate-300">មិនទាន់មានសំឡេងភាពយន្តនៅឡើយទេ</p>
                  <p className="text-xs text-slate-500 mt-1">
                    ចុចប៊ូតុង "🎬 ចាប់ផ្ដើមបញ្ចូលសំឡេងភាពយន្ត" ដើម្បីបង្កើត Master Audio
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* SRT Subtitle Card */}
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
                <pre className="max-h-56 overflow-y-auto rounded-xl border border-slate-800 bg-[#090f1d] p-3.5 font-mono text-xs leading-relaxed text-slate-300">
                  {srtSubtitles}
                </pre>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-800 bg-[#090f1d] p-6 text-center text-xs text-slate-600">
                  Subtitle SRT នឹងត្រូវបានបង្កើតដោយស្វ័យប្រវត្តិកំឡុងពេល Dubbing
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dialogue Lines Audition Table */}
          {resultLines.length > 0 && (
            <Card className="border-slate-800 bg-[#070c18]">
              <CardHeader className="pb-3 border-b border-slate-800/80">
                <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-emerald-400" />
                  បន្ទាត់សន្ទនាតាមលំដាប់ (Timeline Lines)
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
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
