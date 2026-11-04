"""CLI tool to synthesize Khmer speech with any supported model and reference voice.

Examples:
  # Fast baseline (Meta MMS Khmer)
  python -m inference.generate --model mms --text "សួស្តីកម្ពុជា! ថ្ងៃនេះជាថ្ងៃទី ២/១១/២០២៦។"

  # Khmer F5-TTS (with female or male voice)
  python -m inference.generate --model f5_khmer --voice female --text "សូមស្វាគមន៍មកកាន់ប្រព័ន្ធសំឡេងឆ្លាតវៃ។"

  # VoxCPM 2 Khmer with zero-shot voice cloning (using preset or custom WAV)
  python -m inference.generate --model voxcpm2_khmer --voice male --text "តម្លៃទំនិញនេះគឺ ៥០០០៛។"
"""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

import soundfile as sf

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from inference.engines import AVAILABLE_MODELS, get_engine


def main() -> None:
    parser = argparse.ArgumentParser(description="KhmerVoice AI — Khmer TTS CLI")
    parser.add_argument(
        "--model",
        choices=list(AVAILABLE_MODELS.keys()),
        default="mms",
        help="TTS model engine to run.",
    )
    parser.add_argument(
        "--text",
        type=str,
        required=True,
        help="Khmer text to synthesize.",
    )
    parser.add_argument(
        "--voice",
        type=str,
        default="female",
        help="Preset voice ID ('female' or 'male').",
    )
    parser.add_argument(
        "--ref-audio",
        type=str,
        default=None,
        help="Optional path to a custom reference WAV file for zero-shot voice cloning.",
    )
    parser.add_argument(
        "--ref-text",
        type=str,
        default=None,
        help="Optional transcript of the custom reference WAV file.",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="output_khmer.wav",
        help="Output WAV file path.",
    )
    parser.add_argument(
        "--no-normalize",
        action="store_true",
        help="Disable automatic Khmer text normalization.",
    )
    args = parser.parse_args()

    print(f"[*] Loading model '{args.model}' ({AVAILABLE_MODELS[args.model]['name']})...")
    engine = get_engine(args.model)
    result = engine.synthesize(
        text=args.text,
        voice=args.voice,
        ref_audio_path=args.ref_audio,
        ref_text=args.ref_text,
        normalize=not args.no_normalize,
    )

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(out_path), result.audio, result.sample_rate)

    print(f"[+] Raw Text       : {result.raw_text}")
    print(f"[+] Normalized Text: {result.normalized_text}")
    print(f"[+] Voice          : {result.voice_id}")
    print(f"[+] Sample Rate    : {result.sample_rate} Hz")
    print(f"[+] Audio Duration : {result.duration_sec:.2f}s")
    print(f"[+] Latency        : {result.latency_sec:.2f}s (RTF: {result.rtf:.2f}x)")
    print(f"[+] Saved audio to : {out_path.resolve()}")


if __name__ == "__main__":
    main()

