"""Stage 2 — OpenSLR 42 Khmer Speech Dataset Preparation Script.

Downloads (or reads a local archive of) OpenSLR 42 (`km_kh_male.zip`, CC BY-SA 4.0),
applies KhmerVoice AI text normalization (`normalize_khmer_text`), verifies audio
files, and exports `dataset/train.jsonl` and `dataset/validation.jsonl` ready for
F5-TTS or VoxCPM 2 fine-tuning.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import random
import sys
import urllib.request
import zipfile

import soundfile as sf

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from preprocessing.khmer_normalizer import normalize_khmer_text

OPENSLR42_URL = "https://www.openslr.org/resources/42/km_kh_male.zip"


def download_openslr42(raw_dir: Path) -> Path:
    raw_dir.mkdir(parents=True, exist_ok=True)
    zip_path = raw_dir / "km_kh_male.zip"
    if zip_path.exists():
        print(f"[*] Using existing archive: {zip_path}")
        return zip_path
    print(f"[*] Downloading OpenSLR 42 from {OPENSLR42_URL} ...")
    urllib.request.urlretrieve(OPENSLR42_URL, str(zip_path))
    print(f"[+] Downloaded to {zip_path}")
    return zip_path


def prepare_dataset(
    raw_dir: Path,
    output_dir: Path,
    val_ratio: float = 0.05,
    max_samples: int | None = None,
) -> tuple[Path, Path]:
    zip_path = raw_dir / "km_kh_male.zip"
    extract_dir = raw_dir / "km_kh_male"
    if not extract_dir.exists():
        if not zip_path.exists():
            download_openslr42(raw_dir)
        print(f"[*] Extracting {zip_path} ...")
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(raw_dir)

    tsv_candidates = list(raw_dir.rglob("line_index.tsv"))
    if not tsv_candidates:
        raise FileNotFoundError(f"Could not find line_index.tsv under {raw_dir}")
    tsv_path = tsv_candidates[0]
    wav_dir = tsv_path.parent / "wavs"

    records: list[dict[str, object]] = []
    lines = tsv_path.read_text(encoding="utf-8").splitlines()
    for idx, line in enumerate(lines):
        if max_samples and len(records) >= max_samples:
            break
        parts = line.strip().split("\t")
        if len(parts) < 2:
            continue
        utt_id = parts[0].strip()
        raw_text = parts[-1].strip()
        wav_path = wav_dir / f"{utt_id}.wav"
        if not wav_path.exists():
            continue
        try:
            info = sf.info(str(wav_path))
        except Exception:
            continue
        if info.duration < 0.5 or info.duration > 25.0:
            continue

        norm_text = normalize_khmer_text(raw_text, transliterate_english=True)
        abs_wav = str(wav_path.resolve())
        # Tag OpenSLR-42 rows explicitly as neutral calm reading so training on it
        # does not overwrite expressive emotional manifolds in VoxCPM2
        conditioned_text = f"(neutral, calm reading pace) {norm_text}"
        records.append(
            {
                "id": utt_id,
                "audio": abs_wav,
                "audio_filepath": abs_wav,
                "raw_text": raw_text,
                "text": conditioned_text,
                "duration": round(info.duration, 3),
                "sample_rate": info.samplerate,
                "speaker": "openslr42_male",
                "emotion": "neutral",
            }
        )

    # Mix reference audio for ~40% of records from a different utterance of the same speaker
    all_wavs = [r["audio"] for r in records]
    rnd = random.Random(42)
    for idx, r in enumerate(records):
        if rnd.random() < 0.40 and len(all_wavs) > 1:
            other_wav = rnd.choice(all_wavs)
            if other_wav != r["audio"]:
                r["ref_audio"] = other_wav

    random.Random(42).shuffle(records)
    val_count = max(1, int(len(records) * val_ratio)) if records else 0
    val_records = records[:val_count]
    train_records = records[val_count:]

    output_dir.mkdir(parents=True, exist_ok=True)
    train_jsonl = output_dir / "train.jsonl"
    val_jsonl = output_dir / "validation.jsonl"

    train_jsonl.write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in train_records) + "\n",
        encoding="utf-8",
    )
    val_jsonl.write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in val_records) + "\n",
        encoding="utf-8",
    )
    print(f"[+] Wrote {len(train_records)} training samples to {train_jsonl}")
    print(f"[+] Wrote {len(val_records)} validation samples to {val_jsonl}")
    return train_jsonl, val_jsonl


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare OpenSLR 42 Khmer TTS dataset")
    parser.add_argument(
        "--raw-dir",
        type=Path,
        default=PROJECT_ROOT / "dataset" / "raw",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=PROJECT_ROOT / "dataset",
    )
    parser.add_argument(
        "--max-samples",
        type=int,
        default=None,
        help="Optional cap on number of utterances to process.",
    )
    args = parser.parse_args()
    prepare_dataset(args.raw_dir, args.output_dir, max_samples=args.max_samples)


if __name__ == "__main__":
    main()

