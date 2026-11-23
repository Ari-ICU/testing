"use client";

import * as React from "react";
import {
  Sparkles,
  StopCircle,
  Pin,
  Eye,
  Layers,
  SlidersHorizontal,
  Volume2,
  X,
  Upload,
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
import { LiveWaveform } from "./ui/live-waveform";
import { MicRecorder } from "./ui/mic-recorder";

const EMOTION_OPTIONS: DropdownOption[] = [
  { value: "neutral", label: "✨ ធម្មតា — Neutral", sublabel: "Natural, clear, steady articulate delivery" },
  { value: "happy", label: "😊 រីករាយ — Joyful", sublabel: "Laughing tone, joyful smile, bright delight" },
  { value: "sad", label: "😢 សោកសៅ — Sorrow", sublabel: "Emotional drama, soft trembling sigh" },
  { value: "angry", label: "😠 ខឹង — Furious", sublabel: "Aggressive sharp tone, loud attack" },
  { value: "comedy", label: "😂 កំប្លែង — Comedy", sublabel: "Hilarious chuckle, playful comic banter" },
  { value: "stern", label: "⚖️ ម៉ឺងម៉ាត់ — Stern", sublabel: "Strict commanding authority, courtroom tone" },
  { value: "whisper", label: "🤫 ខ្សឹប — Whisper", sublabel: "Secret intimate whisper, close to ear" },
  { value: "news", label: "🎙️ ព័ត៌មាន — News", sublabel: "Authoritative anchor, clear broadcast cadence" },
  { value: "storytelling", label: "📖 និទាន — Storyteller", sublabel: "Dramatic narrator, theatrical pauses" },
  { value: "excited", label: "🤩 រំភើប — Excited", sublabel: "Ecstatic breathless energy, high pitch" },
];

const CUSTOM_CLONE_OPTIONS: DropdownOption[] = [
  {
    value: "upload",
    label: "📁 Upload Custom Audio",
    sublabel: "Upload any 3–10s clean .wav or .mp3 voice clip",
    badge: "Custom",
  },
  {
    value: "mic",
    label: "🎤 Record from Microphone",
    sublabel: "Record 4–8 seconds of your voice directly in browser",
    badge: "Custom",
  },
];

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
  const [text, setText] = React.useState("");
  const [modelOptions, setModelOptions] = React.useState<DropdownOption[]>([]);
  const [voiceOptions, setVoiceOptions] = React.useState<DropdownOption[]>(CUSTOM_CLONE_OPTIONS);
  const [isLoadingMeta, setIsLoadingMeta] = React.useState(true);

  const [modelId, setModelId] = React.useState("voxcpm2_khmer");
  const [voiceSource, setVoiceSource] = React.useState("female");
  const [cfgValue, setCfgValue] = React.useState(2.0);
  const [steps, setSteps] = React.useState(16);
  const [speed, setSpeed] = React.useState(1.0);
  const [useLora, setUseLora] = React.useState(false);
  const [emotion, setEmotion] = React.useState("neutral");
  const [customStylePrompt, setCustomStylePrompt] = React.useState("");
  const [customRefText, setCustomRefText] = React.useState("");
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  // Custom audio files
  const [uploadedFile, setUploadedFile] = React.useState<File | null>(null);
  const [recordedMicBlob, setRecordedMicBlob] = React.useState<Blob | null>(null);

  // Normalization preview
  const [normData, setNormData] = React.useState<{ normalized: string; chunks: string[] } | null>(null);
  const [isLoadingNorm, setIsLoadingNorm] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

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

  // Fetch real models & voices from backend
  React.useEffect(() => {
    let active = true;
    setIsLoadingMeta(true);

    Promise.all([
      fetch(getApiUrl("/api/models")).then((r) => (r.ok ? r.json() : null)),
      fetch(getApiUrl("/api/voices")).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([modelsRes, voicesRes]) => {
        if (!active) return;

        if (modelsRes?.models) {
          const loadedModels: DropdownOption[] = Object.values(modelsRes.models).map((m: any) => ({
            value: m.id,
            label: m.name || m.id,
            sublabel: m.execution || m.description,
            badge: m.id === "voxcpm2_khmer" ? "Recommended" : undefined,
          }));
          setModelOptions(loadedModels);
        }

        if (voicesRes?.voices) {
          const loadedVoices: DropdownOption[] = Object.values(voicesRes.voices).map((v: any) => {
            const { label, sublabel } = splitVoiceLabel(v.label || "", v.id, v.description);
            return {
              value: v.id,
              label,
              sublabel,
              badge: v.speaker_id ? v.speaker_id : undefined,
            };
          });
          setVoiceOptions([...loadedVoices, ...CUSTOM_CLONE_OPTIONS]);
          if (loadedVoices.length > 0 && !loadedVoices.some((v) => v.value === voiceSource)) {
            setVoiceSource(loadedVoices[0].value);
          }
        }
      })
      .catch((err) => console.error("Failed loading metadata:", err))
      .finally(() => {
        if (active) setIsLoadingMeta(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Auto-resize textarea cleanly
  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollH = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.max(120, Math.min(340, scrollH + 4))}px`;
    }
  }, [text]);

  const previewAudioUrl = React.useMemo(() => {
    if (voiceSource === "upload" || voiceSource === "mic") return null;
    return getApiUrl(`/voices/ref_${voiceSource}.wav`);
  }, [voiceSource]);

  const handlePreviewNorm = async () => {
    if (!text.trim()) return;
    setIsLoadingNorm(true);
    setErrorMessage(null);
    try {
      const res = await fetch(getApiUrl("/api/normalize"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("Normalization preview failed.");
      const data = await res.json();
      setNormData({
        normalized: data.normalized_text,
        chunks: data.chunks || [],
      });
    } catch (err: any) {
      setErrorMessage(err.message || "Normalization preview error.");
    } finally {
      setIsLoadingNorm(false);
    }
  };

  const handleGenerate = async () => {
    setErrorMessage(null);
    if (!text.trim()) {
      setErrorMessage("សូមវាយបញ្ចូលអត្ថបទភាសាខ្មែរជាមុនសិន (Please enter Khmer text to synthesize).");
      return;
    }

    if (voiceSource === "upload" && !uploadedFile) {
      setErrorMessage("Please upload a reference audio file (.wav or .mp3).");
      return;
    }
    if (voiceSource === "mic" && !recordedMicBlob) {
      setErrorMessage("Please record your voice from the microphone first.");
      return;
    }

    setIsGenerating(true);
    setLatestResult(null);

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

    if (voiceSource === "upload" && uploadedFile) {
      form.append("preset_voice", "custom");
      form.append("ref_audio", uploadedFile);
      if (customRefText.trim()) {
        form.append("ref_text", customRefText.trim());
        form.append("ultimate_clone", "true");
      }
    } else if (voiceSource === "mic" && recordedMicBlob) {
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
      percent: 4,
      stage: "Connecting to VoxCPM 2 Engine...",
      elapsedSec: 0,
      livePeaks: [],
    });

    const timerInterval = setInterval(() => {
      const elapsed = (performance.now() - t0) / 1000;
      setProgressData((prev) => ({ ...prev, elapsedSec: elapsed }));
    }, 100);

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
        setErrorMessage((err as Error)?.message || "Generation failed.");
      }
    } finally {
      clearInterval(timerInterval);
      clearInterval(pollTimer);
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = async () => {
    abortControllerRef.current?.abort();
    try {
      await fetch(getApiUrl("/api/cancel"), { method: "POST" });
    } catch (_) {}
    setIsGenerating(false);
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start pb-10">
      {/* LEFT COLUMN (7 cols): Khmer Text + Voice & Style Controls */}
      <div className="space-y-4 lg:col-span-7">
        {/* 1. Khmer Script Text Card */}
        <Card className="p-5 border-slate-800 bg-[#0b1120]/90">
          <CardHeader className="p-0 pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">
                ១. អត្ថបទភាសាខ្មែរ (Khmer Script)
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-mono text-[11px]">
                  {text.trim().length} chars
                </Badge>
                {text && (
                  <button
                    type="button"
                    onClick={() => {
                      setText("");
                      setNormData(null);
                    }}
                    className="text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <CardDescription className="text-xs">
              លេខ កាលបរិច្ឆេទ ម៉ោង និងពាក្យបច្ចេកទេសត្រូវបានបំប្លែងជាសំឡេងខ្មែរដោយស្វ័យប្រវត្តិ។
            </CardDescription>
          </CardHeader>

          <CardContent className="p-0 space-y-3">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="វាយបញ្ចូលអត្ថបទភាសាខ្មែរដែលបងចង់បង្កើតសំឡេងនៅទីនេះ..."
              className="w-full min-h-[120px] max-h-[340px] rounded-xl border border-slate-800 bg-[#070b14] px-4 py-3 text-base text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 font-sans leading-[1.8] resize-y"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePreviewNorm}
                isLoading={isLoadingNorm}
                disabled={!text.trim()}
                className="h-8 text-xs gap-1.5 text-slate-300"
              >
                <Eye className="w-3.5 h-3.5" />
                Preview Pronunciation &amp; Chunks
              </Button>
            </div>

            {normData && (
              <div className="rounded-xl border border-slate-800 bg-[#070b14] p-3 text-xs space-y-2 relative">
                <button
                  type="button"
                  onClick={() => setNormData(null)}
                  className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <div>
                  <span className="font-semibold text-emerald-400">Normalized Text:</span>
                  <p className="text-slate-300 mt-0.5 leading-relaxed">{normData.normalized}</p>
                </div>
                <div>
                  <span className="font-semibold text-cyan-400">Chunks ({normData.chunks.length}):</span>
                  <div className="space-y-1 mt-1">
                    {normData.chunks.map((c, i) => (
                      <div key={i} className="flex items-start gap-2 text-slate-400">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                          #{i + 1}
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

        {/* 2. Engine, Voice & Tone Settings */}
        <Card className="p-5 border-slate-800 bg-[#0b1120]/90">
          <CardHeader className="p-0 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                ២. ជ្រើសរើសសំឡេង និងអារម្មណ៍ (Voice &amp; Expression)
              </CardTitle>
              <Badge variant="emerald" className="text-[11px] gap-1">
                <Sparkles className="w-3 h-3" /> 48kHz
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-0 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <CustomDropdown
                label="TTS Model Engine"
                value={modelId}
                onChange={setModelId}
                options={modelOptions}
                placeholder={isLoadingMeta ? "Loading models..." : "Select engine..."}
              />

              <CustomDropdown
                label="Speaker Voice (ឬ Clone ថ្មី)"
                value={voiceSource}
                onChange={setVoiceSource}
                options={voiceOptions}
                placeholder={isLoadingMeta ? "Loading voices..." : "Select voice..."}
                searchable
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <CustomDropdown
                label="Emotional Tone (អារម្មណ៍សំឡេង)"
                value={emotion}
                onChange={setEmotion}
                options={EMOTION_OPTIONS}
              />

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                  <span>Custom Style Prompt (Optional)</span>
                </label>
                <input
                  type="text"
                  value={customStylePrompt}
                  onChange={(e) => setCustomStylePrompt(e.target.value)}
                  placeholder="e.g. calm elderly storyteller, soft whisper"
                  className="w-full rounded-lg border border-slate-800 bg-[#0b1120] px-3 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>
            </div>

            {/* Built-in Reference Audio Preview */}
            {previewAudioUrl && (
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-slate-800 bg-[#070b14] text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <Volume2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-medium text-slate-200 truncate">
                    {voiceOptions.find((v) => v.value === voiceSource)?.label || voiceSource}
                  </span>
                </div>
                <audio controls src={previewAudioUrl} className="h-8 w-full sm:w-64" />
              </div>
            )}

            {/* Upload Custom Reference Audio */}
            {voiceSource === "upload" && (
              <div className="rounded-xl border border-dashed border-slate-700 bg-[#070b14] p-4 text-center space-y-2">
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
                  <Upload className="w-3.5 h-3.5 text-emerald-400" />
                  Choose Clean Voice Clip (.wav / .mp3)
                </label>
                <p className="text-[11px] text-slate-400">
                  ណែនាំ៖ សំឡេងច្បាស់ ៤–១០ វិនាទី គ្មានភ្លេង ឬសំឡេងរំខាន។
                </p>
                {uploadedFile && (
                  <div className="text-xs text-emerald-400 font-mono">
                    {uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(1)} KB)
                  </div>
                )}
              </div>
            )}

            {/* Microphone Recording */}
            {voiceSource === "mic" && (
              <MicRecorder
                onRecordingComplete={(blob) => setRecordedMicBlob(blob)}
                label="Microphone Voice Recorder"
                helperText="Record 4–8 seconds of clear speech to clone your voice."
              />
            )}

            {/* Custom Reference Transcript */}
            {(voiceSource === "upload" || voiceSource === "mic") && (
              <div className="space-y-1.5 p-3 rounded-xl bg-[#070b14] border border-slate-800">
                <label className="text-xs font-medium text-slate-200 block">
                  Spoken Words in Reference Clip (Optional)
                </label>
                <input
                  type="text"
                  value={customRefText}
                  onChange={(e) => setCustomRefText(e.target.value)}
                  placeholder="Leave blank for direct cloning, or type spoken words..."
                  className="w-full rounded-lg border border-slate-800 bg-[#0b1120] px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>
            )}

            {/* Clean LoRA + Advanced Tuning Toggle Row */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
              <div className="flex items-center gap-2.5">
                <Switch
                  checked={useLora}
                  onCheckedChange={setUseLora}
                  disabled={modelId !== "voxcpm2_khmer"}
                  id="studio-lora-toggle"
                />
                <label
                  htmlFor="studio-lora-toggle"
                  className="text-xs font-medium text-slate-200 cursor-pointer flex items-center gap-1.5 select-none"
                >
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  Use Khmer LoRA Adapter
                </label>
              </div>

              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {showAdvanced ? "Hide Fine Controls" : `Speed ${speed.toFixed(2)}x · Steps ${steps}`}
              </button>
            </div>

            {showAdvanced && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-800/60">
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
                  label="Diffusion Steps"
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
            )}
          </CardContent>
        </Card>
      </div>

      {/* RIGHT COLUMN (5 cols, Sticky): Action CTA + Live Waveform + Result & A/B Compare */}
      <div className="space-y-4 lg:col-span-5 lg:sticky lg:top-20">
        <Card className="p-5 border-slate-800 bg-[#0b1120]/95 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">៣. បង្កើត &amp; ស្ដាប់សំឡេង (Generate)</h3>
            <span className="text-[11px] font-mono text-slate-400">
              {voiceOptions.find((v) => v.value === voiceSource)?.label || voiceSource}
            </span>
          </div>

          {errorMessage && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-300 flex items-start justify-between gap-2">
              <span>{errorMessage}</span>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-rose-400 hover:text-rose-200 cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="default"
              size="lg"
              onClick={handleGenerate}
              isLoading={isGenerating}
              disabled={isGenerating || !text.trim()}
              className="flex-1 text-sm font-semibold py-5"
            >
              <Sparkles className="w-4 h-4 mr-1" />
              {isGenerating
                ? `Synthesizing (${formatHumanDuration(progressData.elapsedSec)})...`
                : "បង្កើតសំឡេងខ្មែរ (Synthesize)"}
            </Button>

            {isGenerating && (
              <Button
                type="button"
                variant="destructive"
                size="lg"
                onClick={handleCancel}
                className="gap-1.5 text-xs py-5"
              >
                <StopCircle className="w-4 h-4" />
                Stop
              </Button>
            )}
          </div>

          {/* Live Progress & Waveform */}
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

          {/* Output Audio Player */}
          {latestResult && !isGenerating && (
            <WaveformPlayer
              audioUrl={latestResult.audio_url}
              duration={latestResult.duration_sec}
              title={`${latestResult.model_name} · ${latestResult.voice_id}`}
              subtitle={`${latestResult.duration_sec}s · Latency ${latestResult.latency_sec}s (RTF ${latestResult.rtf}x)`}
              onPinForCompare={() => setPinnedResult(latestResult)}
            />
          )}

          {!latestResult && !isGenerating && (
            <div className="rounded-xl border border-dashed border-slate-800 bg-[#070b14]/60 p-7 text-center space-y-1.5">
              <Volume2 className="w-8 h-8 text-slate-700 mx-auto" />
              <p className="text-xs font-medium text-slate-300">មិនទាន់មានសំឡេងនៅឡើយទេ</p>
              <p className="text-[11px] text-slate-500">
                វាយអត្ថបទនៅខាងឆ្វេង រួចចុចប៊ូតុង "បង្កើតសំឡេងខ្មែរ" ដើម្បីស្ដាប់លទ្ធផល 48kHz។
              </p>
            </div>
          )}

          {/* Pinned A/B Compare Box */}
          {pinnedResult && (
            <div className="space-y-2 p-3 rounded-xl border border-emerald-800/70 bg-emerald-950/20">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <Pin className="w-3.5 h-3.5" />
                  Pinned A/B Reference
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
        </Card>
      </div>
    </div>
  );
}
