"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Loader2, Radio, Clock, Zap, Hourglass, Mic } from "lucide-react";
import { formatHumanDuration } from "@/lib/utils";

export interface LiveWaveformProps {
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
}

export function LiveWaveform({
  percent,
  stage,
  elapsedSec,
  livePeaks,
  partialAudioUrl,
  currentChunk,
  totalChunks,
  completedChunks,
  etaSec,
  secPerChunk,
  rtf,
  partialDurationSec,
}: LiveWaveformProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(300, rect.width);
    const height = Math.max(68, rect.height);

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

    const totalBars = Math.max(90, Math.floor(width / 4.2));
    const barStep = width / totalBars;
    const barW = Math.max(2.2, barStep * 0.65);
    const mid = height / 2;

    const ratioDone = Math.min(0.98, Math.max(0.08, percent / 100));
    const filledBars = Math.floor(totalBars * ratioDone);
    const hasPeaks = livePeaks && livePeaks.length > 0;

    for (let i = 0; i < totalBars; i++) {
      const x = i * barStep;
      if (i < filledBars) {
        let amp = 0.25;
        if (hasPeaks) {
          const pIdx = Math.min(livePeaks.length - 1, Math.floor((i / Math.max(1, filledBars)) * livePeaks.length));
          amp = livePeaks[pIdx] || 0.25;
          amp = Math.min(1.0, Math.max(0.12, amp + 0.08 * Math.sin(elapsedSec * 8.0 + i * 0.4)));
        } else {
          amp = 0.25 + 0.22 * Math.sin(i * 0.42 - elapsedSec * 6.0);
          amp = Math.min(0.95, Math.max(0.14, Math.abs(amp)));
        }
        const barH = Math.max(5, amp * (height * 0.82));
        g.fillStyle = i >= filledBars - 4 ? "#38bdf8" : "#10b981";
        g.fillRect(x, mid - barH / 2, barW, barH);
      } else if (i === filledBars) {
        const pulse = 0.55 + 0.35 * Math.sin(elapsedSec * 10.0);
        const barH = pulse * (height * 0.85);
        g.fillStyle = "#f8fafc";
        g.fillRect(x, mid - barH / 2, barW + 0.8, barH);
      } else {
        const wave = 5 + 4 * Math.sin(i * 0.28 - elapsedSec * 5.0);
        g.fillStyle = "#1e293b";
        g.fillRect(x, mid - wave / 2, barW, Math.max(3, wave));
      }
    }

    g.restore();
  }, [percent, elapsedSec, livePeaks]);

  return (
    <div className="rounded-xl border border-slate-800 bg-[#080d1a] p-4 space-y-3.5 shadow-xl">
      {/* Live Stage & Real-Time Timing Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-slate-200 font-medium truncate">
          <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-emerald-400" />
          <span className="truncate">{stage || "Synthesizing Khmer speech..."}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {etaSec != null && etaSec > 0 && (
            <span className="font-mono text-amber-400 font-medium text-[11px] bg-amber-950/50 border border-amber-800/50 px-2 py-0.5 rounded shadow-sm">
              ETA: ~{formatHumanDuration(etaSec)}
            </span>
          )}
          <span className="font-mono text-emerald-400 font-bold text-sm">{percent}%</span>
          <span className="font-mono text-slate-400 text-[11px]">
            {formatHumanDuration(elapsedSec)}
          </span>
        </div>
      </div>

      {/* Progress Track */}
      <div className="h-2 w-full rounded-full bg-slate-800/90 overflow-hidden relative">
        <motion.div
          className="h-full bg-gradient-to-r from-emerald-500 via-cyan-400 to-sky-400"
          initial={{ width: "3%" }}
          animate={{ width: `${Math.max(3, Math.min(100, percent))}%` }}
          transition={{ ease: "easeOut", duration: 0.3 }}
        />
      </div>

      {/* Live Growing Waveform Canvas */}
      <div className="rounded-lg overflow-hidden border border-slate-800/80">
        <canvas ref={canvasRef} className="w-full h-18 block bg-[#070b14]" />
      </div>

      {/* Real-Time Synthesis Calculation Dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-0.5 text-xs font-mono">
        <div className="bg-slate-900/70 rounded-lg p-2 border border-slate-800/80 flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase font-semibold">
            <Clock className="w-3 h-3 text-cyan-400" />
            <span>Progress</span>
          </div>
          <span className="text-slate-100 font-semibold text-xs">
            {totalChunks && totalChunks > 1
              ? `Chunk ${currentChunk || 1}/${totalChunks} (${percent}%)`
              : `${percent}% completed`}
          </span>
        </div>

        <div className="bg-slate-900/70 rounded-lg p-2 border border-slate-800/80 flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase font-semibold">
            <Zap className="w-3 h-3 text-emerald-400" />
            <span>Pacing Speed</span>
          </div>
          <span className="text-slate-100 font-semibold text-xs">
            {secPerChunk ? `${secPerChunk}s / chunk` : "Calibrating..."}
          </span>
        </div>

        <div className="bg-slate-900/70 rounded-lg p-2 border border-slate-800/80 flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase font-semibold">
            <Hourglass className="w-3 h-3 text-amber-400" />
            <span>Est. Remaining</span>
          </div>
          <span className="text-amber-300 font-semibold text-xs">
            {etaSec != null && etaSec > 0
              ? `~${formatHumanDuration(etaSec)}`
              : completedChunks && completedChunks > 0
              ? "Finishing..."
              : "Estimating..."}
          </span>
        </div>

        <div className="bg-slate-900/70 rounded-lg p-2 border border-slate-800/80 flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase font-semibold">
            <Mic className="w-3 h-3 text-indigo-400" />
            <span>Audio Ready</span>
          </div>
          <span className="text-emerald-300 font-semibold text-xs truncate">
            {partialDurationSec && partialDurationSec > 0
              ? `${partialDurationSec.toFixed(1)}s ${rtf ? `· ${rtf}x RTF` : ""}`
              : "--"}
          </span>
        </div>
      </div>

      {/* Partial Stream Box */}
      {partialAudioUrl && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/50 text-xs">
          <div className="flex items-center gap-2 text-emerald-300">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse shrink-0" />
            <span>Real-time partial stream ready for playback:</span>
          </div>
          <audio controls src={partialAudioUrl} className="h-7 w-full sm:w-60" />
        </div>
      )}
    </div>
  );
}

