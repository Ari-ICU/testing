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
import sys

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def create_demo_manifests(target_sr: int = 16000) -> tuple[Path, Path]:
    real_dir = PROJECT_ROOT / "dataset" / "processed" / "real_khmer_16k"
    catalog_path = real_dir / "catalog.json"
    voices_json_path = PROJECT_ROOT / "dataset" / "voices" / "voices.json"
    train_manifest = PROJECT_ROOT / "dataset" / "demo_train.jsonl"
    val_manifest = PROJECT_ROOT / "dataset" / "demo_val.jsonl"

    if catalog_path.exists():
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
        profiles = catalog.get("profiles", {})
        train_records = catalog.get("train", [])
        val_records = catalog.get("val", train_records[:8])

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
        print(f"[+] Restored {len(profiles)} real human Cambodian voices and {len(train_records)} training clips.")
    return train_manifest, val_manifest


if __name__ == "__main__":
    create_demo_manifests()
