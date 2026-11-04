"""Real Multi-Speaker Cambodian Khmer Voice & Fine-Tuning Manifest Manager.

Loads the 8 real human Cambodian speakers (`f-adt1-0002`, `m-adt1-0002`,
`f-adt2-0002`, `m-adt1-0001`, `f-adt1-0001`, `m-adt2-0002`, `m-adt2-0001`,
and `grkpp_news`) and 24 real human training utterances downloaded from
`Digital-Divide-Data/khmer-speech-dataset` and `seanghay/khmer_grkpp_speech`
into `dataset/voices/voices.json`, `dataset/demo_train.jsonl`, and `dataset/demo_val.jsonl`.

Every training clip is a genuine human recording paired with a different utterance
from the exact same human speaker (`ref_audio`) so VoxCPM 2 learns authentic
zero-shot speaker timbre adaptation without synthetic pitch shifting.
"""

from __future__ import annotations

import json
from pathlib import Path
import random
import sys

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

SPEAKER_STYLE_TAGS: dict[str, str] = {
    "female": "warm, friendly, approachable and natural tone",
    "male": "warm, calm, pleasant tone, gentle pace",
    "female_news": "authoritative news anchor, professional, articulate, steady broadcast pace",
    "male_narrator": "expressive narrator, dramatic pauses, engaging and deep warm tone",
    "female_youth": "cheerful, happy, bright and energetic tone, warm smile in voice",
    "male_podcast": "conversational, relaxed, friendly and natural pace",
    "male_heritage": "historical, traditional recitation, slow and dignified",
    "male_reporter": "field reporter, lively, broadcast style",
    "tinfy": "humorous, playful, smiling, comedy tone",
    "pao_chin": "firm, serious, authoritative, commanding voice",
}


def create_demo_manifests(target_sr: int = 16000) -> tuple[Path, Path]:
    real_dir = PROJECT_ROOT / "dataset" / "processed" / "real_khmer_16k"
    catalog_path = real_dir / "catalog.json"
    voices_json_path = PROJECT_ROOT / "dataset" / "voices" / "voices.json"
    train_manifest = PROJECT_ROOT / "dataset" / "demo_train.jsonl"
    val_manifest = PROJECT_ROOT / "dataset" / "demo_val.jsonl"

    if catalog_path.exists():
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
        profiles = catalog.get("profiles", {})
        raw_train = catalog.get("train", [])
        raw_val = catalog.get("val", raw_train[:8])

        def _condition_record(rec: dict, idx: int, condition_ratio: float = 0.75) -> dict:
            r = dict(rec)
            spk = r.get("speaker", "")
            style_tag = SPEAKER_STYLE_TAGS.get(spk)
            # Prefix 75% of rows with VoxCPM2 natural language control tags;
            # leave 25% unconditioned for base zero-shot cloning capability
            if style_tag and (idx % 4 != 0):
                orig_text = r.get("text", "")
                if not orig_text.startswith("("):
                    r["text"] = f"({style_tag}) {orig_text}"
            return r

        train_records = [_condition_record(r, i) for i, r in enumerate(raw_train)]
        val_records = [_condition_record(r, i) for i, r in enumerate(raw_val)]

        if profiles:
            voices_json_path.write_text(
                json.dumps(profiles, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
        if train_records:
            train_manifest.write_text(
                "\n".join(json.dumps(r, ensure_ascii=False) for r in train_records) + "\n",
                encoding="utf-8",
            )
        if val_records:
            val_manifest.write_text(
                "\n".join(json.dumps(r, ensure_ascii=False) for r in val_records) + "\n",
                encoding="utf-8",
            )
        print(f"[+] Restored {len(profiles)} real human Cambodian voices and {len(train_records)} training clips with VoxCPM2 style instruction tags.")
    return train_manifest, val_manifest


if __name__ == "__main__":
    create_demo_manifests()
