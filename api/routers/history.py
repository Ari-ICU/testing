"""Audio Generation History Router."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter

from api.config import GENERATED_DIR

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("")
def api_list_history() -> dict[str, Any]:
    """List recently generated WAV files."""
    files = sorted(
        GENERATED_DIR.glob("*.wav"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    items: list[dict[str, Any]] = []
    for f in files[:40]:
        st = f.stat()
        url = f"/audio/api_generated/{f.name}"
        items.append(
            {
                "filename": f.name,
                "url": url,
                "audio_url": url,
                "size_kb": round(st.st_size / 1024.0, 1),
                "created_at": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
            }
        )
    return {"items": items, "files": items}


@router.delete("/{filename}")
def api_delete_history(filename: str) -> dict[str, str]:
    """Delete a generated audio file by filename."""
    safe_name = Path(filename).name
    target = GENERATED_DIR / safe_name
    if target.exists() and target.suffix == ".wav":
        target.unlink(missing_ok=True)
    return {"status": "deleted"}

