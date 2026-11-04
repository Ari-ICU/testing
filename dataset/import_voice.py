"""Import a real reference clip (e.g. a Khmer movie dub line) as a preset voice.

Accepts any format ffmpeg can read (wav, mp3, m4a, mp4, mkv...). Cuts the
requested time range, converts to mono 24 kHz, removes DC/rumble, trims outer
silence and normalises to -3 dBFS peak (never clips). Then adds or replaces the
voice in dataset/voices/voices.json (a .bak backup is written first).

Example:
  .venv/bin/python dataset/import_voice.py \
      --input ~/Downloads/judge_bao_ep1.mp4 --start 83.2 --end 91.5 \
      --id pao_chin --gender male \
      --label "⚖️ ប៉ាវចិន — Pao Chin (Judge Bao Classic Khmer Dub)" \
      --text "<exact Khmer words spoken in that time range>"

Tips for good cloning:
  * 5–12 seconds of ONE speaker, no background music, no other voices.
  * --text must match the spoken words exactly (it is used for prompt
    continuation); if unsure, pass --text "" and only timbre will be cloned.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
VOICES_DIR = ROOT / "dataset" / "voices"
VOICES_JSON = VOICES_DIR / "voices.json"
SR = 24000


def extract(input_path: Path, start: float | None, end: float | None) -> np.ndarray:
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td) / "cut.wav"
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
        if start is not None:
            cmd += ["-ss", str(start)]
        cmd += ["-i", str(input_path)]
        if end is not None:
            cmd += ["-t", str(end - (start or 0.0))]
        cmd += ["-vn", "-ac", "1", "-ar", str(SR), "-c:a", "pcm_f32le", str(tmp)]
        subprocess.run(cmd, check=True)
        y, _ = sf.read(str(tmp), dtype="float32")
    return y


def clean(y: np.ndarray) -> np.ndarray:
    y = y - float(np.mean(y))
    # 70 Hz high-pass (zero-phase, FFT domain)
    spec = np.fft.rfft(y.astype(np.float64))
    f = np.fft.rfftfreq(y.size, 1.0 / SR)
    spec *= 1.0 / np.sqrt(1.0 + (70.0 / np.maximum(f, 1e-3)) ** 8)
    y = np.fft.irfft(spec, n=y.size).astype(np.float32)
    _, (s, e) = librosa.effects.trim(y, top_db=40)
    y = y[max(0, s - int(0.08 * SR)) : min(y.size, e + int(0.12 * SR))]
    peak = float(np.max(np.abs(y)))
    if peak > 1e-5:
        y = y * (10 ** (-3 / 20) / peak)
    return y


def report(y: np.ndarray) -> None:
    dur = y.size / SR
    clipped = float(np.mean(np.abs(y) > 0.99)) * 100
    rms = librosa.feature.rms(y=y)[0]
    floor = 20 * np.log10(np.percentile(rms, 5) + 1e-9)
    speech = 20 * np.log10(np.percentile(rms, 95) + 1e-9)
    print(f"duration {dur:.2f}s | speech-to-floor {speech - floor:.1f} dB | clipped {clipped:.2f}%")
    if dur < 3:
        print("  ⚠ very short — aim for 5–12 s")
    if dur > 15:
        print("  ⚠ long — VoxCPM works best with 5–12 s; consider a tighter --start/--end")
    if speech - floor < 20:
        print("  ⚠ noisy/background music detected — clone will copy it; pick a cleaner line")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", required=True, type=Path)
    ap.add_argument("--start", type=float)
    ap.add_argument("--end", type=float)
    ap.add_argument("--id", required=True)
    ap.add_argument("--label", required=True)
    ap.add_argument("--text", required=True, help="Exact Khmer transcript of the clip ('' to skip)")
    ap.add_argument("--gender", default="male", choices=["male", "female"])
    ap.add_argument("--description", default="")
    args = ap.parse_args()

    y = clean(extract(args.input.expanduser(), args.start, args.end))
    report(y)

    out = VOICES_DIR / f"ref_{args.id}.wav"
    if out.exists():
        shutil.copy2(out, out.with_suffix(".wav.bak"))
    sf.write(str(out), y, SR, subtype="PCM_16")

    voices = json.loads(VOICES_JSON.read_text(encoding="utf-8"))
    shutil.copy2(VOICES_JSON, VOICES_JSON.with_suffix(".json.bak"))
    prev = voices.get(args.id, {})
    voices[args.id] = {
        "id": args.id,
        "speaker_id": prev.get("speaker_id", f"{args.id}_real"),
        "label": args.label,
        "gender": args.gender,
        "audio_path": f"dataset/voices/ref_{args.id}.wav",
        "ref_text": args.text.strip(),
        "description": args.description or prev.get("description", ""),
        "source": f"{args.input.name} [{args.start}-{args.end}s]",
    }
    VOICES_JSON.write_text(json.dumps(voices, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"saved {out.relative_to(ROOT)} and updated voices.json (backups: *.bak)")


if __name__ == "__main__":
    main()

