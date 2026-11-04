"""Shared Engine Caching, Locks, and Subprocess Handles."""

from __future__ import annotations

import subprocess
import threading
from typing import Any

from fastapi import HTTPException

from inference.engines import AVAILABLE_MODELS, get_engine, release_memory

_ACTIVE_ENGINES: dict[str, Any] = {}
_ENGINE_LOCK = threading.Lock()
_FINETUNE_PROC: subprocess.Popen[str] | None = None


def get_engine_lock() -> threading.Lock:
    """Return the global threading lock for thread-safe model synthesis."""
    return _ENGINE_LOCK


def unload_all_engines() -> None:
    """Unload all active TTS engines and release MPS unified memory."""
    with _ENGINE_LOCK:
        for k, eng in list(_ACTIVE_ENGINES.items()):
            if hasattr(eng, "unload"):
                eng.unload()
            _ACTIVE_ENGINES.pop(k, None)
        release_memory()


def get_cached_engine(model_id: str) -> Any:
    """Retrieve or lazily instantiate an engine by model_id."""
    if model_id not in AVAILABLE_MODELS:
        raise HTTPException(status_code=400, detail=f"Unknown model_id '{model_id}'")

    for k, eng in list(_ACTIVE_ENGINES.items()):
        if k != model_id and hasattr(eng, "unload"):
            eng.unload()
            _ACTIVE_ENGINES.pop(k, None)

    if model_id not in _ACTIVE_ENGINES:
        _ACTIVE_ENGINES[model_id] = get_engine(model_id)

    return _ACTIVE_ENGINES[model_id]


def get_finetune_proc() -> subprocess.Popen[str] | None:
    """Return the active fine-tuning subprocess handle if running."""
    return _FINETUNE_PROC


def set_finetune_proc(proc: subprocess.Popen[str] | None) -> None:
    """Set or clear the active fine-tuning subprocess handle."""
    global _FINETUNE_PROC
    _FINETUNE_PROC = proc

