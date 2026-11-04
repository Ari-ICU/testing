"use client";

import * as React from "react";
import { Play, Pause, Trash2, RefreshCw, Upload, Terminal, Rocket, StopCircle } from "lucide-react";
import { getApiUrl } from "@/lib/api";
import { Button } from "./ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
import { CustomDropdown, DropdownOption } from "./ui/custom-dropdown";
import { Badge } from "./ui/badge";
import { MicRecorder } from "./ui/mic-recorder";

const ANCHOR_VOICE_OPTIONS: DropdownOption[] = [
  { value: "tinfy", label: "🎭 ទិនហ្វី — Tinfy", sublabel: "Classic Khmer Comedy Movie Dub", icon: "🎭" },
  { value: "pao_chin", label: "⚖️ ប៉ាវចិន — Pao Chin", sublabel: "Judge Bao Deep Booming Dub", icon: "⚖️" },
  { value: "female", label: "👩 សុភា — Sophea", sublabel: "Real Female #1 (f-adt1-0002)", icon: "👩" },
  { value: "male", label: "👨 តារា — Dara", sublabel: "Real Male #1 (m-adt1-0002)", icon: "👨" },
  { value: "female_news", label: "👩‍💼 បុប្ផា — Bopha", sublabel: "Real Female #2 (f-adt2-0002)", icon: "👩‍💼" },
  { value: "male_narrator", label: "👨‍🏫 វណ្ណៈ — Vannak", sublabel: "Real Male #2 (m-adt1-0001)", icon: "👨‍🏫" },
  { value: "female_youth", label: "👧 ចន្ធូ — Chanthou", sublabel: "Real Female #3 (f-adt1-0001)", icon: "👧" },
  { value: "male_podcast", label: "🎙️ រិទ្ធី — Rithy", sublabel: "Real Male #3 (m-adt2-0002)", icon: "🎙️" },
  { value: "male_heritage", label: "🏛️ សុខា — Sokha", sublabel: "Real Male #4 (m-adt2-0001)", icon: "🏛️" },
  { value: "male_reporter", label: "📰 ចាន់ — Chan", sublabel: "Phnom Penh News Reporter", icon: "📰" },
];

const SPEAKER_FILTER_OPTIONS: DropdownOption[] = [
  { value: "all", label: "🇰🇭 All 10 Cambodian Speakers", sublabel: "32 Authentic Human Speech Clips", badge: "32 Clips" },
  { value: "tinfy", label: "🎭 Only ទិនហ្វី (Tinfy)", sublabel: "4 Classic Comedy Dub Utterances", badge: "4 Clips" },
  { value: "pao_chin", label: "⚖️ Only ប៉ាវចិន (Pao Chin)", sublabel: "4 Judge Bao Booming Dub Utterances", badge: "4 Clips" },
  { value: "female", label: "👩 Only សុភា (Sophea)", sublabel: "3 Clips · f-adt1-0002", badge: "3 Clips" },
  { value: "male", label: "👨 Only តារា (Dara)", sublabel: "3 Clips · m-adt1-0002", badge: "3 Clips" },
  { value: "female_news", label: "👩‍💼 Only បុប្ផា (Bopha)", sublabel: "3 Clips · f-adt2-0002", badge: "3 Clips" },
  { value: "male_narrator", label: "👨‍🏫 Only វណ្ណៈ (Vannak)", sublabel: "3 Clips · m-adt1-0001", badge: "3 Clips" },
  { value: "female_youth", label: "👧 Only ចន្ធូ (Chanthou)", sublabel: "3 Clips · f-adt1-0001", badge: "3 Clips" },
  { value: "male_podcast", label: "🎙️ Only រិទ្ធី (Rithy)", sublabel: "3 Clips · m-adt2-0002", badge: "3 Clips" },
  { value: "male_heritage", label: "🏛️ Only សុខា (Sokha)", sublabel: "3 Clips · m-adt2-0001", badge: "3 Clips" },
  { value: "male_reporter", label: "📰 Only ចាន់ (Chan)", sublabel: "3 Clips · GRKPP Broadcaster", badge: "3 Clips" },
];

const LORA_RANK_OPTIONS: DropdownOption[] = [
  { value: "8", label: "r = 8 (Fastest, Minimal Memory)", sublabel: "Lightweight adapter" },
  { value: "16", label: "r = 16 (Recommended Balanced)", sublabel: "Standard capacity for timbre & prosody", badge: "Recommended" },
  { value: "32", label: "r = 32 (High Capacity Speaker Fit)", sublabel: "Max expressive capacity" },
];

const EMOTION_OPTIONS: DropdownOption[] = [
  { value: "neutral", label: "💬 ធម្មតា — Natural", sublabel: "Balanced conversational delivery", icon: "💬" },
  { value: "comedy", label: "🎭 កំប្លែង — Comedy / High-Energy", sublabel: "Expressive humor & comedic dubbing", icon: "🎭" },
  { value: "stern", label: "⚖️ ម៉ឺងម៉ាត់ — Stern / Booming", sublabel: "Authoritative judicial courtroom gravitas", icon: "⚖️" },
  { value: "happy", label: "😃 រីករាយ — Cheerful / Excited", sublabel: "Bright vocal air and animated pitch", icon: "😃" },
  { value: "sad", label: "😢 សោកសៅ — Sad / Melancholic", sublabel: "Gentle emotional nuance and breathiness", icon: "😢" },
  { value: "angry", label: "😡 ខឹង — Angry / Fierce", sublabel: "Intense dramatic attack and conviction", icon: "😡" },
  { value: "story", label: "📖 និទាន — Storytelling / Narrative", sublabel: "Measured cadence and rich resonance", icon: "📖" },
  { value: "whisper", label: "🤫 ខ្សឹប — Whisper / Soft", sublabel: "Subtle intimacy and gentle tone", icon: "🤫" },
  { value: "news", label: "📰 ព័ត៌មាន — Formal News Broadcast", sublabel: "Crisp diction and broadcast clarity", icon: "📰" },
];

interface DatasetSample {
  index: number;
  id: string;
  speaker: string;
  speaker_label: string;
  emotion?: string;
  emotion_label?: string;
  text: string;
  duration: number;
  has_ref: boolean;
  audio_url: string;
}

export function FinetuneTab() {
  const [samples, setSamples] = React.useState<DatasetSample[]>([]);
  const [isLoadingSamples, setIsLoadingSamples] = React.useState(false);

  // Add Clip form
  const [ftPresetAnchor, setFtPresetAnchor] = React.useState("tinfy");
  const [ftEmotion, setFtEmotion] = React.useState("neutral");
  const [ftTranscript, setFtTranscript] = React.useState("");
  const [ftFile, setFtFile] = React.useState<File | null>(null);
  const [ftMicBlob, setFtMicBlob] = React.useState<Blob | null>(null);
  const [isAddingClip, setIsAddingClip] = React.useState(false);

  // Speaker filter
  const [speakerFilter, setSpeakerFilter] = React.useState("all");

  // Training Parameters
  const [maxSteps, setMaxSteps] = React.useState(30);
  const [loraRank, setLoraRank] = React.useState("16");
  const [learningRate, setLearningRate] = React.useState("1e-4");
  const [emotionalTuning, setEmotionalTuning] = React.useState(true);
  const [isTraining, setIsTraining] = React.useState(false);
  const [terminalLogs, setTerminalLogs] = React.useState("Ready. Add custom voice clips above or train on existing manifest.");
  const [trainingStatus, setTrainingStatus] = React.useState("Idle");

  // Audio Playback state
  const [playingIndex, setPlayingIndex] = React.useState<number | null>(null);
  const audioPlayerRef = React.useRef<HTMLAudioElement | null>(null);

  const fetchDataset = React.useCallback(async () => {
    setIsLoadingSamples(true);
    try {
      const res = await fetch(getApiUrl("/api/finetune/dataset"));
      const data = await res.json();
      const loadedSamples: DatasetSample[] = (data.samples || []).map((s: DatasetSample) => ({
        ...s,
        audio_url: getApiUrl(s.audio_url),
      }));
      setSamples(loadedSamples);
    } catch (err) {
      console.error("Failed to load dataset:", err);
    } finally {
      setIsLoadingSamples(false);
    }
  }, []);

  const pollTrainingStatus = React.useCallback(async () => {
    try {
      const res = await fetch(getApiUrl("/api/finetune/status"));
      const data = await res.json();
      setIsTraining(data.running || false);
      setTrainingStatus(data.status || "Idle");
      if (data.log) {
        setTerminalLogs(data.log);
      }
    } catch (_) {}
  }, []);

  React.useEffect(() => {
    fetchDataset();
    pollTrainingStatus();
  }, [fetchDataset, pollTrainingStatus]);

  React.useEffect(() => {
    if (!isTraining) return;
    const interval = setInterval(pollTrainingStatus, 1500);
    return () => clearInterval(interval);
  }, [isTraining, pollTrainingStatus]);

  const handleAddClip = async () => {
    if (!ftFile && !ftMicBlob) {
      alert("Please upload an audio file or record from the microphone.");
      return;
    }
    if (!ftTranscript.trim()) {
      alert("Please type the exact Khmer transcript spoken in this clip.");
      return;
    }

    setIsAddingClip(true);
    const form = new FormData();
    form.append("text", ftTranscript.trim());
    form.append("preset_ref_voice", ftPresetAnchor);
    form.append("emotion", ftEmotion);

    if (ftFile) {
      form.append("audio", ftFile);
    } else if (ftMicBlob) {
      form.append("audio", ftMicBlob, "training_clip.wav");
    }

    try {
      const res = await fetch(getApiUrl("/api/finetune/dataset/add"), {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error("Failed to add clip");
      setFtTranscript("");
      setFtFile(null);
      setFtMicBlob(null);
      await fetchDataset();
    } catch (err) {
      alert("Error adding clip: " + err);
    } finally {
      setIsAddingClip(false);
    }
  };

  const handleDeleteClip = async (index: number) => {
    if (!confirm("Are you sure you want to delete this clip from the training dataset?")) return;
    try {
      await fetch(getApiUrl(`/api/finetune/dataset/${index}`), { method: "DELETE" });
      await fetchDataset();
    } catch (err) {
      alert("Delete failed: " + err);
    }
  };

  const handleResetDataset = async () => {
    try {
      const res = await fetch(getApiUrl("/api/finetune/dataset/reset"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speaker: speakerFilter }),
      });
      const data = await res.json();
      await fetchDataset();
      alert(`Loaded ${data.total} clips for speaker: ${speakerFilter}`);
    } catch (err) {
      alert("Reset failed: " + err);
    }
  };

  const handleStartTraining = async () => {
    setIsTraining(true);
    setTerminalLogs("Launching VoxCPM 2 LoRA Fine-Tuning process on Apple Silicon M2 Pro (MPS)...");
    try {
      const res = await fetch(getApiUrl("/api/finetune/start"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_steps: maxSteps,
          lora_r: parseInt(loraRank, 10),
          lr: parseFloat(learningRate),
          emotional_tuning: emotionalTuning,
          enable_proj: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.detail && data.detail.includes("already running")) {
          setIsTraining(true);
          pollTrainingStatus();
          return;
        }
        throw new Error(data.detail || "Training start failed");
      }
    } catch (err) {
      alert("Training error: " + err);
      setIsTraining(false);
    }
  };

  const handleStopTraining = async () => {
    try {
      await fetch(getApiUrl("/api/finetune/stop"), { method: "POST" });
      setIsTraining(false);
    } catch (_) {}
  };

  const togglePlaySample = (index: number, audioUrl: string) => {
    if (playingIndex === index) {
      audioPlayerRef.current?.pause();
      setPlayingIndex(null);
    } else {
      if (!audioPlayerRef.current) {
        audioPlayerRef.current = new Audio();
      }
      audioPlayerRef.current.src = audioUrl;
      audioPlayerRef.current.play();
      audioPlayerRef.current.onended = () => setPlayingIndex(null);
      setPlayingIndex(index);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Add Training Clips Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>១. បន្ថែមទិន្នន័យសំឡេង (Add Speaker Clips for LoRA Fine-Tuning)</CardTitle>
            <Badge variant="cyan" className="font-mono">
              {samples.length} Clips Loaded
            </Badge>
          </div>
          <CardDescription>
            Upload 3–20 clean clips (or record via microphone) along with their exact Khmer transcript. VoxCPM 2 conditions on your speaker&apos;s reference anchor tokens.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Upload or Mic Selector */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300">
                Option A: Upload Audio File (.wav / .mp3)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  id="ftClipUpload"
                  accept="audio/*"
                  onChange={(e) => setFtFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <label
                  htmlFor="ftClipUpload"
                  className="flex-1 flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg border border-slate-800 bg-[#0b1120] hover:border-slate-700 hover:bg-[#0e1628] text-xs text-slate-200 cursor-pointer transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 text-emerald-400" />
                  {ftFile ? ftFile.name : "Choose audio file..."}
                </label>
              </div>
            </div>

            {/* Custom Dropdown: Reference Anchor */}
            <CustomDropdown
              label="Pair with Cambodian Speaker Anchor"
              value={ftPresetAnchor}
              onChange={setFtPresetAnchor}
              options={ANCHOR_VOICE_OPTIONS}
            />

            {/* Custom Dropdown: Emotion & Style */}
            <CustomDropdown
              label="Emotional Tone & Style (អារម្មណ៍)"
              value={ftEmotion}
              onChange={setFtEmotion}
              options={EMOTION_OPTIONS}
            />
          </div>

          {/* Option B: Microphone Recorder */}
          <MicRecorder
            onRecordingComplete={(blob) => setFtMicBlob(blob)}
            label="Option B: Record Training Clip directly from Microphone"
            helperText="Speak a 4–10 second Khmer sentence to add as training data."
          />

          {/* Transcript Area */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">
              Exact Khmer Transcript Spoken in Clip (អត្ថបទដែលនិយាយក្នុងសំឡេង)
            </label>
            <textarea
              value={ftTranscript}
              onChange={(e) => setFtTranscript(e.target.value)}
              rows={2}
              placeholder="វាយបញ្ចូលអត្ថបទដែលអ្នកនិយាយក្នុងឯកសារសំឡេងខាងលើ..."
              className="w-full rounded-xl border border-slate-800 bg-[#090e1b] px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <Button
              type="button"
              variant="default"
              size="md"
              onClick={handleAddClip}
              isLoading={isAddingClip}
              className="text-xs font-semibold"
            >
              ➕ Add Clip to Fine-Tuning Dataset
            </Button>

            <div className="flex items-center gap-2">
              <div className="w-64">
                <CustomDropdown
                  value={speakerFilter}
                  onChange={setSpeakerFilter}
                  options={SPEAKER_FILTER_OPTIONS}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={handleResetDataset}
                className="text-xs whitespace-nowrap"
              >
                📥 Load Clips
              </Button>
            </div>
          </div>

          {/* Dataset Clips Table / Cards */}
          <div className="pt-3 border-t border-slate-800/80 space-y-2 max-h-72 overflow-y-auto">
            {isLoadingSamples ? (
              <div className="text-center py-6 text-xs text-slate-500">Loading clips...</div>
            ) : samples.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-500">No clips in dataset.</div>
            ) : (
              samples.map((s) => (
                <div
                  key={s.index}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-slate-800/80 bg-[#080d19] text-xs hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => togglePlaySample(s.index, s.audio_url)}
                      className="w-7 h-7 rounded-full bg-slate-800 text-slate-200 hover:text-white"
                    >
                      {playingIndex === s.index ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                    </Button>
                    <div className="min-w-0 flex-1">
                      <div className="text-slate-200 truncate font-medium">{s.text}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
                        <span>{s.speaker_label}</span>
                        {s.emotion_label && (
                          <>
                            <span>·</span>
                            <Badge variant="emerald" className="text-[10px] py-0 px-1.5 font-normal">
                              {s.emotion_label}
                            </Badge>
                          </>
                        )}
                        <span>·</span>
                        <span className="font-mono">{s.duration.toFixed(1)}s</span>
                      </div>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteClip(s.index)}
                    className="w-7 h-7 text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* 2. Run LoRA Fine-Tuning Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>២. បង្វឹកម៉ូដែល LoRA (Train VoxCPM 2 Khmer LoRA on M2 Pro)</CardTitle>
            <Badge variant={isTraining ? "emerald" : "default"} className="font-mono">
              {trainingStatus}
            </Badge>
          </div>
          <CardDescription>
            Trains LoRA adapters on base_lm, residual_lm, and feat_decoder with gradient checkpointing and cosine warmup to fit within 16GB memory.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">
                Training Steps (--max-steps)
              </label>
              <input
                type="number"
                value={maxSteps}
                onChange={(e) => setMaxSteps(parseInt(e.target.value, 10) || 10)}
                min={2}
                max={1000}
                className="w-full rounded-lg border border-slate-800 bg-[#090e1b] px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>

            <CustomDropdown
              label="LoRA Rank (--lora-r)"
              value={loraRank}
              onChange={setLoraRank}
              options={LORA_RANK_OPTIONS}
            />

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">
                Learning Rate (--lr)
              </label>
              <input
                type="text"
                value={learningRate}
                onChange={(e) => setLearningRate(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-[#090e1b] px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button
              type="button"
              variant="default"
              size="md"
              onClick={handleStartTraining}
              disabled={isTraining}
              className="gap-2 text-xs font-semibold"
            >
              <Rocket className="w-3.5 h-3.5" />
              {isTraining ? "Training in Progress..." : "Start LoRA Fine-Tuning"}
            </Button>

            {isTraining && (
              <Button
                type="button"
                variant="destructive"
                size="md"
                onClick={handleStopTraining}
                className="gap-1.5 text-xs"
              >
                <StopCircle className="w-3.5 h-3.5" />
                Stop Training
              </Button>
            )}

            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={pollTrainingStatus}
              className="text-xs gap-1.5 ml-auto"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh Log
            </Button>
          </div>

          {/* Terminal Console */}
          <div className="rounded-xl border border-slate-800 bg-[#050811] p-3 text-xs font-mono text-slate-300 space-y-1">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-slate-400">
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              <span>models/voxcpm2_khmer_lora/finetune_console.log</span>
            </div>
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed text-[11.5px] text-slate-300">
              {terminalLogs}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

