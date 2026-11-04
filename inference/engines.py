"""Unified Khmer TTS Engine Adapters for Apple Silicon (M2 Pro 16GB).

Supports Stage 1 benchmarking and Stage 4 production inference across:
1. `mms`: Meta MMS Khmer (`facebook/mms-tts-khm`, local VITS baseline)
2. `f5_khmer`: Khmer F5-TTS (`sarunvisoth/khmer-tts-demo` Space API or local F5-TTS checkpoint)
3. `voxcpm2_khmer`: Khmer-adapted VoxCPM 2 (`ravuthz/VoxCPM2-khmer`, local 48kHz + voice cloning)
4. `voxcpm2_base`: Official Multilingual VoxCPM 2 (`openbmb/VoxCPM2`, local 48kHz + voice cloning)
"""

from __future__ import annotations

from dataclasses import dataclass
import gc
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import threading
import time
from typing import Any

import numpy as np
import soundfile as sf

from preprocessing.khmer_normalizer import (
    chunk_khmer_text,
    normalize_khmer_text,
    normalize_with_control,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
VOICES_JSON = PROJECT_ROOT / "dataset" / "voices" / "voices.json"

EMOTION_STYLE_PROMPTS: dict[str, str] = {
    "neutral": "natural, clear, steady pace",
    "happy": "cheerful, happy, bright and energetic tone, warm smile in voice",
    "sad": "sad, melancholic, soft low voice, slower pace, emotional sigh",
    "angry": "angry, firm, intense, loud and sharp tone, fast pace",
    "excited": "very excited, enthusiastic, high energy, dynamic pitch",
    "whisper": "soft whisper, quiet, intimate and breathy voice",
    "news": "authoritative news anchor, professional, articulate, steady broadcast pace",
    "storytelling": "expressive narrator, dramatic pauses, engaging and warm tone",
    "story": "expressive narrator, dramatic pauses, engaging and warm tone",
    "comedy": "humorous, playful, smiling, chuckling and lighthearted delivery",
    "stern": "firm, serious, authoritative, commanding voice",
    "friendly": "warm, friendly, approachable and natural tone",
    "casual": "conversational, relaxed, friendly and natural pace",
}

_CANCEL_EVENT = threading.Event()
_PROGRESS_LOCK = threading.Lock()
_LIVE_PARTIAL_WAV = PROJECT_ROOT / "benchmarks" / "outputs" / "api_generated" / "live_partial.wav"
_PROGRESS_STATE: dict[str, Any] = {
    "active": False,
    "current_chunk": 0,
    "completed_chunks": 0,
    "total_chunks": 0,
    "token_step": 0,
    "manual_percent": 0,
    "stage": "Idle",
    "started_at": 0.0,
    "partial_duration_sec": 0.0,
    "partial_audio_url": "",
    "live_peaks": [],
    "token_peaks": [],
}


def record_live_token_step(energy: float) -> None:
    """Record a single autoregressive latent frame's acoustic energy in real time."""
    with _PROGRESS_LOCK:
        if not _PROGRESS_STATE.get("active", False):
            return
        step = int(_PROGRESS_STATE.get("token_step", 0)) + 1
        _PROGRESS_STATE["token_step"] = step
        tp: list[float] = _PROGRESS_STATE.setdefault("token_peaks", [])
        tp.append(max(0.01, float(energy)))
        if len(tp) > 240:
            del tp[: len(tp) - 240]

        max_e = max(tp) if tp else 1.0
        min_e = min(tp) if len(tp) > 2 else 0.0
        span = max(1e-4, max_e - min_e)
        norm_tp = [round(0.15 + 0.85 * ((v - min_e) / span), 3) for v in tp]
        _PROGRESS_STATE["live_peaks"] = norm_tp

        cur = max(1, int(_PROGRESS_STATE.get("current_chunk", 1)))
        total = max(1, int(_PROGRESS_STATE.get("total_chunks", 1)))
        est_sec = round(step * 0.16, 1)
        _PROGRESS_STATE["partial_duration_sec"] = max(
            float(_PROGRESS_STATE.get("partial_duration_sec", 0.0)), est_sec
        )
        _PROGRESS_STATE["stage"] = (
            f"Synthesizing Chunk {cur}/{total} · Live Frame {step} (~{est_sec}s voice signal)..."
        )
    # Yield the Python GIL briefly so FastAPI's /api/progress endpoint responds immediately
    time.sleep(0.004)


def _compute_waveform_peaks(y: np.ndarray, num_bins: int = 160) -> list[float]:
    """Compute normalized peak envelope (0.05..1.0) for real-time waveform rendering."""
    if y.size == 0:
        return []
    step = max(1, y.size // num_bins)
    peaks: list[float] = []
    for i in range(0, y.size, step):
        seg = y[i : i + step]
        if seg.size > 0:
            peaks.append(float(np.max(np.abs(seg))))
    peaks = peaks[:num_bins]
    max_p = max(peaks) if peaks else 1.0
    if max_p <= 1e-5:
        return [0.08 for _ in peaks]
    return [round(max(0.06, min(1.0, p / max_p)), 3) for p in peaks]


class GenerationCancelledError(RuntimeError):
    """Raised when the user cancels an active synthesis/cloning request."""


def request_cancel() -> None:
    """Signal active TTS engines to abort generation immediately."""
    _CANCEL_EVENT.set()
    update_generation_progress(active=False, stage="Cancelled")


def clear_cancel() -> None:
    """Reset the cancellation flag before starting a new synthesis job."""
    _CANCEL_EVENT.clear()


def is_cancelled() -> bool:
    """Return True if a cancellation has been requested."""
    return _CANCEL_EVENT.is_set()


def update_generation_progress(
    *,
    active: bool | None = None,
    current_chunk: int | None = None,
    completed_chunks: int | None = None,
    total_chunks: int | None = None,
    percent: int | None = None,
    stage: str | None = None,
    partial_segments: list[np.ndarray] | None = None,
    sample_rate: int = 48000,
    reset_timer: bool = False,
) -> None:
    """Update thread-safe generation progress and live partial waveform for real-time UI."""
    partial_url: str | None = None
    partial_dur: float | None = None
    peaks: list[float] | None = None

    if partial_segments:
        try:
            _LIVE_PARTIAL_WAV.parent.mkdir(parents=True, exist_ok=True)
            joined = np.concatenate([s for s in partial_segments if s.size > 0])
            if joined.size > 0:
                peak = float(np.max(np.abs(joined)))
                if peak > 1e-4:
                    joined = (joined / peak) * 0.90
                sf.write(str(_LIVE_PARTIAL_WAV), joined.astype(np.float32), sample_rate)
                partial_dur = round(joined.size / float(sample_rate), 2)
                partial_url = f"/audio/api_generated/live_partial.wav?t={int(time.time() * 1000)}"
                peaks = _compute_waveform_peaks(joined, num_bins=160)
        except Exception:
            pass

    with _PROGRESS_LOCK:
        if reset_timer:
            _PROGRESS_STATE["started_at"] = time.perf_counter()
            _PROGRESS_STATE["completed_chunks"] = 0
            _PROGRESS_STATE["token_step"] = 0
            _PROGRESS_STATE["manual_percent"] = 12
            _PROGRESS_STATE["partial_duration_sec"] = 0.0
            _PROGRESS_STATE["partial_audio_url"] = ""
            _PROGRESS_STATE["live_peaks"] = []
            _PROGRESS_STATE["token_peaks"] = []
        if active is not None:
            _PROGRESS_STATE["active"] = active
        if current_chunk is not None:
            _PROGRESS_STATE["current_chunk"] = current_chunk
        if completed_chunks is not None:
            _PROGRESS_STATE["completed_chunks"] = completed_chunks
        if total_chunks is not None:
            _PROGRESS_STATE["total_chunks"] = total_chunks
        if percent is not None:
            _PROGRESS_STATE["manual_percent"] = int(percent)
        if stage is not None:
            _PROGRESS_STATE["stage"] = stage
        if partial_dur is not None:
            _PROGRESS_STATE["partial_duration_sec"] = partial_dur
        if partial_url is not None:
            _PROGRESS_STATE["partial_audio_url"] = partial_url
        if peaks is not None:
            _PROGRESS_STATE["live_peaks"] = peaks


def get_generation_progress() -> dict[str, Any]:
    """Return current synthesis progress snapshot including real-time partial waveform and ETA calculations."""
    with _PROGRESS_LOCK:
        started = float(_PROGRESS_STATE.get("started_at", 0.0))
        active = bool(_PROGRESS_STATE.get("active", False))
        elapsed = round(time.perf_counter() - started, 1) if (active and started > 0) else 0.0
        total = max(1, int(_PROGRESS_STATE.get("total_chunks", 1)))
        cur = int(_PROGRESS_STATE.get("current_chunk", 0))
        done = int(_PROGRESS_STATE.get("completed_chunks", 0))
        manual_pct = int(_PROGRESS_STATE.get("manual_percent", 5))
        partial_dur = float(_PROGRESS_STATE.get("partial_duration_sec", 0.0))

        # Real calculation of synthesis percentage
        if not active:
            pct = 0
        elif done >= total and total > 0:
            pct = 98
        elif total > 0 and cur > 0:
            # 5% setup, 90% chunk generation, 5% mastering
            chunk_ratio = float(done) / float(total)
            if cur > done:
                chunk_ratio += 0.5 / float(total)
            computed_pct = int(round(5.0 + 90.0 * min(1.0, chunk_ratio)))
            pct = min(96, max(manual_pct, computed_pct))
        else:
            pct = min(8, manual_pct)

        # Real-time synthesis speed, ETA, and RTF calculations
        eta_sec: float | None = None
        sec_per_chunk: float | None = None
        rtf: float | None = None

        if done > 0 and active:
            avg_per_chunk = elapsed / float(done)
            sec_per_chunk = round(avg_per_chunk, 1)
            remaining_chunks = max(0, total - done)
            eta_sec = round(remaining_chunks * avg_per_chunk, 1)

        if partial_dur > 0.05 and elapsed > 0:
            rtf = round(elapsed / partial_dur, 2)

        live_peaks = list(_PROGRESS_STATE.get("live_peaks", []))
        if active and not live_peaks:
            # Generate animated acoustic warmup envelope while loading/conditioning weights
            n_bars = max(12, min(90, int((pct / 100.0) * 120)))
            live_peaks = [
                round(0.22 + 0.38 * abs(np.sin(i * 0.45 + elapsed * 4.2)), 3)
                for i in range(n_bars)
            ]

        return {
            "active": active,
            "current_chunk": cur,
            "completed_chunks": done,
            "total_chunks": int(_PROGRESS_STATE.get("total_chunks", 0)),
            "percent": pct,
            "stage": str(_PROGRESS_STATE.get("stage", "Idle")),
            "elapsed_sec": elapsed,
            "eta_sec": eta_sec,
            "sec_per_chunk": sec_per_chunk,
            "rtf": rtf,
            "partial_duration_sec": partial_dur,
            "partial_audio_url": str(_PROGRESS_STATE.get("partial_audio_url", "")),
            "live_peaks": live_peaks,
        }


AVAILABLE_MODELS: dict[str, dict[str, Any]] = {
    "mms": {
        "id": "mms",
        "name": "Meta MMS Khmer (VITS)",
        "repo_id": "facebook/mms-tts-khm",
        "license": "CC-BY-NC-4.0",
        "supports_voice_cloning": False,
        "execution": "Local (M2 Pro CPU/MPS, ~145MB)",
        "description": "Fast, lightweight single-speaker Khmer VITS baseline by Meta AI.",
    },
    "f5_khmer": {
        "id": "f5_khmer",
        "name": "Khmer F5-TTS (1,000h Khmer DiT)",
        "repo_id": "sarunvisoth/khmer-tts-demo",
        "license": "CC-BY-NC-4.0",
        "supports_voice_cloning": True,
        "execution": "HF Space API (default) or Local Checkpoint (KHMER_F5_CKPT)",
        "description": "F5-TTS fine-tuned on ~1,000h of Khmer speech (DDD, OpenSLR 42, FLEURS).",
    },
    "voxcpm2_khmer": {
        "id": "voxcpm2_khmer",
        "name": "VoxCPM 2 Khmer (Fine-tuned 48kHz)",
        "repo_id": "ravuthz/VoxCPM2-khmer",
        "license": "Apache-2.0 / Community",
        "supports_voice_cloning": True,
        "execution": "Local (M2 Pro MPS/CPU, ~4.9GB)",
        "description": "Community Khmer-adapted VoxCPM 2 checkpoint with zero-shot voice cloning.",
    },
    "voxcpm2_base": {
        "id": "voxcpm2_base",
        "name": "VoxCPM 2 Official Multilingual (48kHz)",
        "repo_id": "openbmb/VoxCPM2",
        "license": "Apache-2.0",
        "supports_voice_cloning": True,
        "execution": "Local (M2 Pro MPS/CPU, ~4.9GB)",
        "description": "Official OpenBMB VoxCPM 2 supporting 30 languages including Khmer & voice cloning.",
    },
}


@dataclass
class SynthesisResult:
    model_id: str
    model_name: str
    raw_text: str
    normalized_text: str
    audio: np.ndarray
    sample_rate: int
    duration_sec: float
    latency_sec: float
    rtf: float
    voice_id: str
    output_path: str | None = None


def load_voice_profiles() -> dict[str, dict[str, Any]]:
    if not VOICES_JSON.exists():
        return {}
    data = json.loads(VOICES_JSON.read_text(encoding="utf-8"))
    for profile in data.values():
        rel_path = profile.get("audio_path", "")
        if rel_path and not Path(rel_path).is_absolute():
            profile["abs_audio_path"] = str(PROJECT_ROOT / rel_path)
        else:
            profile["abs_audio_path"] = rel_path
    return data


def release_memory() -> None:
    """Free Python and PyTorch MPS/CUDA caches so 16GB M2 Pro stays responsive."""
    gc.collect()
    try:
        import torch

        if torch.backends.mps.is_available():
            torch.mps.empty_cache()
        elif torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


def _active_rms(y: np.ndarray, top_db: float = 36.0) -> float:
    """Compute RMS over active voiced frames so silence gaps do not skew loudness."""
    import librosa

    if y.size == 0 or float(np.max(np.abs(y))) <= 1e-5:
        return 0.0
    intervals = librosa.effects.split(y, top_db=top_db, frame_length=2048, hop_length=512)
    if len(intervals) == 0:
        return float(np.sqrt(np.mean(y**2)))
    voiced = np.concatenate([y[s:e] for s, e in intervals if e > s])
    if voiced.size == 0:
        return float(np.sqrt(np.mean(y**2)))
    return float(np.sqrt(np.mean(voiced**2)))


def _studio_eq_filter(y: np.ndarray, sr: int, highpass_hz: float = 70.0, presence_gain_db: float = 1.0) -> np.ndarray:
    """Zero-phase spectral cleanup: remove sub-bass rumble (<70Hz) and add subtle vocal clarity air."""
    if y.size < 256:
        return y
    spec = np.fft.rfft(y.astype(np.float64))
    freqs = np.fft.rfftfreq(y.size, d=1.0 / float(sr))

    # Smooth 4th-order Butterworth-like high-pass curve at highpass_hz
    hp_curve = 1.0 / np.sqrt(1.0 + (highpass_hz / np.maximum(freqs, 1e-3)) ** 8)
    hp_curve[0] = 0.0

    # Gentle vocal clarity shelf between 3.2kHz and 9.5kHz
    if presence_gain_db > 0.05:
        linear_boost = 10.0 ** (presence_gain_db / 20.0) - 1.0
        presence_band = np.exp(-0.5 * ((freqs - 5200.0) / 2400.0) ** 2)
        eq_curve = hp_curve * (1.0 + linear_boost * presence_band)
    else:
        eq_curve = hp_curve

    filtered = np.fft.irfft(spec * eq_curve, n=y.size)
    return filtered.astype(np.float32)


_CLEAN_REF_CACHE_DIR = Path(tempfile.gettempdir()) / "khmervoice_ref_cache"
_CLEAN_REF_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def clean_reference_audio_file(ref_path: str, max_duration_sec: float = 10.0) -> str:
    """Pre-condition a custom or microphone reference clip for optimal voice cloning.

    - Decodes robustly via ffmpeg to support mislabeled containers (e.g. AAC/M4A labeled as .mp3)
    - Strips DC offset and low-frequency mic rumble (<75Hz)
    - Trims outer dead air while preserving natural breath onset/release
    - Caps overly long uploads to the cleanest voiced segment (<= 10s)
    - Normalizes active RMS loudness so quiet mic recordings clone clearly
    """
    import librosa

    p = Path(ref_path)
    if not p.exists():
        return ref_path

    # Built-in studio reference profiles are already pre-mastered
    if p.name.startswith("ref_") and p.parent.name == "voices":
        return ref_path

    stat = p.stat()
    cache_key = hashlib.md5(f"{p.resolve()}:{stat.st_mtime}:{stat.st_size}".encode()).hexdigest()[:12]
    cached_wav = _CLEAN_REF_CACHE_DIR / f"clean_ref_{cache_key}.wav"
    if cached_wav.exists():
        return str(cached_wav)

    try:
        y = None
        sr = 24000
        # 1. Attempt robust ffmpeg decoding first (handles Android/iOS AAC/M4A disguised as .mp3, etc.)
        try:
            cmd = [
                "ffmpeg",
                "-y",
                "-v",
                "error",
                "-i",
                str(p),
                "-f",
                "f32le",
                "-ar",
                str(sr),
                "-ac",
                "1",
                "pipe:1",
            ]
            proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10)
            if proc.returncode == 0 and len(proc.stdout) > 0:
                y = np.frombuffer(proc.stdout, dtype=np.float32).copy()
        except Exception:
            y = None

        # 2. Fallback to librosa if ffmpeg was not available
        if y is None or y.size < int(sr * 0.4):
            y, sr = librosa.load(str(p), sr=sr, mono=True)

        if y.size < int(sr * 0.4):
            return ref_path

        y = y - float(np.mean(y))
        y = _studio_eq_filter(y, sr, highpass_hz=75.0, presence_gain_db=0.5)

        # Trim leading/trailing silence
        if float(np.max(np.abs(y))) > 1e-4:
            _, (start, end) = librosa.effects.trim(y, top_db=38, frame_length=2048, hop_length=512)
            pad_head = int(sr * 0.06)
            pad_tail = int(sr * 0.10)
            y = y[max(0, int(start) - pad_head) : min(y.size, int(end) + pad_tail)].copy()

        # Cap duration to max_duration_sec so prompt encoding stays fast & focused
        max_samples = int(sr * max_duration_sec)
        if y.size > max_samples:
            y = y[:max_samples].copy()

        # Normalize active RMS to 0.145
        rms = _active_rms(y, top_db=34.0)
        if rms > 1e-4:
            y = y * (0.145 / rms)
        peak = float(np.max(np.abs(y)))
        if peak > 0.92:
            y = (y / peak) * 0.92

        sf.write(str(cached_wav), y.astype(np.float32), sr)
        return str(cached_wav)
    except Exception:
        return ref_path


def _compress_internal_pauses(
    y: np.ndarray,
    sr: int,
    max_pause_sec: float = 0.18,
    target_pause_sec: float = 0.13,
    top_db: float = 40.0,
) -> np.ndarray:
    """Tighten unnatural mid-sentence dead-air pockets (>180ms) while preserving natural breath flow."""
    import librosa

    if y.size < int(sr * 0.4):
        return y
    intervals = librosa.effects.split(y, top_db=top_db, frame_length=2048, hop_length=512)
    if len(intervals) <= 1:
        return y

    max_gap = int(sr * max_pause_sec)
    keep_tail = int(sr * (target_pause_sec * 0.55))
    keep_head = int(sr * (target_pause_sec * 0.45))
    fade_len = max(2, int(sr * 0.02))

    out_parts: list[np.ndarray] = []
    cur_start = int(intervals[0][0])
    cur_end = int(intervals[0][1])

    for i in range(1, len(intervals)):
        nxt_start = int(intervals[i][0])
        nxt_end = int(intervals[i][1])
        gap = nxt_start - cur_end
        if gap > max_gap:
            seg_end = min(y.size, cur_end + keep_tail)
            chunk = y[cur_start:seg_end].copy()
            if chunk.size > fade_len * 2:
                fade_out = 0.5 * (1.0 + np.cos(np.linspace(0.0, np.pi, fade_len, dtype=np.float32)))
                chunk[-fade_len:] *= fade_out
            out_parts.append(chunk)
            cur_start = max(seg_end, nxt_start - keep_head)
            cur_end = nxt_end
        else:
            cur_end = nxt_end

    last_chunk = y[cur_start : min(y.size, cur_end + keep_tail)].copy()
    out_parts.append(last_chunk)

    for idx in range(1, len(out_parts)):
        part = out_parts[idx]
        if part.size > fade_len * 2:
            fade_in = 0.5 * (1.0 - np.cos(np.linspace(0.0, np.pi, fade_len, dtype=np.float32)))
            part[:fade_len] *= fade_in

    return np.concatenate(out_parts) if out_parts else y


def _smooth_dynamics(y: np.ndarray, sr: int, target_rms: float = 0.138) -> np.ndarray:
    """Apply transparent syllabic dynamic leveling so word-to-word volume stays smooth and natural."""
    if y.size == 0 or float(np.max(np.abs(y))) <= 1e-4:
        return y

    win = max(64, int(sr * 0.085))
    sq = y.astype(np.float64) ** 2
    kernel = np.ones(win, dtype=np.float64) / float(win)
    env_rms = np.sqrt(np.maximum(np.convolve(sq, kernel, mode="same"), 1e-10)).astype(np.float32)

    ref_rms = _active_rms(y, top_db=36.0)
    if ref_rms <= 1e-4:
        return y

    floor_rms = ref_rms * 0.22
    ratio = 0.42
    desired_gain = np.where(
        env_rms > floor_rms,
        (ref_rms / np.maximum(env_rms, floor_rms)) ** ratio,
        1.0,
    ).astype(np.float32)
    desired_gain = np.clip(desired_gain, 0.72, 1.38)

    smooth_win = max(32, int(sr * 0.045))
    smooth_kernel = np.hanning(smooth_win).astype(np.float32)
    smooth_kernel /= np.sum(smooth_kernel)
    gain_curve = np.convolve(desired_gain, smooth_kernel, mode="same")

    leveled = y * gain_curve
    new_rms = _active_rms(leveled, top_db=36.0)
    if new_rms > 1e-4:
        leveled = leveled * (target_rms / new_rms)
    return leveled.astype(np.float32)


def smooth_audio_segment(wav: np.ndarray, sr: int) -> np.ndarray:
    """Trim outer dead silence gently, compress excessive internal pauses, and apply cosine fades."""
    import librosa

    y = np.asarray(wav, dtype=np.float32).squeeze()
    if y.ndim == 0 or y.size == 0:
        return np.zeros(0, dtype=np.float32)

    y = y - float(np.mean(y))

    if float(np.max(np.abs(y))) > 1e-4:
        _, (start, end) = librosa.effects.trim(y, top_db=44, frame_length=2048, hop_length=512)
        onset_pad = int(sr * 0.055)
        release_pad = int(sr * 0.135)
        new_start = max(0, int(start) - onset_pad)
        new_end = min(y.size, int(end) + release_pad)
        y = y[new_start:new_end].copy()

        y = _compress_internal_pauses(y, sr, max_pause_sec=0.18, target_pause_sec=0.13, top_db=40.0)

    fade_in = min(int(sr * 0.025), y.size // 4)
    fade_out = min(int(sr * 0.055), y.size // 3)
    if fade_in > 1:
        curve_in = 0.5 * (1.0 - np.cos(np.linspace(0.0, np.pi, fade_in, dtype=np.float32)))
        y[:fade_in] *= curve_in
    if fade_out > 1:
        curve_out = 0.5 * (1.0 + np.cos(np.linspace(0.0, np.pi, fade_out, dtype=np.float32)))
        y[-fade_out:] *= curve_out

    return y


def finalize_waveform(
    segments: list[np.ndarray],
    sr: int,
    pause_sec: float = 0.14,
    speed: float = 1.0,
) -> np.ndarray:
    """Balance chunk loudness, join with smooth breath transitions, apply studio EQ & leveling, and soft-limit."""
    import librosa

    valid = [s.copy() for s in segments if s.size > 0]
    if not valid:
        return np.zeros(sr, dtype=np.float32)

    # 1. Match active RMS loudness across chunks so multi-sentence output never drops in volume
    seg_rms = [_active_rms(s, top_db=36.0) for s in valid]
    nonzero_rms = [r for r in seg_rms if r > 1e-4]
    target_rms = float(np.median(nonzero_rms)) if nonzero_rms else 0.138
    target_rms = float(np.clip(target_rms, 0.105, 0.165))

    for i, s in enumerate(valid):
        r = seg_rms[i]
        if r > 1e-4:
            gain = float(np.clip(target_rms / r, 0.65, 1.45))
            valid[i] = s * gain

    # 2. Join segments with a natural breath pause and smooth raised-cosine overlap
    pause_samples = int(sr * pause_sec)
    xfade_samples = min(int(sr * 0.018), pause_samples // 2)
    parts: list[np.ndarray] = []
    for idx, seg in enumerate(valid):
        parts.append(seg)
        if idx < len(valid) - 1:
            parts.append(np.zeros(max(0, pause_samples - xfade_samples), dtype=np.float32))

    audio = np.concatenate(parts)

    # 3. Studio spectral cleanup (remove sub-70Hz rumble + gentle 5kHz vocal clarity air)
    audio = _studio_eq_filter(audio, sr, highpass_hz=68.0, presence_gain_db=0.9)

    # 4. Smooth syllabic dynamics so word-to-word loudness flows evenly
    audio = _smooth_dynamics(audio, sr, target_rms=target_rms)

    # 5. High-resolution time-stretching (n_fft=4096 avoids phaseiness at 48kHz)
    if abs(speed - 1.0) >= 0.03 and 0.5 <= speed <= 2.0:
        n_fft = 4096 if sr >= 32000 else 2048
        audio = librosa.effects.time_stretch(
            audio.astype(np.float32), rate=float(speed), n_fft=n_fft, hop_length=n_fft // 4
        )

    # 6. Soft-knee peak limiting to prevent harsh transient clipping while keeping voice warm
    peak = float(np.max(np.abs(audio)))
    if peak > 0.90:
        audio = np.tanh(audio / 0.85) * 0.85
        peak = float(np.max(np.abs(audio)))
    if peak > 1e-4:
        audio = (audio / peak) * 0.91
    return audio.astype(np.float32)


class BaseKhmerTTSEngine:
    model_id: str = "base"

    def load(self) -> None:
        raise NotImplementedError

    def unload(self) -> None:
        release_memory()

    def synthesize(
        self,
        text: str,
        voice: str = "female",
        ref_audio_path: str | None = None,
        ref_text: str | None = None,
        normalize: bool = True,
        **kwargs: Any,
    ) -> SynthesisResult:
        raise NotImplementedError


class MMSKhmerEngine(BaseKhmerTTSEngine):
    """Meta MMS Khmer (`facebook/mms-tts-khm`) local VITS engine."""

    model_id = "mms"

    def __init__(self, repo_id: str = "facebook/mms-tts-khm") -> None:
        self.repo_id = repo_id
        self.model = None
        self.tokenizer = None

    def load(self) -> None:
        if self.model is not None:
            return
        from transformers import AutoTokenizer, VitsModel

        self.tokenizer = AutoTokenizer.from_pretrained(self.repo_id)
        self.model = VitsModel.from_pretrained(self.repo_id).to("cpu")
        self.model.eval()

    def unload(self) -> None:
        self.model = None
        self.tokenizer = None
        super().unload()

    def synthesize(
        self,
        text: str,
        voice: str = "female",
        ref_audio_path: str | None = None,
        ref_text: str | None = None,
        normalize: bool = True,
        speed: float = 1.0,
        **kwargs: Any,
    ) -> SynthesisResult:
        import torch

        update_generation_progress(active=True, current_chunk=0, total_chunks=1, stage="Loading Meta MMS VITS...", reset_timer=True)
        try:
            self.load()
            assert self.model is not None and self.tokenizer is not None

            t0 = time.perf_counter()
            norm_text = normalize_khmer_text(text) if normalize else text.strip()
            chunks = chunk_khmer_text(norm_text) if normalize else [norm_text]
            update_generation_progress(total_chunks=len(chunks), stage="Synthesizing Khmer VITS...")

            sr = int(self.model.config.sampling_rate)
            wav_segments: list[np.ndarray] = []

            with torch.no_grad():
                for idx, chunk in enumerate(chunks):
                    if is_cancelled():
                        raise GenerationCancelledError("Generation cancelled by user.")
                    update_generation_progress(
                        current_chunk=idx + 1,
                        total_chunks=len(chunks),
                        stage=f"Synthesizing chunk {idx + 1}/{len(chunks)}...",
                    )
                    inputs = self.tokenizer(chunk, return_tensors="pt")
                    output = self.model(**inputs).waveform
                    seg = output.squeeze().cpu().numpy().astype(np.float32)
                    if seg.ndim == 0:
                        continue
                    wav_segments.append(smooth_audio_segment(seg, sr))
                    update_generation_progress(
                        completed_chunks=idx + 1,
                        partial_segments=wav_segments,
                        sample_rate=sr,
                    )

            update_generation_progress(stage="Studio audio mastering...")
            audio = finalize_waveform(wav_segments, sr, pause_sec=0.15, speed=speed)
            latency = time.perf_counter() - t0
            duration = len(audio) / float(sr)
            base_name = AVAILABLE_MODELS[self.model_id]["name"]
            return SynthesisResult(
                model_id=self.model_id,
                model_name=base_name,
                raw_text=text,
                normalized_text=norm_text,
                audio=audio,
                sample_rate=sr,
                duration_sec=duration,
                latency_sec=latency,
                rtf=latency / max(duration, 1e-4),
                voice_id="mms-default (male)",
            )
        finally:
            update_generation_progress(active=False, stage="Idle")


class F5KhmerEngine(BaseKhmerTTSEngine):
    """Khmer F5-TTS Engine."""

    model_id = "f5_khmer"

    def __init__(
        self,
        ckpt_path: str | None = None,
        vocab_path: str | None = None,
        space_id: str = "sarunvisoth/khmer-tts-demo",
    ) -> None:
        self.ckpt_path = ckpt_path or os.environ.get("KHMER_F5_CKPT")
        self.vocab_path = vocab_path or os.environ.get("KHMER_F5_VOCAB")
        self.space_id = space_id
        self.local_model = None
        self.local_vocoder = None
        self.client = None

    def load(self) -> None:
        if self.ckpt_path and self.vocab_path:
            if self.local_model is not None:
                return
            from importlib.resources import files
            from omegaconf import OmegaConf
            import f5_tts.model as m
            from f5_tts.infer.utils_infer import load_model, load_vocoder

            cfg_path = str(files("f5_tts").joinpath("configs/F5TTS_v1_Base.yaml"))
            cfg = OmegaConf.load(cfg_path)
            self.local_model = load_model(
                getattr(m, cfg.model.backbone),
                cfg.model.arch,
                self.ckpt_path,
                vocab_file=self.vocab_path,
                use_ema=False,
            )
            self.local_vocoder = load_vocoder("vocos")
        else:
            if self.client is not None:
                return
            from gradio_client import Client
            from huggingface_hub import get_token

            hf_token = (
                os.environ.get("HF_TOKEN")
                or os.environ.get("HUGGING_FACE_HUB_TOKEN")
                or get_token()
            )
            self.client = Client(self.space_id, token=hf_token)

    def _fallback_to_mms(
        self, text: str, voice: str, normalize: bool
    ) -> SynthesisResult:
        mms = MMSKhmerEngine()
        res = mms.synthesize(text=text, voice=voice, normalize=normalize)
        res.model_name = (
            f"{AVAILABLE_MODELS[self.model_id]['name']} → Local MMS Fallback (ZeroGPU Quota Reached)"
        )
        return res

    def unload(self) -> None:
        self.local_model = None
        self.local_vocoder = None
        self.client = None
        super().unload()

    def synthesize(
        self,
        text: str,
        voice: str = "female",
        ref_audio_path: str | None = None,
        ref_text: str | None = None,
        normalize: bool = True,
        nfe_step: int = 32,
        **kwargs: Any,
    ) -> SynthesisResult:
        update_generation_progress(active=True, current_chunk=0, total_chunks=1, stage="Connecting to F5-TTS...", reset_timer=True)
        try:
            self.load()
            t0 = time.perf_counter()
            norm_text = normalize_khmer_text(text) if normalize else text.strip()
            voices = load_voice_profiles()
            profile = voices.get(voice, voices.get("female", {}))

            if self.local_model is not None and self.local_vocoder is not None:
                from f5_tts.infer.utils_infer import infer_process, preprocess_ref_audio_text

                clip_path = ref_audio_path or profile.get("abs_audio_path")
                clip_text = ref_text or profile.get("ref_text", "")
                ref_a, ref_t = preprocess_ref_audio_text(clip_path, clip_text)
                chunks = chunk_khmer_text(norm_text)
                wav_parts: list[np.ndarray] = []
                sr = 24000
                for idx, chunk in enumerate(chunks):
                    update_generation_progress(
                        current_chunk=idx + 1,
                        total_chunks=len(chunks),
                        stage=f"Synthesizing F5-TTS chunk {idx + 1}/{len(chunks)}...",
                    )
                    wav, sr, _ = infer_process(
                        ref_a,
                        ref_t,
                        chunk,
                        self.local_model,
                        self.local_vocoder,
                        nfe_step=nfe_step,
                    )
                    wav_parts.append(smooth_audio_segment(np.asarray(wav, dtype=np.float32), sr))
                audio = finalize_waveform(wav_parts, sr, pause_sec=0.15)
            else:
                assert self.client is not None
                space_voice = "ប្រុស (male)" if voice == "male" else "ស្រី (female)"
                try:
                    result = self.client.predict(
                        text=norm_text,
                        voice=space_voice,
                        nfe=nfe_step,
                        api_name="/tts",
                    )
                except Exception as exc:
                    err_str = str(exc)
                    if "ZeroGPU" in err_str or "quota" in err_str.lower():
                        return self._fallback_to_mms(text=text, voice=voice, normalize=normalize)
                    raise
                wav_file = result[0] if isinstance(result, (list, tuple)) else result
                audio, sr = sf.read(wav_file, dtype="float32")
                if audio.ndim > 1:
                    audio = audio.mean(axis=1)

            latency = time.perf_counter() - t0
            duration = len(audio) / float(sr)
            base_name = AVAILABLE_MODELS[self.model_id]["name"]
            return SynthesisResult(
                model_id=self.model_id,
                model_name=base_name,
                raw_text=text,
                normalized_text=norm_text,
                audio=audio,
                sample_rate=int(sr),
                duration_sec=duration,
                latency_sec=latency,
                rtf=latency / max(duration, 1e-4),
                voice_id=voice,
            )
        finally:
            update_generation_progress(active=False, stage="Idle")


class VoxCPM2Engine(BaseKhmerTTSEngine):
    """VoxCPM 2 Engine (`ravuthz/VoxCPM2-khmer` or `openbmb/VoxCPM2`).

    Supports zero-shot voice cloning via `reference_wav_path`, ultimate
    cloning via `prompt_wav_path` + `prompt_text`, and custom fine-tuned LoRA
    weights (`models/voxcpm2_khmer_lora/lora_weights.safetensors` or `VOXCPM_LORA_PATH`).
    """

    def __init__(
        self, model_id: str = "voxcpm2_khmer", lora_weights_path: str | None = None
    ) -> None:
        self.model_id = model_id
        self.repo_id = AVAILABLE_MODELS[model_id]["repo_id"]
        use_lora_env = os.environ.get("VOXCPM_USE_LORA", "").strip().lower() in ("1", "true", "yes")
        default_lora = PROJECT_ROOT / "models" / "voxcpm2_khmer_lora" / "lora_weights.safetensors"
        self.lora_weights_path = (
            lora_weights_path
            or os.environ.get("VOXCPM_LORA_PATH")
            or (str(default_lora) if (use_lora_env and model_id == "voxcpm2_khmer" and default_lora.exists()) else None)
        )
        self.model = None
        self.lora_active = False
        self._prompt_caches: dict[tuple[Any, ...], dict[str, Any]] = {}

    def load(self, need_lora: bool = False) -> None:
        if self.model is not None:
            if not need_lora or getattr(self, "_lora_injected", False):
                return
            self.unload()

        from huggingface_hub import snapshot_download
        from safetensors.torch import load_file
        import torch
        from transformers import LlamaTokenizerFast
        from voxcpm.model.voxcpm2 import (
            AudioVAEV2,
            LoRAConfig,
            VoxCPM2Model,
            VoxCPMConfig,
            get_dtype,
        )

        update_generation_progress(
            percent=1,
            stage="Resolving local VoxCPM 2 Khmer checkpoint...",
        )
        time.sleep(0.005)

        if os.path.isdir(self.repo_id):
            local_path = self.repo_id
        else:
            try:
                local_path = snapshot_download(self.repo_id, local_files_only=True)
            except Exception:
                local_path = snapshot_download(self.repo_id, local_files_only=False)

        default_lora = PROJECT_ROOT / "models" / "voxcpm2_khmer_lora" / "lora_weights.safetensors"
        use_lora_env = os.environ.get("VOXCPM_USE_LORA", "").strip().lower() in ("1", "true", "yes")
        inject_lora = bool((need_lora or use_lora_env or self.lora_weights_path) and self.model_id == "voxcpm2_khmer")

        lora_cfg = None
        init_lora_path = None
        if inject_lora:
            cfg_json = default_lora.parent / "lora_config.json"
            if cfg_json.exists():
                meta = json.loads(cfg_json.read_text(encoding="utf-8"))
                lora_cfg = LoRAConfig(**meta.get("lora_config", {}))
            else:
                lora_cfg = LoRAConfig(enable_lm=True, enable_dit=True, r=16, alpha=32)
            init_lora_path = (
                self.lora_weights_path
                if (self.lora_weights_path and Path(self.lora_weights_path).exists())
                else (str(default_lora) if default_lora.exists() else None)
            )

        update_generation_progress(
            percent=2,
            stage="Loading Khmer Tokenizer & 48kHz AudioVAE...",
        )
        time.sleep(0.005)

        with open(os.path.join(local_path, "config.json"), "r", encoding="utf-8") as cfg_f:
            config = VoxCPMConfig.model_validate_json(cfg_f.read())
        # Cap KV-cache length to 2048 tokens to save ~450MB of M2 Pro unified memory
        config.max_length = min(int(getattr(config, "max_length", 2048)), 2048)

        tokenizer = LlamaTokenizerFast.from_pretrained(local_path)
        audio_vae_config = getattr(config, "audio_vae_config", None)
        audio_vae = AudioVAEV2(config=audio_vae_config) if audio_vae_config else AudioVAEV2()

        audiovae_st = os.path.join(local_path, "audiovae.safetensors")
        audiovae_pth = os.path.join(local_path, "audiovae.pth")
        if os.path.exists(audiovae_st):
            vae_sd = load_file(audiovae_st, device="cpu")
        else:
            ckpt = torch.load(audiovae_pth, map_location="cpu", weights_only=True)
            vae_sd = ckpt.get("state_dict", ckpt)
        audio_vae.load_state_dict(vae_sd, strict=False)
        del vae_sd
        gc.collect()

        update_generation_progress(
            percent=3,
            stage="Building VoxCPM 2 Architecture in Low-Memory Mode...",
        )
        time.sleep(0.005)

        # Skip slow CPU random initialization since weights are loaded immediately below
        orig_kaiming = torch.nn.init.kaiming_uniform_
        orig_normal = torch.nn.init.normal_
        orig_uniform = torch.nn.init.uniform_
        orig_dtype = torch.get_default_dtype()
        torch.nn.init.kaiming_uniform_ = lambda t, *a, **kw: t
        torch.nn.init.normal_ = lambda t, *a, **kw: t
        torch.nn.init.uniform_ = lambda t, *a, **kw: t
        torch.set_default_dtype(torch.bfloat16)
        try:
            tts_model = VoxCPM2Model(config, tokenizer, audio_vae, lora_config=lora_cfg, device="mps")
        finally:
            torch.set_default_dtype(orig_dtype)
            torch.nn.init.kaiming_uniform_ = orig_kaiming
            torch.nn.init.normal_ = orig_normal
            torch.nn.init.uniform_ = orig_uniform

        update_generation_progress(
            percent=3,
            stage="Reading 4.9GB Khmer Model Weights from Disk...",
        )
        time.sleep(0.005)

        st_path = os.path.join(local_path, "model.safetensors")
        bin_path = os.path.join(local_path, "pytorch_model.bin")
        if os.path.exists(st_path):
            model_sd = load_file(st_path, device="cpu")
        else:
            ckpt = torch.load(bin_path, map_location="cpu", weights_only=True)
            model_sd = ckpt.get("state_dict", ckpt)
        tts_model.load_state_dict(model_sd, strict=False)
        del model_sd
        gc.collect()

        if init_lora_path and os.path.exists(init_lora_path):
            update_generation_progress(
                percent=4,
                stage="Loading Custom Khmer LoRA Adapter Weights...",
            )
            tts_model.load_lora_weights(init_lora_path)

        # Stream submodules to MPS one-by-one so peak RAM stays under 8.8GB (zero swap!)
        target_dev = tts_model.device
        lm_dtype = get_dtype(tts_model.config.dtype)
        n_layers = len(tts_model.base_lm.layers)
        for idx, layer in enumerate(tts_model.base_lm.layers):
            layer.to(device=target_dev, dtype=lm_dtype)
            if idx % 4 == 0 or idx == n_layers - 1:
                pct = 4 + int(1 * ((idx + 1) / max(1, n_layers)))
                update_generation_progress(
                    percent=pct,
                    stage=f"Streaming Transformer Layers to Apple M2 Pro GPU ({idx + 1}/{n_layers})...",
                )
                time.sleep(0.004)

        tts_model.base_lm.to(device=target_dev, dtype=lm_dtype)
        update_generation_progress(
            percent=5,
            stage="Streaming Residual LM & Flow-Matching DiT to M2 Pro GPU...",
        )
        time.sleep(0.004)

        tts_model.residual_lm.to(device=target_dev, dtype=lm_dtype)
        tts_model.feat_encoder.to(device=target_dev, dtype=lm_dtype)
        tts_model.feat_decoder.to(device=target_dev, dtype=lm_dtype)
        tts_model.fsq_layer.to(device=target_dev, dtype=lm_dtype)
        tts_model.enc_to_lm_proj.to(device=target_dev, dtype=lm_dtype)
        tts_model.lm_to_dit_proj.to(device=target_dev, dtype=lm_dtype)
        tts_model.res_to_dit_proj.to(device=target_dev, dtype=lm_dtype)
        tts_model.fusion_concat_proj.to(device=target_dev, dtype=lm_dtype)
        tts_model.stop_proj.to(device=target_dev, dtype=lm_dtype)
        tts_model.stop_actn.to(device=target_dev, dtype=lm_dtype)
        tts_model.stop_head.to(device=target_dev, dtype=lm_dtype)
        tts_model.audio_vae.to(device=target_dev, dtype=torch.float32)
        tts_model.eval()
        gc.collect()
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()

        class _LightweightVoxCPMWrapper:
            def __init__(self, inner_tts_model: Any) -> None:
                self.tts_model = inner_tts_model

            def load_lora(self, path: str) -> Any:
                return self.tts_model.load_lora_weights(path)

            def set_lora_enabled(self, enabled: bool) -> None:
                if hasattr(self.tts_model, "set_lora_enabled"):
                    self.tts_model.set_lora_enabled(enabled)

        self.model = _LightweightVoxCPMWrapper(tts_model)
        self._lora_injected = inject_lora
        self.lora_active = bool((need_lora or use_lora_env) and init_lora_path)
        if inject_lora and hasattr(self.model, "set_lora_enabled"):
            try:
                self.model.set_lora_enabled(self.lora_active)
            except Exception:
                pass

        if hasattr(tts_model, "stop_head"):
            def _cancel_check_hook(_module: Any, _inputs: Any) -> None:
                if is_cancelled():
                    raise GenerationCancelledError("Generation cancelled by user.")

            tts_model.stop_head.register_forward_pre_hook(_cancel_check_hook)
        if hasattr(tts_model, "feat_decoder"):
            def _live_latent_hook(_module: Any, _inputs: Any, output: Any) -> None:
                try:
                    energy = float(output.detach().std().cpu().item())
                    record_live_token_step(energy)
                except Exception:
                    pass

            tts_model.feat_decoder.register_forward_hook(_live_latent_hook)

    def unload(self) -> None:
        self.model = None
        self._prompt_caches.clear()
        super().unload()

    def _get_or_build_prompt_cache(
        self,
        resolved_ref_audio: str | None,
        resolved_ref_text: str | None,
        ultimate_clone: bool,
    ) -> dict[str, Any] | None:
        if not resolved_ref_audio or not Path(resolved_ref_audio).exists():
            return None
        tts_model = getattr(self.model, "tts_model", None)
        if tts_model is None or not hasattr(tts_model, "build_prompt_cache"):
            return None

        # Pre-condition custom/mic reference audio for cleaner speaker timbre extraction
        conditioned_audio = clean_reference_audio_file(resolved_ref_audio)

        mtime = Path(conditioned_audio).stat().st_mtime
        norm_prompt_text = (
            normalize_khmer_text(resolved_ref_text)
            if (ultimate_clone and resolved_ref_text)
            else ""
        )
        key = (
            str(Path(conditioned_audio).resolve()),
            mtime,
            bool(ultimate_clone),
            norm_prompt_text,
        )
        if key not in self._prompt_caches:
            self._prompt_caches[key] = tts_model.build_prompt_cache(
                prompt_text=norm_prompt_text if (ultimate_clone and norm_prompt_text) else None,
                prompt_wav_path=conditioned_audio if (ultimate_clone and norm_prompt_text) else None,
                reference_wav_path=conditioned_audio,
                trim_silence_vad=False,
            )
        return self._prompt_caches[key]

    def synthesize(
        self,
        text: str,
        voice: str = "female",
        ref_audio_path: str | None = None,
        ref_text: str | None = None,
        normalize: bool = True,
        cfg_value: float = 2.0,
        inference_timesteps: int = 16,
        ultimate_clone: bool = False,
        speed: float = 1.0,
        use_lora: bool | None = None,
        emotion: str = "neutral",
        **kwargs: Any,
    ) -> SynthesisResult:
        from voxcpm.model.utils import next_and_close

        # Determine natural-language emotion/style instruction
        eff_cfg = cfg_value
        emo = str(emotion or "neutral").lower()
        custom_style = kwargs.get("custom_style_prompt")
        use_hifi = bool(kwargs.get("use_hifi_clone", False))

        style_instruction = (
            custom_style.strip()
            if custom_style
            else EMOTION_STYLE_PROMPTS.get(emo, "")
        )
        has_emotion = bool(style_instruction and (emo != "neutral" or custom_style))

        # Dynamic prosody, guidance scaling & tempo based on emotional style
        if emo in ("angry", "excited") and eff_cfg < 2.4:
            eff_cfg = 2.4
        elif emo in ("stern", "comedy") and eff_cfg < 2.2:
            eff_cfg = 2.2
        elif emo == "happy" and eff_cfg < 2.1:
            eff_cfg = 2.1
        elif emo in ("sad", "whisper") and eff_cfg > 1.8:
            eff_cfg = 1.8

        # In direct zero-shot mode without reference transcript, ensure guidance is strong enough (>= 2.2)
        # to firmly transfer the speaker's acoustic timbre without drifting to the base model.
        if not ref_text and eff_cfg < 2.2 and not has_emotion:
            eff_cfg = 2.2

        # Subtle stylistic pacing adjustment if speed is at default (1.0)
        eff_speed = speed
        if abs(speed - 1.0) < 1e-4:
            if emo == "comedy":
                eff_speed = 1.05
            elif emo == "happy":
                eff_speed = 1.04
            elif emo in ("sad", "whisper"):
                eff_speed = 0.92
            elif emo == "stern":
                eff_speed = 0.96

        # When emotion control is requested, VoxCPM2 requires controllable cloning mode
        # (reference_wav_path only without prompt_text), because prompt_text forces continuation
        # and overrides the parenthesized style instruction.
        eff_ultimate_clone = ultimate_clone and use_hifi and not has_emotion

        update_generation_progress(
            active=True,
            current_chunk=0,
            completed_chunks=0,
            total_chunks=1,
            percent=2,
            stage="Initializing VoxCPM 2 Engine...",
            reset_timer=True,
        )
        try:
            self.load(need_lora=bool(use_lora))
            assert self.model is not None
            default_lora = PROJECT_ROOT / "models" / "voxcpm2_khmer_lora" / "lora_weights.safetensors"
            if use_lora is not None and self.model_id == "voxcpm2_khmer":
                if use_lora and default_lora.exists():
                    try:
                        self.model.load_lora(str(default_lora))
                        self.model.set_lora_enabled(True)
                        self.lora_active = True
                    except Exception:
                        self.lora_active = False
                else:
                    if hasattr(self.model, "set_lora_enabled"):
                        try:
                            self.model.set_lora_enabled(False)
                        except Exception:
                            pass
                    self.lora_active = False
            elif hasattr(self.model, "set_lora_enabled"):
                try:
                    self.model.set_lora_enabled(bool(getattr(self, "lora_active", False)))
                except Exception:
                    pass

            t0 = time.perf_counter()
            # Clean any legacy bracketed emotion tags so the TTS model never recites them
            clean_text = re.sub(
                r"^\[(?:កំប្លែង|ម៉ឺងម៉ាត់|រីករាយ|សោកសៅ|ខឹង|និទាន|ខ្សឹប|ព័ត៌មាន|សន្ទនា|បុរាណ|រាយការណ៍|comedy|stern|happy|sad|angry|story|whisper|news|casual|heritage|reporter)\]\s*",
                "",
                text.strip(),
                flags=re.IGNORECASE,
            ).strip()
            if not clean_text:
                clean_text = text.strip()

            if has_emotion:
                norm_text = (
                    normalize_with_control(clean_text, emotion_prompt=style_instruction)
                    if normalize
                    else f"({style_instruction}) {clean_text}"
                )
                chunks = (
                    chunk_khmer_text(clean_text, emotion_prompt=style_instruction)
                    if normalize
                    else [f"({style_instruction}) {clean_text}"]
                )
            else:
                norm_text = normalize_khmer_text(clean_text) if normalize else clean_text
                chunks = chunk_khmer_text(clean_text) if normalize else [clean_text]

            voices = load_voice_profiles()
            profile = voices.get(voice, {})
            resolved_ref_audio = ref_audio_path or profile.get("abs_audio_path")
            resolved_ref_text = ref_text if ref_text is not None else profile.get("ref_text")

            tts_model = getattr(self.model, "tts_model", None)
            sr = int(getattr(tts_model, "sample_rate", 48000))
            wav_segments: list[np.ndarray] = []

            update_generation_progress(
                current_chunk=0,
                completed_chunks=0,
                total_chunks=len(chunks),
                percent=5,
                stage="Conditioning Reference Speaker Timbre...",
            )
            time.sleep(0.005)
            prompt_cache = self._get_or_build_prompt_cache(
                resolved_ref_audio=resolved_ref_audio,
                resolved_ref_text=resolved_ref_text,
                ultimate_clone=eff_ultimate_clone,
            )

            for idx, chunk in enumerate(chunks):
                if is_cancelled():
                    raise GenerationCancelledError("Generation cancelled by user.")
                with _PROGRESS_LOCK:
                    _PROGRESS_STATE["token_step"] = 0
                update_generation_progress(
                    current_chunk=idx + 1,
                    completed_chunks=idx,
                    total_chunks=len(chunks),
                    stage=f"Synthesizing Khmer Prosody Chunk {idx + 1}/{len(chunks)}...",
                )
                time.sleep(0.005)
                if tts_model is not None and hasattr(tts_model, "_generate_with_prompt_cache"):
                    gen = tts_model._generate_with_prompt_cache(
                        target_text=chunk,
                        prompt_cache=prompt_cache,
                        min_len=2,
                        max_len=1600,
                        inference_timesteps=inference_timesteps,
                        cfg_value=eff_cfg,
                        retry_badcase=True,
                        retry_badcase_max_times=2,
                        retry_badcase_ratio_threshold=4.5,
                        streaming=False,
                    )
                    try:
                        wav_tensor, _, _ = next_and_close(gen)
                    except GenerationCancelledError:
                        gen.close()
                        release_memory()
                        raise
                    seg_np = wav_tensor.squeeze(0).cpu().numpy()
                else:
                    gen_kwargs: dict[str, Any] = {
                        "text": chunk,
                        "cfg_value": eff_cfg,
                        "inference_timesteps": inference_timesteps,
                    }
                    if resolved_ref_audio and Path(resolved_ref_audio).exists():
                        gen_kwargs["reference_wav_path"] = clean_reference_audio_file(resolved_ref_audio)
                    seg_np = np.asarray(self.model.generate(**gen_kwargs), dtype=np.float32)

                wav_segments.append(smooth_audio_segment(seg_np, sr))
                update_generation_progress(
                    current_chunk=idx + 1,
                    completed_chunks=idx + 1,
                    total_chunks=len(chunks),
                    partial_segments=wav_segments,
                    sample_rate=sr,
                    stage=f"Completed Chunk {idx + 1}/{len(chunks)} ({idx + 1}/{len(chunks)} ready)...",
                )

            update_generation_progress(
                current_chunk=len(chunks),
                completed_chunks=len(chunks),
                total_chunks=len(chunks),
                percent=97,
                stage="Mastering 48kHz Studio Waveform...",
            )
            audio = finalize_waveform(wav_segments, sr, pause_sec=0.14, speed=eff_speed)
            latency = time.perf_counter() - t0
            duration = len(audio) / float(sr)
            base_name = AVAILABLE_MODELS[self.model_id]["name"]
            display_name = f"{base_name} + Custom LoRA" if getattr(self, "lora_active", False) else base_name
            return SynthesisResult(
                model_id=self.model_id,
                model_name=display_name,
                raw_text=text,
                normalized_text=norm_text,
                audio=audio,
                sample_rate=sr,
                duration_sec=duration,
                latency_sec=latency,
                rtf=latency / max(duration, 1e-4),
                voice_id=voice if resolved_ref_audio else "default",
            )
        finally:
            update_generation_progress(active=False, stage="Idle")


def get_engine(model_id: str, **kwargs: Any) -> BaseKhmerTTSEngine:
    if model_id == "mms":
        return MMSKhmerEngine(**kwargs)
    if model_id == "f5_khmer":
        return F5KhmerEngine(**kwargs)
    if model_id in ("voxcpm2_khmer", "voxcpm2_base"):
        return VoxCPM2Engine(model_id=model_id, **kwargs)
    raise ValueError(
        f"Unknown model_id '{model_id}'. Choose from: {list(AVAILABLE_MODELS.keys())}"
    )
