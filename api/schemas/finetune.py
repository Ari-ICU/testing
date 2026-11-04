"""Schemas for LoRA Dataset Management & Training."""

from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


class FinetuneStartRequest(BaseModel):
    max_steps: int = Field(default=30, ge=2, le=2000, description="Total training steps")
    lora_r: int = Field(default=16, description="LoRA rank dimension (8, 16, or 32)")
    lr: float = Field(default=1e-4, description="Peak learning rate for AdamW")
    emotional_tuning: bool = Field(
        default=True,
        description="Enable emotional conditioning and expressive prosody modeling",
    )
    enable_proj: bool = Field(
        default=True,
        description="Adapt linear projection layers for richer timbre and emotional dynamics",
    )


class FinetuneDatasetResetRequest(BaseModel):
    speaker: str = Field(
        default="all",
        description="Filter by speaker id ('all', 'tinfy', 'pao_chin', 'female', etc.)",
    )
    apply_emotion_tags: bool = Field(
        default=True,
        description="Auto-tag authentic Cambodian voices with their expressive emotion labels",
    )


class DatasetSampleItem(BaseModel):
    index: int
    id: str
    speaker: str
    speaker_label: str
    emotion: str = "neutral"
    emotion_label: str = "💬 ធម្មតា"
    text: str
    duration: float
    has_ref: bool
    audio_url: str


class DatasetListResponse(BaseModel):
    samples: list[DatasetSampleItem]


class FinetuneStatusResponse(BaseModel):
    running: bool
    lora_ready: bool
    log: str
    loss_history: list[dict[str, Any]]

