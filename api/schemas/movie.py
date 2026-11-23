"""Pydantic Request & Response Schemas for Movie & Dialogue Dubbing."""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class MovieDialogueLine(BaseModel):
    character: str = Field(..., description="Character name (e.g. 'ទិនហ្វី', 'ប៉ាវចិន', 'អ្នកនិទាន')")
    voice: str = Field(default="tinfy", description="Voice profile ID (tinfy, pao_chin, male_narrator, female, male, female_youth, etc.)")
    text: str = Field(..., description="Khmer dialogue spoken by this character")
    emotion: str = Field(default="neutral", description="Emotion/speaking style (comedy, stern, cinematic, action, sad, romantic, suspense, neutral)")
    speed: float = Field(default=1.0, ge=0.7, le=1.3, description="Speech rate multiplier")
    pause_after_sec: float = Field(default=0.4, ge=0.0, le=3.0, description="Cinematic pause before next character line")


class MovieDubRequest(BaseModel):
    title: str = Field(default="Khmer Movie Scene", description="Scene or film title")
    lines: list[MovieDialogueLine] = Field(default_factory=list, description="Ordered dialogue lines")
    script_text: Optional[str] = Field(default=None, description="Optional raw script text to parse and dub directly")
    model_id: str = Field(default="voxcpm2_khmer", description="TTS model engine to use")
    use_lora: bool = Field(default=True, description="Enable custom fine-tuned speaker LoRA")


class MovieDialogueResultItem(BaseModel):
    line_index: int
    character: str
    voice: str
    emotion: str
    text: str
    start_time: float
    end_time: float
    duration: float
    audio_url: str


class MovieDubResponse(BaseModel):
    title: str
    full_audio_url: str
    total_duration_sec: float
    srt_subtitles: str
    lines: list[MovieDialogueResultItem]


class ScriptParseRequest(BaseModel):
    script_text: str = Field(..., description="Raw script with lines like '[ទិនហ្វី (comedy)]: ឥឡូវឆាប់ដោះលែងគេទៅ!'")


class ScriptParseResponse(BaseModel):
    lines: list[MovieDialogueLine]


class MoviePresetItem(BaseModel):
    id: str
    title: str
    genre: str
    description: str
    script_text: str


class MoviePresetsResponse(BaseModel):
    presets: list[MoviePresetItem]
