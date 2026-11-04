"""Schemas for Khmer Text Normalization & Speech Synthesis."""

from __future__ import annotations

from pydantic import BaseModel, Field


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
        description="Emotion/speaking style ('neutral', 'stern', 'comedy', 'happy', 'sad', 'angry', 'story', 'whisper')",
    )
    normalize: bool = Field(default=True, description="Apply phonetic normalization & chunking")
    cfg_value: float = Field(default=2.0, description="Classifier-Free Guidance scale (1.2–3.0)")
    inference_timesteps: int = Field(default=16, description="Flow-matching diffusion steps (6–24)")
    speed: float = Field(default=1.0, description="Speech rate multiplier (0.8–1.25x)")
    use_lora: bool = Field(default=False, description="Enable custom fine-tuned LoRA weights")


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

