"""Schemas for Khmer Text Normalization & Speech Synthesis."""

from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field

EMOTION_PRESETS: dict[str, str] = {
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


class NormalizeRequest(BaseModel):
    text: str = Field(..., description="Khmer input text to normalize and chunk")
    transliterate_english: bool = Field(
        default=True, description="Transliterate English loanwords into Khmer phonetics"
    )


class NormalizeResponse(BaseModel):
    raw_text: str
    normalized_text: str
    chunks: list[str]


class SynthesizeRequest(BaseModel):
    text: str = Field(..., description="Khmer text to synthesize")
    model_id: str = Field(default="voxcpm2_khmer", description="TTS engine model ID")
    voice: str = Field(default="female", description="Voice profile ID")
    emotion: str = Field(
        default="neutral",
        description="Emotion/speaking style ('neutral', 'happy', 'sad', 'angry', 'excited', 'whisper', 'news', 'storytelling', 'comedy', 'stern')",
    )
    custom_style_prompt: Optional[str] = Field(
        default=None,
        description="Custom style override, e.g. 'cheerful, energetic tone' or 'gentle elderly man'",
    )
    normalize: bool = Field(default=True, description="Apply phonetic normalization & chunking")
    cfg_value: float = Field(default=2.0, description="Classifier-Free Guidance scale (1.2–3.5)")
    inference_timesteps: int = Field(default=16, description="Flow-matching diffusion steps (6–30)")
    speed: float = Field(default=1.0, description="Speech rate multiplier (0.8–1.25x)")
    use_lora: bool = Field(default=False, description="Enable custom fine-tuned LoRA weights")
    use_hifi_clone: bool = Field(
        default=False,
        description="Set False when using emotion control so style instructions are obeyed",
    )


class SynthesisResponse(BaseModel):
    audio_url: str
    model_id: str
    model_name: str
    voice_id: str
    raw_text: str | None = None
    normalized_text: str
    sample_rate: int
    duration_sec: float
    latency_sec: float
    rtf: float

