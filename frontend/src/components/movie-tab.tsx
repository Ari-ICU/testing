"use client";

import * as React from "react";
import {
  Clapperboard,
  Sparkles,
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

interface MoviePreset {
  id: string;
  title: string;
  genre: string;
  description: string;
  script_text: string;
}

const VOICE_OPTIONS: DropdownOption[] = [
  { value: "tinfy", label: "🎭 ទិនហ្វី (Tinfy)", sublabel: "Classic Khmer Comedy Movie Dub" },
  { value: "pao_chin", label: "⚖️ ប៉ាវចិន (Judge Bao)", sublabel: "Deep Booming Courtroom / Warrior Voice" },
  { value: "male_narrator", label: "🎬 អ្នកនិទាន (Vannak)", sublabel: "Dramatic Cinematic Film Narrator" },
  { value: "male", label: "👨 តារា (Dara)", sublabel: "Hero / Male Protagonist" },
  { value: "female", label: "👩 សុភា (Sophea)", sublabel: "Heroine / Female Lead" },
  { value: "female_youth", label: "👧 ចន្ធូ (Chanthou)", sublabel: "Youthful / Cheerful Sister" },
  { value: "male_reporter", label: "📰 ចាន់ (Chan)", sublabel: "Fast-Paced Action Broadcaster" },
  { value: "female_news", label: "👩‍💼 បុប្ផា (Bopha)", sublabel: "Articulate Announcer" },
  { value: "male_heritage", label: "🏛️ សុខា (Sokha)", sublabel: "Ancient Historical Dignitary" },
  { value: "male_podcast", label: "🎙️ រិទ្ធី (Rithy)", sublabel: "Casual Sidekick" },
];

const EMOTION_OPTIONS: DropdownOption[] = [
  { value: "comedy", label: "🎭 កំប្លែង (Comedy Dub)", sublabel: "Laughing, chuckles, playful comedic pacing" },
  { value: "stern", label: "⚖️ ម៉ឺងម៉ាត់ (Stern / Authority)", sublabel: "Deep, commanding courtroom authority" },
  { value: "cinematic", label: "🎬 ភាពយន្ត (Cinematic Narrator)", sublabel: "Epic trailer narrator, dramatic resonant pause" },
  { value: "action", label: "⚔️ ប្រយុទ្ធ (Action / Screaming)", sublabel: "High adrenaline combat delivery, fast pace" },
  { value: "sad", label: "😢 សោកសៅ (Melodrama / Sorrow)", sublabel: "Tearful drama, trembling soft sigh" },
  { value: "romantic", label: "💖 ស្នេហា (Romantic / Warm)", sublabel: "Tender heartfelt warmth, soft breathy delivery" },
  { value: "suspense", label: "🤫 រន្ធត់ (Suspense / Thriller)", sublabel: "Eerie tension, dark dramatic whisper" },
  { value: "happy", label: "😃 រីករាយ (Happy / Bright)", sublabel: "Joyful smile, bright energetic tone" },
  { value: "neutral", label: "💬 ធម្មតា (Natural Neutral)", sublabel: "Steady, clear cinematic dialogue" },
];

export function MovieTab() {
  const [presets, setPresets] = React.useState<MoviePreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = React.useState<string>("tinfy_vs_pao_chin");
  const [scriptMode, setScriptMode] = React.useState<"script" | "lines">("script");
  const [sceneTitle, setSceneTitle] = React.useState("🎭 ទិនហ្វី ប៉ះ ប៉ាវចិន");
  const [scriptText, setScriptText] = React.useState<string>(`[អ្នកនិទាន (cinematic)]: នៅសាលាក្តីក្រុងខៃហ្វុង ថ្ងៃនេះមានរឿងចម្លែកមួយបានកើតឡើង។
[ទិនហ្វី (comedy)]: ឥឡូវឆាប់ដោះលែងគេទាំងពីរទៅ ឲ្យខ្ញុំធ្វើអីក៏បានដែរ លោកម្ចាស់! ហិហិ!
[ប៉ាវចិន (stern)]: ហ៊ានប្រមាថតុលាការឬ? ឈប់សើចភ្លាម! ឆ្មាំទាំងឡាយ យកកាំបិតក្បាលឆ្កែមក!
[ទិនហ្វី (comedy)]: អូយ! កុំអីលោកបង! ខ្ញុំគ្រាន់តែនិយាយលេងសើចសោះហ្នឹង!
[ប៉ាវចិន (stern)]: នៅចំពោះមុខច្បាប់ គ្មានការលេងសើចឡើយ!`);

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
      text: "ឥឡូវឆាប់ដោះលែងគេទាំងពីរទៅ ឲ្យខ្ញុំធ្វើអីក៏បានដែរ លោកម្ចាស់! ហិហិ!",
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
      pause_after_sec: 0.4,
    },
    {
      id: "l4",
      character: "ទិនហ្វី",
      voice: "tinfy",
      text: "អូយ! កុំអីលោកបង! ខ្ញុំគ្រាន់តែនិយាយលេងសើចសោះហ្នឹង!",
      emotion: "comedy",
      speed: 1.08,
      pause_after_sec: 0.35,
    },
    {
      id: "l5",
      character: "ប៉ាវចិន",
      voice: "pao_chin",
      text: "នៅចំពោះមុខច្បាប់ គ្មានការលេងសើចឡើយ!",
      emotion: "stern",
      speed: 0.98,
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

  // Fetch presets on load
  React.useEffect(() => {
    fetch(getApiUrl("/api/movie/presets"))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.presets) {
          setPresets(data.presets);
        }
      })
      .catch(() => {});
  }, []);

  const handleApplyPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const p = presets.find((x) => x.id === presetId);
    if (!p) return;
    setSceneTitle(p.title);
    setScriptText(p.script_text);
    handleParseScript(p.script_text);
  };

  const handleParseScript = async (rawScript?: string) => {
    const textToParse = rawScript !== undefined ? rawScript : scriptText;
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
            id: `l_${Date.now()}_${i}`,
            character: l.character,
            voice: l.voice,
            text: l.text,
            emotion: l.emotion,
            speed: l.speed || 1.0,
            pause_after_sec: l.pause_after_sec || 0.4,
          }))
        );
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleAddLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: `l_${Date.now()}`,
        character: "តួអង្គ",
        voice: "male",
        text: "សូមបញ្ចូលអត្ថបទសន្ទនាភាពយន្ត...",
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
        payload.lines = lines;
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
      {/* Hero Banner */}
      <Card className="border-emerald-500/30 bg-gradient-to-r from-emerald-950/20 via-zinc-900 to-zinc-950">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                  <Clapperboard className="mr-1.5 h-3.5 w-3.5" /> 🎬 Cinema & Drama Dubbing Studio
                </Badge>
                <Badge variant="secondary" className="bg-zinc-800 text-zinc-300">
                  48kHz Studio Master
                </Badge>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl">
                បញ្ចាំង និងបញ្ចូលសំឡេងភាពយន្តខ្មែរ (Multi-Character Movie Dubbing)
              </h2>
              <p className="text-sm text-zinc-400">
                បញ្ចូលសំឡេងតួអង្គច្រើនក្នុងឈុតតែមួយ (ទិនហ្វី, ប៉ាវចិន, អ្នកនិទាន) ជាមួយចង្វាក់ភាពយន្ត និង Export Subtitle SRT ស្របគ្នាដោយស្វ័យប្រវត្តិ។
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs">
                <Switch checked={useLora} onCheckedChange={setUseLora} id="use-lora-movie" />
                <label htmlFor="use-lora-movie" className="cursor-pointer font-medium text-zinc-300">
                  Use Fine-Tuned LoRA
                </label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preset Scenes Picker */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            ជ្រើសរើសឈុតភាពយន្តគំរូ (Cinema Presets)
          </CardTitle>
          <CardDescription>
            ចុចមួយឃ្លីកដើម្បីទាញយកអត្ថបទសន្ទនារឿងកំប្លែង ប៉ាវចិន ឬភាពយន្តបុរាណ
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(presets.length > 0
              ? presets
              : [
                  {
                    id: "tinfy_vs_pao_chin",
                    title: "🎭 ទិនហ្វី ប៉ះ ប៉ាវចិន",
                    genre: "Comedy / Drama",
                    description: "ឈុតកំប្លែងទិនហ្វីប៉ះលោកប៉ាវចិន",
                    script_text: "",
                  },
                  {
                    id: "ancient_warrior_battle",
                    title: "⚔️ សង្គ្រាមមេទ័ពបុរាណ",
                    genre: "Action / War",
                    description: "ឈុតសមរភូមិកងទ័ពបុរាណ",
                    script_text: "",
                  },
                  {
                    id: "cinematic_trailer",
                    title: "🎬 ស្រមោលរាត្រី Trailer",
                    genre: "Thriller / Mystery",
                    description: "ឈុតខ្លីភាពយន្តភ័យរន្ធត់",
                    script_text: "",
                  },
                ]
            ).map((p) => (
              <button
                key={p.id}
                onClick={() => handleApplyPreset(p.id)}
                className={`flex flex-col text-left p-3.5 rounded-xl border transition-all ${
                  selectedPresetId === p.id
                    ? "border-emerald-500 bg-emerald-500/10 text-white ring-1 ring-emerald-500/50"
                    : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 text-zinc-300"
                }`}
              >
                <span className="font-semibold text-sm text-zinc-100">{p.title}</span>
                <span className="text-xs text-emerald-400/90 font-mono mt-0.5">{p.genre}</span>
                <span className="text-xs text-zinc-400 mt-1 line-clamp-1">{p.description}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Script & Dialogue Studio */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Script / Line Editor */}
        <div className="space-y-4 lg:col-span-7">
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base text-zinc-200 flex items-center gap-2">
                  <Film className="h-4 w-4 text-emerald-400" />
                  អត្ថបទសន្ទនាភាពយន្ត (Movie Script)
                </CardTitle>
                <CardDescription>
                  សរសេរ ឬកែសម្រួលពាក្យសន្ទនារបស់តួអង្គនីមួយៗ
                </CardDescription>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
                <button
                  onClick={() => setScriptMode("script")}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    scriptMode === "script" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Raw Script Text
                </button>
                <button
                  onClick={() => {
                    handleParseScript();
                    setScriptMode("lines");
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    scriptMode === "lines" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Visual Dialogue Lines
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {scriptMode === "script" ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>ទម្រង់៖ <code className="text-emerald-400">[ឈ្មោះតួ (emotion)]: សម្ដីសន្ទនា</code></span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleParseScript()}
                      className="h-7 text-xs text-emerald-400 hover:text-emerald-300"
                    >
                      <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                      Auto-Detect Characters
                    </Button>
                  </div>
                  <textarea
                    value={scriptText}
                    onChange={(e) => setScriptText(e.target.value)}
                    rows={10}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="[អ្នកនិទាន (cinematic)]: ខ្យល់បក់ត្រជាក់...\n[ទិនហ្វី (comedy)]: ឥឡូវឆាប់ដោះលែងគេទៅ!"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  {lines.map((line, idx) => (
                    <div
                      key={line.id}
                      className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3.5 space-y-2.5 transition-all hover:border-zinc-700"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-900 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-300">
                            {idx + 1}
                          </span>
                          <input
                            type="text"
                            value={line.character}
                            onChange={(e) => handleUpdateLine(line.id, { character: e.target.value })}
                            className="w-28 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-semibold text-white focus:border-emerald-500 focus:outline-none"
                            placeholder="ឈ្មោះតួអង្គ"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-36">
                            <CustomDropdown
                              value={line.voice}
                              options={VOICE_OPTIONS}
                              onChange={(val) => handleUpdateLine(line.id, { voice: val })}
                              placeholder="Voice"
                            />
                          </div>
                          <div className="w-36">
                            <CustomDropdown
                              value={line.emotion}
                              options={EMOTION_OPTIONS}
                              onChange={(val) => handleUpdateLine(line.id, { emotion: val })}
                              placeholder="Emotion"
                            />
                          </div>
                          <button
                            onClick={() => handleRemoveLine(line.id)}
                            className="text-zinc-500 hover:text-red-400 p-1 transition-colors"
                            title="Remove line"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <textarea
                        value={line.text}
                        onChange={(e) => handleUpdateLine(line.id, { text: e.target.value })}
                        rows={2}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none"
                        placeholder="សម្ដីសន្ទនាជាភាសាខ្មែរ..."
                      />
                      <div className="flex items-center justify-between text-xs text-zinc-400 pt-1">
                        <div className="flex items-center gap-3">
                          <span>ល្បឿន: {line.speed.toFixed(2)}x</span>
                          <span className="text-zinc-600">|</span>
                          <span>គម្លាតដកដង្ហើម: {line.pause_after_sec.toFixed(2)}s</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddLine}
                    className="w-full border-dashed border-zinc-700 bg-transparent text-zinc-300 hover:border-emerald-500 hover:text-emerald-400"
                  >
                    <Plus className="mr-2 h-4 w-4" /> បន្ថែមប្រយោគសន្ទនា (Add Dialogue Line)
                  </Button>
                </div>
              )}

              {errorMessage && (
                <div className="rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-xs text-red-400">
                  {errorMessage}
                </div>
              )}

              <Button
                onClick={handleDubScene}
                disabled={isDubbing}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-6 text-base shadow-lg shadow-emerald-950/50"
              >
                {isDubbing ? (
                  <>
                    <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
                    កំពុងសំយោគបញ្ចូលសំឡេងភាពយន្ត (Dubbing Movie Scene)...
                  </>
                ) : (
                  <>
                    <Clapperboard className="mr-2 h-5 w-5" />
                    🎬 ចាប់ផ្ដើមបញ្ចូលសំឡេងភាពយន្ត (Dub Movie Scene)
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Master Scene Output & Subtitles */}
        <div className="space-y-4 lg:col-span-5">
          {/* Master Scene Player */}
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-zinc-200 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Play className="h-4 w-4 text-emerald-400" />
                  សំឡេងភាពយន្តពេញលេញ (Master Scene Track)
                </span>
                {totalDuration > 0 && (
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 font-mono text-xs">
                    {formatHumanDuration(totalDuration)}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                សំឡេង 48kHz Master ដែលបានផ្គុំគ្រប់តួអង្គទាំងអស់ជាមួយចង្វាក់ភាពយន្ត
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {masterAudioUrl ? (
                <div className="space-y-4">
                  <WaveformPlayer
                    audioUrl={getApiUrl(masterAudioUrl)}
                    title={sceneTitle}
                    subtitle={`48kHz Master • ${resultLines.length} lines`}
                  />
                  <div className="flex gap-2">
                    <a
                      href={getApiUrl(masterAudioUrl)}
                      download={`${sceneTitle.replace(/[^\w\u1780-\u17FF]/g, "_") || "movie_scene"}.wav`}
                      className="flex-1"
                    >
                      <Button variant="outline" size="sm" className="w-full border-zinc-700 hover:bg-zinc-800">
                        <Download className="mr-2 h-4 w-4" /> Download Scene Audio (WAV)
                      </Button>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 p-8 text-center text-zinc-500">
                  <Clapperboard className="h-10 w-10 text-zinc-700 mb-2" />
                  <p className="text-sm font-medium text-zinc-400">មិនទាន់មានសំឡេងភាពយន្តនៅឡើយទេ</p>
                  <p className="text-xs text-zinc-600 mt-1">
                    ចុចប៊ូតុង "🎬 ចាប់ផ្ដើមបញ្ចូលសំឡេងភាពយន្ត" ដើម្បីបង្កើត Master Audio
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Subtitles (SRT) & Timeline */}
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base text-zinc-200 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-emerald-400" />
                  ចំណងជើងរងភាពយន្ត (SRT Subtitles)
                </CardTitle>
                <CardDescription>
                  Exact timecodes ស្របតាមសំឡេង សម្រាប់ទម្លាក់ចូល Premiere, CapCut ឬ DaVinci
                </CardDescription>
              </div>
              {srtSubtitles && (
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="sm" onClick={handleCopySrt} className="h-8 px-2 text-xs">
                    {copiedSrt ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownloadSrt} className="h-8 px-2 text-xs border-zinc-700">
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {srtSubtitles ? (
                <pre className="max-h-60 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 font-mono text-xs leading-relaxed text-zinc-300">
                  {srtSubtitles}
                </pre>
              ) : (
                <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/30 p-6 text-center text-xs text-zinc-600">
                  Subtitle SRT នឹងត្រូវបានបង្កើតដោយស្វ័យប្រវត្តិកំឡុងពេល Dubbing
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dialogue Lines Timeline Audition */}
          {resultLines.length > 0 && (
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-emerald-400" />
                  បន្ទាត់សន្ទនាតាមលំដាប់ (Timeline Lines)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {resultLines.map((item) => (
                    <div
                      key={item.line_index}
                      className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-950/80 p-2.5 text-xs"
                    >
                      <div className="space-y-0.5 overflow-hidden pr-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-emerald-400">{item.character}</span>
                          <span className="font-mono text-[10px] text-zinc-500">
                            {item.start_time.toFixed(1)}s - {item.end_time.toFixed(1)}s
                          </span>
                          <Badge variant="outline" className="border-zinc-800 text-[10px] py-0 text-zinc-400">
                            {item.emotion}
                          </Badge>
                        </div>
                        <p className="truncate text-zinc-300">{item.text}</p>
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
