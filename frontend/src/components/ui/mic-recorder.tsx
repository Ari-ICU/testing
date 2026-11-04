"use client";

import * as React from "react";
import { Mic, Square, CheckCircle2 } from "lucide-react";
import { Button } from "./button";

export interface MicRecorderProps {
  onRecordingComplete: (blob: Blob, durationSec: number) => void;
  label?: string;
  helperText?: string;
}

export function MicRecorder({
  onRecordingComplete,
  label = "Microphone Voice Recorder",
  helperText = "Click Record and speak clearly for 4–8 seconds.",
}: MicRecorderProps) {
  const [isRecording, setIsRecording] = React.useState(false);
  const [recordedUrl, setRecordedUrl] = React.useState<string | null>(null);
  const [duration, setDuration] = React.useState(0);

  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const processorRef = React.useRef<ScriptProcessorNode | null>(null);
  const chunksRef = React.useRef<Float32Array[]>([]);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = React.useRef<number>(0);

  // Encode Float32 PCM to 16-bit PCM WAV
  const encodeWAV = (samples: Float32Array, sampleRate: number): Blob => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (view: DataView, offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, "data");
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    return new Blob([buffer], { type: "audio/wav" });
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      const ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
        sampleRate: 16000,
      });
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      chunksRef.current = [];

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(input));
      };

      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(ctx.destination);

      setIsRecording(true);
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setDuration((Date.now() - startTimeRef.current) / 1000);
      }, 100);

      // Draw real-time oscilloscope
      const canvas = canvasRef.current;
      if (canvas) {
        const g = canvas.getContext("2d");
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const draw = () => {
          if (!streamRef.current) return;
          requestAnimationFrame(draw);
          analyser.getByteTimeDomainData(dataArray);

          if (!g) return;
          g.fillStyle = "#070b14";
          g.fillRect(0, 0, canvas.width, canvas.height);
          g.lineWidth = 2;
          g.strokeStyle = "#10b981";
          g.beginPath();

          const sliceWidth = canvas.width / dataArray.length;
          let x = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * canvas.height) / 2;
            if (i === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
            x += sliceWidth;
          }
          g.stroke();
        };
        draw();
      }
    } catch (err) {
      alert("Microphone access error: " + err);
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (processorRef.current) processorRef.current.disconnect();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      const sr = audioCtxRef.current.sampleRate;
      audioCtxRef.current.close();
      audioCtxRef.current = null;

      const chunks = chunksRef.current;
      let totalLength = 0;
      for (const c of chunks) totalLength += c.length;

      const merged = new Float32Array(totalLength);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.length;
      }

      const wavBlob = encodeWAV(merged, sr);
      const url = URL.createObjectURL(wavBlob);
      const durSec = totalLength / sr;
      setRecordedUrl(url);
      setIsRecording(false);
      onRecordingComplete(wavBlob, durSec);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-[#090e1b] p-3.5 space-y-3">
      <div className="flex items-center justify-between text-xs">
        <div>
          <span className="font-semibold text-slate-200">{label}</span>
          <span className="text-slate-400 ml-2">{helperText}</span>
        </div>
        <div>
          {isRecording ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={stopRecording}
              className="h-8 gap-1.5"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop ({duration.toFixed(1)}s)
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={startRecording}
              className="h-8 gap-1.5"
            >
              <Mic className="w-3.5 h-3.5 text-emerald-400" />
              {recordedUrl ? "Re-record" : "Start Recording"}
            </Button>
          )}
        </div>
      </div>

      {isRecording && (
        <div className="rounded-lg overflow-hidden border border-emerald-900/50">
          <canvas ref={canvasRef} width={400} height={48} className="w-full h-12 block bg-[#070b14]" />
        </div>
      )}

      {recordedUrl && !isRecording && (
        <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-950/20 border border-emerald-900/40 text-xs">
          <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            <span>Recorded reference voice ready ({duration.toFixed(1)}s)</span>
          </div>
          <audio controls src={recordedUrl} className="h-7 w-52" />
        </div>
      )}
    </div>
  );
}

