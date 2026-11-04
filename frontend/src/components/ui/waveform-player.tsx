"use client";

import * as React from "react";
import { Play, Pause, RotateCcw, Download, Pin } from "lucide-react";
import { formatTimeMMSS } from "@/lib/utils";
import { Button } from "./button";

export interface WaveformPlayerProps {
  audioUrl: string;
  duration?: number;
  onPinForCompare?: () => void;
  title?: string;
  subtitle?: string;
}

export function WaveformPlayer({
  audioUrl,
  duration = 0,
  onPinForCompare,
  title,
  subtitle,
}: WaveformPlayerProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const audioRef = React.useRef<HTMLAudioElement>(null);

  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [audioDuration, setAudioDuration] = React.useState(duration);
  const [peaks, setPeaks] = React.useState<Float32Array | null>(null);

  // Decode audio data to extract waveform peaks
  React.useEffect(() => {
    let isCancelled = false;
    async function loadAudioWaveform() {
      try {
        const res = await fetch(audioUrl);
        const arrayBuf = await res.arrayBuffer();
        const decodeCtx = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const audioBuf = await decodeCtx.decodeAudioData(arrayBuf);
        if (isCancelled) return;
        setAudioDuration(audioBuf.duration);

        const channelData = audioBuf.getChannelData(0);
        const numBars = 160;
        const blockSize = Math.max(1, Math.floor(channelData.length / numBars));
        const rawPeaks = new Float32Array(numBars);
        let maxPeak = 1e-4;

        for (let i = 0; i < numBars; i++) {
          const start = i * blockSize;
          const end = Math.min(channelData.length, start + blockSize);
          let sum = 0;
          const stride = Math.max(1, Math.floor((end - start) / 48));
          for (let j = start; j < end; j += stride) {
            const val = Math.abs(channelData[j]);
            if (val > sum) sum = val;
          }
          rawPeaks[i] = sum;
          if (sum > maxPeak) maxPeak = sum;
        }

        for (let i = 0; i < numBars; i++) {
          rawPeaks[i] = Math.max(0.06, rawPeaks[i] / maxPeak);
        }

        setPeaks(rawPeaks);
        decodeCtx.close();
      } catch (err) {
        console.error("Waveform decode error:", err);
      }
    }

    loadAudioWaveform();
    return () => {
      isCancelled = true;
    };
  }, [audioUrl]);

  // Canvas drawing loop
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;

    let animId: number;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(300, rect.width);
      const height = Math.max(76, rect.height);

      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }

      const g = canvas.getContext("2d");
      if (!g) return;

      g.save();
      g.scale(dpr, dpr);
      g.fillStyle = "#070b14";
      g.fillRect(0, 0, width, height);

      const numBars = peaks.length;
      const barStep = width / numBars;
      const barWidth = Math.max(2.2, barStep * 0.65);
      const mid = height / 2;

      const dur = audioDuration || 1;
      const cur = currentTime || 0;
      const progress = Math.max(0, Math.min(1, cur / dur));
      const playheadBar = Math.floor(progress * numBars);

      for (let i = 0; i < numBars; i++) {
        const amp = peaks[i];
        const barH = Math.max(4, amp * (height * 0.82));
        const x = i * barStep;

        if (i < playheadBar) {
          g.fillStyle = "#10b981"; // Played emerald
        } else if (i === playheadBar && isPlaying) {
          g.fillStyle = "#ffffff";
        } else {
          g.fillStyle = "#38bdf8"; // Upcoming cyan
          g.globalAlpha = progress > 0 ? 0.38 : 0.85;
        }

        g.fillRect(x, mid - barH / 2, barWidth, barH);
        g.globalAlpha = 1.0;
      }

      // Playhead vertical line & timestamp tag
      const playheadX = Math.max(2, Math.min(width - 2, progress * width));
      g.fillStyle = "#f8fafc";
      g.fillRect(playheadX - 1, 0, 2, height);

      const timeText = `${formatTimeMMSS(cur)} / ${formatTimeMMSS(dur)}`;
      g.font = "600 11px Inter, sans-serif";
      const textWidth = g.measureText(timeText).width + 12;
      const pillX = Math.min(width - textWidth - 6, Math.max(6, playheadX - textWidth / 2));
      g.fillStyle = "rgba(15, 23, 42, 0.9)";
      g.fillRect(pillX, 4, textWidth, 18);
      g.fillStyle = "#38bdf8";
      g.fillText(timeText, pillX + 6, 17);

      g.restore();

      if (isPlaying) {
        animId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [peaks, currentTime, audioDuration, isPlaying]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio || !audioDuration) return;

    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = ratio * audioDuration;
    audio.currentTime = target;
    setCurrentTime(target);
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0a0f1d] p-4 space-y-3">
      {/* Header Info */}
      {(title || subtitle) && (
        <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-800/80">
          <div>
            {title && <span className="font-semibold text-slate-200 mr-2">{title}</span>}
            {subtitle && <span className="text-slate-400 font-mono">{subtitle}</span>}
          </div>
          {onPinForCompare && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onPinForCompare}
              className="h-7 text-[11px] gap-1 border-emerald-800/60 text-emerald-400 hover:bg-emerald-950/40"
            >
              <Pin className="w-3 h-3" />
              Pin for A/B Compare
            </Button>
          )}
        </div>
      )}

      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
      />

      {/* Interactive Waveform Canvas */}
      <div className="relative rounded-lg overflow-hidden border border-slate-800/90 cursor-pointer">
        <canvas
          ref={canvasRef}
          onClick={handleSeek}
          className="w-full h-20 block bg-[#070b14]"
        />
      </div>

      {/* Control Bar */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={togglePlay}
            className="w-9 h-9 p-0 rounded-full bg-emerald-600 hover:bg-emerald-500"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              if (audioRef.current) {
                audioRef.current.currentTime = 0;
                setCurrentTime(0);
              }
            }}
            title="Replay from start"
            className="h-8 w-8 text-slate-400 hover:text-slate-200"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>

          <span className="text-xs font-mono font-medium text-slate-300 ml-1">
            {formatTimeMMSS(currentTime)} / {formatTimeMMSS(audioDuration)}
          </span>
        </div>

        <a
          href={audioUrl}
          download="khmer_speech.wav"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Download WAV
        </a>
      </div>
    </div>
  );
}

