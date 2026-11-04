"use client";

import * as React from "react";
import { Sparkles, StopCircle, RefreshCw, Pin, Eye, Layers } from "lucide-react";
import { getApiUrl } from "@/lib/api";
import { formatHumanDuration } from "@/lib/utils";
import { Button } from "./ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
import { CustomDropdown, DropdownOption } from "./ui/custom-dropdown";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";
import { Badge } from "./ui/badge";
import { WaveformPlayer } from "./ui/waveform-player";
import { LiveWaveform } from "./ui/live-waveform";
import { MicRecorder } from "./ui/mic-recorder";

const KHMER_PRESETS = {
  tinfy: {
    label: "🎭 ទិនហ្វី (Tinfy Comedy Dub)",
    text: "អេ កុំៗៗ អា៎ចង្រៃយក! ឡាន ម៉ូតូ យន្តហោះមិនព្រមជិះ តែមកធ្វើដំណើរតាមផ្លូវទឹកវិញលោកបងអើយ ទឹកឥឡូវទឹកឡើងខ្លាំងណាស់!",
    voice: "tinfy",
  },
  pao_chin: {
    label: "⚖️ ប៉ាវចិន (Judge Pao Chin Dub)",
    text: "ល្អ! យើងសួរឯងមួយ អង្គុយខ្ពស់ជាងឈរ អាណាមិនរកឆ្កែ ៩៩% ឆ្លើយខុសទាំងអស់! រកក៏ឆ្កែ មិនរកក៏ឆ្កែ ឆ្កែដូចតែគ្នាទេ!",
    voice: "pao_chin",
  },
  question: {
    label: "💬 Emotional Question",
    text: "ហេតុអ្វីបានជាមនុស្សពីរនាក់ដែលធ្លាប់ស្រឡាញ់គ្នាខ្លាំងណាស់ បែរជាអាចក្លាយជាមនុស្សដែលមិនស្គាល់គ្នាទៅវិញ?",
    voice: "female",
  },
  greeting: {
    label: "👋 Greeting & Currency",
    text: "ជម្រាបសួរ! ថ្ងៃទី ២/១១/២០២៦ កាហ្វេមួយកែវតម្លៃ ៥០០០៛ និងបច្ចេកវិទ្យា AI ជួយសម្រួលការងារល្អៗ។",
    voice: "male",
  },
  phone_time: {
    label: "📞 Time, Phone & Units",
    text: "នៅម៉ោង ០៨:៣០ ព្រឹក សីតុណ្ហភាព 32°C សូមទាក់ទងមកលេខ 012 345 678 តាម Telegram ឬ Facebook។",
    voice: "female_news",
  },
  news: {
    label: "📰 Khmer Tech News",
    text: "ប្រព័ន្ធបញ្ញាសិប្បនិម្មិតជំនាន់ថ្មី អាចបំប្លែងអត្ថបទភាសាខ្មែរទៅជាសំឡេងមនុស្សធម្មជាតិបានយ៉ាងច្បាស់ និងរលូន។",
    voice: "male_reporter",
  },
  story: {
    label: "📖 Proverb",
    text: "ចំណេះវិជ្ជាគឺជាទ្រព្យសម្បត្តិដ៏មានតម្លៃបំផុត ដែលគ្មាននរណាម្នាក់អាចលួចយកទៅបានឡើយ។",
    voice: "male_narrator",
  },
};

const MODEL_OPTIONS: DropdownOption[] = [
  {
    value: "voxcpm2_khmer",
    label: "VoxCPM 2 Khmer",
    sublabel: "Fine-tuned 48kHz Studio Quality + Zero-Shot Voice Cloning",
    badge: "Recommended",
    icon: "🇰🇭",
  },
  {
    value: "voxcpm2_base",
    label: "VoxCPM 2 Base Official",
    sublabel: "OpenBMB 30 Languages including Khmer (48kHz)",
    badge: "Official",
    icon: "🌐",
  },
  {
    value: "mms",
    label: "Meta MMS Khmer",
    sublabel: "Fast Local VITS (~0.04x RTF, Single Speaker)",
    badge: "Ultra Fast",
    icon: "⚡",
  },
  {
    value: "f5_khmer",
    label: "Khmer F5-TTS",
    sublabel: "1,000h Khmer DiT Checkpoint / Space API",
    badge: "DiT Model",
    icon: "🎙️",
  },
];


const VOICE_OPTIONS: DropdownOption[] = [
  {
    value: "tinfy",
    label: "១. ទិនហ្វី — Tinfy",
    sublabel: "Classic Stephen Chow Cambodian Comedy Movie Dubbing Voice",
    badge: "Iconic Dub",
    icon: "🎭",
  },
  {
    value: "pao_chin",
    label: "២. ប៉ាវចិន — Pao Chin",
    sublabel: "Judge Bao (តុលាការមុខដែក) Deep Booming Cambodian Movie Dub",
    badge: "Iconic Dub",
    icon: "⚖️",
  },
  {
    value: "female",
    label: "៣. សុភា — Sophea",
    sublabel: "Real Human Female Speaker #1 (f-adt1-0002)",
    badge: "Real Human",
    icon: "👩",
  },
  {
    value: "male",
    label: "៤. តារា — Dara",
    sublabel: "Real Human Male Speaker #1 (m-adt1-0002)",
    badge: "Real Human",
    icon: "👨",
  },
  {
    value: "female_news",
    label: "៥. បុប្ផា — Bopha",
    sublabel: "Real Human Female Speaker #2 (f-adt2-0002)",
    badge: "Real Human",
    icon: "👩‍💼",
  },
  {
    value: "male_narrator",
    label: "៦. វណ្ណៈ — Vannak",
    sublabel: "Real Human Male Speaker #2 (m-adt1-0001)",
    badge: "Real Human",
    icon: "👨‍🏫",
  },
  {
    value: "female_youth",
    label: "៧. ចន្ធូ — Chanthou",
    sublabel: "Real Human Female Speaker #3 (f-adt1-0001)",
    badge: "Real Human",
    icon: "👧",
  },
  {
    value: "male_podcast",
    label: "៨. រិទ្ធី — Rithy",
    sublabel: "Real Human Male Speaker #3 (m-adt2-0002)",
    badge: "Real Human",
    icon: "🎙️",
  },
  {
    value: "male_heritage",
    label: "៩. សុខា — Sokha",
    sublabel: "Real Human Male Speaker #4 (m-adt2-0001)",
    badge: "Real Human",
    icon: "🏛️",
  },
  {
    value: "male_reporter",
    label: "១០. ចាន់ — Chan",
    sublabel: "Phnom Penh News Broadcaster (grkpp_news)",
    badge: "Broadcaster",
    icon: "📰",
  },
  {
    value: "upload",
    label: "Upload Custom Audio",
    sublabel: "Upload any 3–10s clean .wav or .mp3 voice clip",
    badge: "Custom",
    icon: "📁",
  },
  {
    value: "mic",
    label: "Record from Microphone",
    sublabel: "Record 4–8 seconds of your voice directly in browser",
    badge: "Custom",
    icon: "🎤",
  },
];

const EMOTION_OPTIONS = [
  {
    value: "neutral",
    label: "ធម្មតា — Neutral & Steady",
    sublabel: "Natural, clear, steady articulate delivery",
    icon: "✨",
  },
  {
    value: "happy",
    label: "រីករាយ — Cheerful & Bright",
    sublabel: "Cheerful, bright energetic tone, warm smile in voice",
    icon: "😊",
  },
  {
    value: "sad",
    label: "សោកសៅ — Melancholic & Sad",
    sublabel: "Soft low voice, slower pace, emotional sigh",
    icon: "😢",
  },
  {
    value: "angry",
    label: "ខឹង — Angry & Command",
    sublabel: "Firm, intense, sharp attack, faster tempo",
    icon: "😠",
  },
  {
    value: "comedy",
    label: "កំប្លែង — Comedy & Playful",
    sublabel: "Humorous, playful smiling delivery, chuckle tone",
    icon: "😂",
  },
  {
    value: "stern",
    label: "ម៉ឺងម៉ាត់ — Stern & Authoritative",
    sublabel: "Authoritative, dignified, firm commanding tone",
    icon: "⚖️",
  },
  {
    value: "whisper",
    label: "ខ្សឹប — Whisper & Gentle",
    sublabel: "Soft whisper, quiet, intimate breathy delivery",
    icon: "🤫",
  },
  {
    value: "news",
    label: "ព័ត៌មាន — News Broadcast",
    sublabel: "Professional news anchor, articulate broadcast cadence",
    icon: "🎙️",
  },
  {
    value: "storytelling",
    label: "និទាន — Expressive Storyteller",
    sublabel: "Dramatic pauses, engaging warm audiobook cadence",
    icon: "📖",
  },
  {
    value: "excited",
    label: "រំភើប — Enthusiastic & Excited",
    sublabel: "High energy, dynamic pitch, enthusiastic cadence",
    icon: "🤩",
  },
];

interface SynthesisResultData {
  audio_url: string;
  model_name: string;
  voice_id: string;
  duration_sec: number;
  latency_sec: number;
  rtf: number;
  sample_rate: number;
  normalized_text?: string;
}

export function StudioTab() {
  const [text, setText] = React.useState(
    "ហេតុអ្វីបានជាមនុស្សពីរនាក់ដែលធ្លាប់ស្រឡាញ់គ្នាខ្លាំងណាស់ បែរជាអាចក្លាយជាមនុស្សដែលមិនស្គាល់គ្នាទៅវិញ?"
  );
  const [modelId, setModelId] = React.useState("voxcpm2_khmer");
  const [voiceSource, setVoiceSource] = React.useState("tinfy");
  const [cfgValue, setCfgValue] = React.useState(2.0);
  const [steps, setSteps] = React.useState(16);
  const [speed, setSpeed] = React.useState(1.0);
  const [useLora, setUseLora] = React.useState(true);
  const [emotion, setEmotion] = React.useState("neutral");
  const [customStylePrompt, setCustomStylePrompt] = React.useState("");
  const [customRefText, setCustomRefText] = React.useState("");

  // Custom audio files
  const [uploadedFile, setUploadedFile] = React.useState<File | null>(null);
  const [recordedMicBlob, setRecordedMicBlob] = React.useState<Blob | null>(null);

  // Normalization preview
  const [normData, setNormData] = React.useState<{ normalized: string; chunks: string[] } | null>(null);
  const [isLoadingNorm, setIsLoadingNorm] = React.useState(false);

  // Generation state
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [progressData, setProgressData] = React.useState<{
    percent: number;
    stage: string;
    elapsedSec: number;
    livePeaks: number[];
    partialAudioUrl?: string;
    currentChunk?: number;
    totalChunks?: number;
    completedChunks?: number;
    etaSec?: number | null;
    secPerChunk?: number | null;
    rtf?: number | null;
    partialDurationSec?: number;
  }>({
    percent: 0,
    stage: "",
    elapsedSec: 0,
    livePeaks: [],
  });
  const [latestResult, setLatestResult] = React.useState<SynthesisResultData | null>(null);
  const [pinnedResult, setPinnedResult] = React.useState<SynthesisResultData | null>(null);

  const abortControllerRef = React.useRef<AbortController | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea height to snugly fit Khmer text without awkward blank space
  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollH = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.max(90, Math.min(340, scrollH + 4))}px`;
    }
  }, [text]);

  // Reference Audio URL for built-in preview
  const previewAudioUrl = React.useMemo(() => {
    if (voiceSource === "upload" || voiceSource === "mic") return null;
    return getApiUrl(`/voices/ref_${voiceSource}.wav?v=2.9`);
  }, [voiceSource]);

  // Apply preset
  const handleApplyPreset = (key: keyof typeof KHMER_PRESETS) => {
    const p = KHMER_PRESETS[key];
    setText(p.text);
    setVoiceSource(p.voice);
  };

  // Preview Normalization
  const handlePreviewNorm = async () => {
    if (!text.trim()) return;
    setIsLoadingNorm(true);
    try {
      const res = await fetch(getApiUrl("/api/normalize"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      setNormData({
        normalized: data.normalized_text,
        chunks: data.chunks || [],
      });
    } catch (err) {
      console.error("Norm preview error:", err);
    } finally {
      setIsLoadingNorm(false);
    }
  };

  // Start Generation
  const handleGenerate = async () => {
    if (!text.trim()) {
      alert("Please enter Khmer text to synthesize.");
      return;
    }

    setIsGenerating(true);
    setLatestResult(null);
    setProgressData({
      percent: 14,
      stage: "Initializing VoxCPM 2 Engine...",
      elapsedSec: 0,
      livePeaks: [],
    });

    const form = new FormData();
    form.append("text", text);
    form.append("model_id", modelId);
    form.append("cfg_value", String(cfgValue));
    form.append("inference_timesteps", String(steps));
    form.append("speed", String(speed));
    form.append("use_lora", useLora ? "true" : "false");
    form.append("emotion", emotion);
    if (customStylePrompt.trim()) {
      form.append("custom_style_prompt", customStylePrompt.trim());
    }

    if (voiceSource === "upload") {
      if (!uploadedFile) {
        alert("Please upload a reference audio file (.wav or .mp3)");
        setIsGenerating(false);
        return;
      }
      form.append("preset_voice", "custom");
      form.append("ref_audio", uploadedFile);
      if (customRefText.trim()) {
        form.append("ref_text", customRefText.trim());
        form.append("ultimate_clone", "true");
      }
    } else if (voiceSource === "mic") {
      if (!recordedMicBlob) {
        alert("Please record your voice from the microphone first.");
        setIsGenerating(false);
        return;
      }
      form.append("preset_voice", "custom");
      form.append("ref_audio", recordedMicBlob, "mic_ref.wav");
      if (customRefText.trim()) {
        form.append("ref_text", customRefText.trim());
        form.append("ultimate_clone", "true");
      }
    } else {
      form.append("preset_voice", voiceSource);
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const t0 = performance.now();
    setProgressData({
      percent: 2,
      stage: "Connecting to VoxCPM 2 Engine...",
      elapsedSec: 0,
      livePeaks: [],
    });

    // Real-time smooth timer strictly for elapsed seconds
    const timerInterval = setInterval(() => {
      const elapsed = (performance.now() - t0) / 1000;
      setProgressData((prev) => ({
        ...prev,
        elapsedSec: elapsed,
      }));
    }, 100);

    // Polling backend progress with real chunk-by-chunk calculation & ETA
    const pollTimer = setInterval(async () => {
      try {
        const pRes = await fetch(getApiUrl(`/api/progress?t=${Date.now()}`), { cache: "no-store" });
        const pData = await pRes.json();
        if (pData && pData.active) {
          setProgressData((prev) => ({
            ...prev,
            percent: typeof pData.percent === "number" ? pData.percent : prev.percent,
            stage: pData.stage || prev.stage,
            currentChunk: pData.current_chunk ?? prev.currentChunk,
            totalChunks: pData.total_chunks ?? prev.totalChunks,
            completedChunks: pData.completed_chunks ?? prev.completedChunks,
            etaSec: pData.eta_sec ?? prev.etaSec,
            secPerChunk: pData.sec_per_chunk ?? prev.secPerChunk,
            rtf: pData.rtf ?? prev.rtf,
            partialDurationSec: pData.partial_duration_sec ?? prev.partialDurationSec,
            livePeaks: pData.live_peaks || prev.livePeaks,
            partialAudioUrl: pData.partial_audio_url ? getApiUrl(pData.partial_audio_url) : prev.partialAudioUrl,
          }));
        }
      } catch (_) {}
    }, 350);

    try {
      const res = await fetch(getApiUrl("/api/clone"), {
        method: "POST",
        body: form,
        signal: abortController.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Synthesis failed");

      setLatestResult({
        ...data,
        audio_url: getApiUrl(data.audio_url),
      });
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") {
        alert("Generation error: " + (err as Error)?.message);
      }
    } finally {
      clearInterval(timerInterval);
      clearInterval(pollTimer);
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    try {
      await fetch(getApiUrl("/api/cancel"), { method: "POST" });
    } catch (_) {}
    setIsGenerating(false);
  };

  return (
    <div className="space-y-6">
      {/* 1. Khmer Text Input Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>១. អត្ថបទភាសាខ្មែរដែលត្រូវនិយាយ (Khmer Text)</CardTitle>
            <Badge variant="secondary" className="font-mono text-xs">
              {text.trim().length} chars
            </Badge>
          </div>
          <CardDescription>
            Select a classic Cambodian voice preset or compose your own Khmer text. Numbers, dates, times (HH:MM), units, and English loanwords are normalized automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Preset Pills */}
          <div className="flex flex-wrap gap-1.5 pb-1">
            {Object.entries(KHMER_PRESETS).map(([k, p]) => (
              <button
                key={k}
                type="button"
                onClick={() => handleApplyPreset(k as keyof typeof KHMER_PRESETS)}
                className="px-2.5 py-1 text-xs rounded-md bg-[#0a101d] border border-slate-800 hover:border-slate-700 hover:bg-slate-800/60 text-slate-300 hover:text-white transition-colors cursor-pointer select-none"
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setText("")}
              className="px-2.5 py-1 text-xs rounded-md bg-transparent border border-slate-800 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
            >
              Clear
            </button>
          </div>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="វាយបញ្ចូលអត្ថបទភាសាខ្មែរដែលអ្នកចង់បង្កើតសំឡេង..."
            className="w-full min-h-[500px] max-h-[340px] rounded-xl border border-slate-800 bg-[#090e1b] px-4 py-3 text-base md:text-[16px] text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-[border-color,box-shadow] font-sans leading-[1.8] resize-y overflow-y-auto"
          />

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePreviewNorm}
              isLoading={isLoadingNorm}
              className="h-8 text-xs gap-1.5 text-slate-300"
            >
              <Eye className="w-3.5 h-3.5" />
              Preview Khmer Normalization &amp; Chunks
            </Button>
          </div>

          {normData && (
            <div className="rounded-xl border border-slate-800 bg-[#080d1a] p-3 text-xs space-y-2">
              <div>
                <span className="font-semibold text-emerald-400">Normalized Text:</span>
                <p className="text-slate-300 mt-0.5">{normData.normalized}</p>
              </div>
              <div>
                <span className="font-semibold text-cyan-400">Prosody Chunks ({normData.chunks.length}):</span>
                <div className="space-y-1 mt-1">
                  {normData.chunks.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 text-slate-400">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                        Chunk {i + 1}
                      </Badge>
                      <span className="text-slate-300">{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Model & Reference Voice Settings Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>២. ជ្រើសរើសម៉ូដែល និងសំឡេងគំរូ (Engine &amp; Voice)</CardTitle>
            <Badge variant="emerald" className="gap-1">
              <Sparkles className="w-3 h-3" />
              48kHz Studio Quality
            </Badge>
          </div>
          <CardDescription>
            Choose from 10 distinct Cambodian voices (including Tinfy &amp; Pao Chin), upload your custom reference WAV, or record directly from your microphone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Main Dropdowns Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CustomDropdown
              label="Synthesis / Cloning Engine"
              value={modelId}
              onChange={setModelId}
              options={MODEL_OPTIONS}
            />

            <CustomDropdown
              label="Reference Voice Source (សំឡេងខ្មែរ ១០ រូបបែបផ្សេងគ្នា)"
              value={voiceSource}
              onChange={setVoiceSource}
              options={VOICE_OPTIONS}
              searchable
            />
          </div>

          {/* Emotion & Expressive Prosody Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CustomDropdown
              label="Emotional Prosody & Tone (ទឹកដមសំឡេងខ្មែរ)"
              value={emotion}
              onChange={setEmotion}
              options={EMOTION_OPTIONS}
            />

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-200 flex items-center justify-between">
                <span>Custom Style Prompt Override (Optional)</span>
                <span className="text-[10px] text-slate-400">e.g. gentle elderly man</span>
              </label>
              <input
                type="text"
                value={customStylePrompt}
                onChange={(e) => setCustomStylePrompt(e.target.value)}
                placeholder="Custom English/Chinese style tag: e.g. cheerful, energetic tone"
                className="w-full rounded-xl border border-slate-800 bg-[#090e1b] px-3.5 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
          </div>

          {/* Reference Audio Player Preview */}
          {previewAudioUrl && (
            <div className="flex items-center justify-between p-3 rounded-xl border border-slate-800/90 bg-[#080d19] text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">🔊 Reference Preview:</span>
                <span className="font-medium text-slate-200">
                  {VOICE_OPTIONS.find((v) => v.value === voiceSource)?.label}
                </span>
              </div>
              <audio controls src={previewAudioUrl} className="h-7 w-56 md:w-72" />
            </div>
          )}

          {/* Custom Upload Box */}
          {voiceSource === "upload" && (
            <div className="rounded-xl border border-dashed border-slate-700 bg-[#080d19] p-4 text-center space-y-2">
              <input
                type="file"
                id="fileUploadInput"
                accept="audio/*"
                onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <label
                htmlFor="fileUploadInput"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer transition-colors"
              >
                Choose Reference Audio (.wav / .mp3)
              </label>
              <p className="text-[11px] text-slate-400">
                Recommended: 4–10 seconds of clear speaking voice with <b>no background music, echo, or noise</b>.
              </p>
              {uploadedFile && (
                <div className="text-xs text-emerald-400 font-mono">
                  Selected: {uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(1)} KB)
                </div>
              )}
            </div>
          )}

          {/* Microphone Recording Box */}
          {voiceSource === "mic" && (
            <MicRecorder
              onRecordingComplete={(blob) => setRecordedMicBlob(blob)}
              label="Microphone Voice Recorder"
              helperText="Record 4–8 seconds of your voice to clone your exact timbre."
            />
          )}

          {/* Reference Transcript for High-Fidelity Voice Cloning */}
          {(voiceSource === "upload" || voiceSource === "mic") && (
            <div className="space-y-1.5 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <span>✍️ Reference Spoken Transcript (Optional)</span>
                  <span className="text-[10px] text-sky-400 bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-800/50">
                    Direct Mode Active
                  </span>
                </label>
              </div>
              <input
                type="text"
                value={customRefText}
                onChange={(e) => setCustomRefText(e.target.value)}
                placeholder="Leave blank to clone directly, or type spoken words for maximum likeness..."
                className="w-full rounded-lg border border-slate-800 bg-[#090e1b] px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              {!customRefText.trim() ? (
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  ⚡ <b>Direct Cloning Ready:</b> You can clone directly from the audio alone without typing! (Guidance is automatically calibrated to capture their voice timbre).
                </p>
              ) : (
                <p className="text-[11px] text-emerald-400/90 flex items-center gap-1">
                  ✓ High-fidelity continuation mode enabled (aligns vocal timbre with speech phonetic tokens).
                </p>
              )}
            </div>
          )}

          {/* Sliders Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2 border-t border-slate-800/80">
            <Slider
              label="Guidance (CFG)"
              valueDisplay={cfgValue.toFixed(1)}
              min={1.2}
              max={3.0}
              step={0.1}
              value={[cfgValue]}
              onValueChange={([v]) => setCfgValue(v)}
            />

            <Slider
              label="Diffusion Steps (Smoothness)"
              valueDisplay={steps}
              min={6}
              max={24}
              step={1}
              value={[steps]}
              onValueChange={([v]) => setSteps(v)}
            />

            <Slider
              label="Speech Speed"
              valueDisplay={`${speed.toFixed(2)}x`}
              min={0.8}
              max={1.25}
              step={0.05}
              value={[speed]}
              onValueChange={([v]) => setSpeed(v)}
            />
          </div>

          {/* Custom LoRA Toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-slate-800/80 bg-[#080d19]">
            <div className="flex items-center gap-3">
              <Layers className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="text-xs font-medium text-slate-200">
                  Custom Fine-Tuned LoRA Adapter
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  models/voxcpm2_khmer_lora/lora_weights.safetensors
                </div>
              </div>
            </div>
            <Switch
              checked={useLora}
              onCheckedChange={setUseLora}
              disabled={modelId !== "voxcpm2_khmer"}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              type="button"
              variant="default"
              size="lg"
              onClick={handleGenerate}
              isLoading={isGenerating}
              disabled={isGenerating}
              className="flex-1 text-sm font-semibold"
            >
              <Sparkles className="w-4 h-4 mr-1" />
              {isGenerating
                ? `Generating Khmer Audio (${formatHumanDuration(progressData.elapsedSec)}${progressData.etaSec ? ` · ETA ~${formatHumanDuration(progressData.etaSec)}` : ""})...`
                : "Clone Voice & Synthesize Khmer"}
            </Button>

            {isGenerating && (
              <Button
                type="button"
                variant="destructive"
                size="lg"
                onClick={handleCancel}
                className="gap-1.5 text-sm"
              >
                <StopCircle className="w-4 h-4" />
                Cancel
              </Button>
            )}
          </div>

          {/* Live Progress & Real-Time Waveform */}
          {isGenerating && (
            <LiveWaveform
              percent={progressData.percent}
              stage={progressData.stage}
              elapsedSec={progressData.elapsedSec}
              livePeaks={progressData.livePeaks}
              partialAudioUrl={progressData.partialAudioUrl}
              currentChunk={progressData.currentChunk}
              totalChunks={progressData.totalChunks}
              completedChunks={progressData.completedChunks}
              etaSec={progressData.etaSec}
              secPerChunk={progressData.secPerChunk}
              rtf={progressData.rtf}
              partialDurationSec={progressData.partialDurationSec}
            />
          )}

          {/* Completed Result Waveform Player */}
          {latestResult && !isGenerating && (
            <WaveformPlayer
              audioUrl={latestResult.audio_url}
              duration={latestResult.duration_sec}
              title={`${latestResult.model_name} · ${latestResult.voice_id}`}
              subtitle={`${latestResult.duration_sec}s · Latency: ${latestResult.latency_sec}s (RTF ${latestResult.rtf}x) · ${latestResult.sample_rate}Hz`}
              onPinForCompare={() => setPinnedResult(latestResult)}
            />
          )}

          {/* Pinned A/B Compare Box */}
          {pinnedResult && (
            <div className="space-y-2 p-3.5 rounded-xl border border-emerald-800/70 bg-emerald-950/20">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <Pin className="w-3.5 h-3.5" />
                  Pinned Reference A for A/B Compare:
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPinnedResult(null)}
                  className="h-6 text-[11px] text-slate-400 hover:text-white"
                >
                  Unpin
                </Button>
              </div>
              <WaveformPlayer
                audioUrl={pinnedResult.audio_url}
                duration={pinnedResult.duration_sec}
                title={pinnedResult.model_name}
                subtitle={`${pinnedResult.duration_sec}s · ${pinnedResult.voice_id}`}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

