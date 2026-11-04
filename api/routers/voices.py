"""Voice Profiles and Model Metadata Router."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from inference.engines import AVAILABLE_MODELS, load_voice_profiles

router = APIRouter(prefix="/api", tags=["voices"])


@router.get("/models")
def list_models() -> dict[str, Any]:
    """List available TTS engine models and capabilities."""
    return {"models": AVAILABLE_MODELS}


@router.get("/voices")
def list_voices() -> dict[str, Any]:
    """List registered Cambodian speaker profiles."""
    return {"voices": load_voice_profiles()}

