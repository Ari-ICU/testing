"""Speech Synthesis and Voice Cloning Router."""

from __future__ import annotations

import asyncio
from pathlib import Path
import tempfile
from typing import Any
import uuid

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
import soundfile as sf

from api.config import GENERATED_DIR
from api.dependencies import get_cached_engine, get_engine_lock
from api.schemas.synthesis import (
    NormalizeRequest,
    NormalizeResponse,
    SynthesisResponse,
    SynthesizeRequest,
)
from inference.engines import (
    GenerationCancelledError,
    clear_cancel,
    get_generation_progress,
    load_voice_profiles,
    request_cancel,
)
from preprocessing.khmer_normalizer import chunk_khmer_text, normalize_khmer_text

router = APIRouter(prefix="/api", tags=["synthesis"])


@router.post("/normalize", response_model=NormalizeResponse)
def api_normalize(req: NormalizeRequest) -> NormalizeResponse:
    """Preview phonetic normalization and prosody chunks for Khmer text."""
    normalized = normalize_khmer_text(
        req.text, transliterate_english=req.transliterate_english
    )
    chunks = chunk_khmer_text(
        req.text, transliterate_english=req.transliterate_english
    )
    return NormalizeResponse(
        raw_text=req.text,
        normalized_text=normalized,
        chunks=chunks,
    )


@router.get("/progress")
def api_progress() -> dict[str, Any]:
    """Poll live chunk-by-chunk and latent token progress."""
    return get_generation_progress()


@router.post("/cancel")
def api_cancel() -> dict[str, str]:
    """Abort an active speech generation job immediately."""
    request_cancel()
    return {"status": "cancelled"}


@router.post("/warmup")
async def api_warmup(model_id: str = "voxcpm2_khmer") -> dict[str, Any]:
    """Pre-warm and cache model in M2 Pro memory to eliminate cold-start latency."""
    def _warmup_sync():
        with get_engine_lock():
            engine = get_cached_engine(model_id)
            if hasattr(engine, "load"):
                engine.load()
            return {"status": "ready", "model_id": model_id}

    return await asyncio.to_thread(_warmup_sync)


@router.post("/synthesize", response_model=SynthesisResponse)
async def api_synthesize(req: SynthesizeRequest) -> SynthesisResponse:
    """Synthesize speech using selected model and speaker preset."""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
    clear_cancel()

    def _run_sync_synth():
        with get_engine_lock():
            engine = get_cached_engine(req.model_id)
            return engine.synthesize(
                text=req.text,
                voice=req.voice,
                normalize=req.normalize,
                cfg_value=req.cfg_value,
                inference_timesteps=req.inference_timesteps,
                speed=req.speed,
                use_lora=req.use_lora,
                emotion=getattr(req, "emotion", "neutral"),
            )

    try:
        res = await asyncio.to_thread(_run_sync_synth)
    except GenerationCancelledError as exc:
        raise HTTPException(status_code=499, detail="Generation cancelled by user.") from exc
    except Exception as exc:
        err_msg = str(exc)
        if "ZeroGPU" in err_msg or "quota" in err_msg.lower():
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Hugging Face ZeroGPU unauthenticated quota reached for '{req.model_id}'. "
                    "Switch to a local model ('voxcpm2_khmer' or 'mms') in the dropdown."
                ),
            ) from exc
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {err_msg}") from exc

    file_id = f"{req.model_id}_{req.voice}_{uuid.uuid4().hex[:8]}.wav"
    out_path = GENERATED_DIR / file_id
    sf.write(str(out_path), res.audio, res.sample_rate)

    return SynthesisResponse(
        audio_url=f"/audio/api_generated/{file_id}",
        model_id=res.model_id,
        model_name=res.model_name,
        voice_id=res.voice_id,
        raw_text=res.raw_text,
        normalized_text=res.normalized_text,
        sample_rate=res.sample_rate,
        duration_sec=round(res.duration_sec, 2),
        latency_sec=round(res.latency_sec, 2),
        rtf=round(res.rtf, 2),
    )


@router.post("/clone", response_model=SynthesisResponse)
async def api_clone_voice(
    text: str = Form(..., description="Khmer text to speak"),
    model_id: str = Form("voxcpm2_khmer", description="Model ID"),
    preset_voice: str = Form("female", description="Preset voice ID or 'custom'"),
    ref_text: str = Form("", description="Optional reference transcript for ultimate prosody cloning"),
    cfg_value: float = Form(2.0, description="CFG scale (1.2–3.0)"),
    inference_timesteps: int = Form(16, description="Diffusion steps (6–24)"),
    speed: float = Form(1.0, description="Speech speed multiplier (0.8–1.25x)"),
    use_lora: bool = Form(False, description="Enable custom LoRA weights"),
    ultimate_clone: bool | None = Form(
        None,
        description="Ultimate prosody clone mode. Defaults to on for preset voices (uses their transcript).",
    ),
    emotion: str = Form("neutral", description="Emotional tone / speaking style"),
    ref_audio: UploadFile | None = File(None, description="Custom reference audio clip"),
) -> SynthesisResponse:
    """Zero-shot and Ultimate Voice Cloning endpoint."""
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
    clear_cancel()
    voices = load_voice_profiles()
    tmp_path: str | None = None

    try:
        if preset_voice in voices and (ref_audio is None or not ref_audio.filename):
            profile = voices[preset_voice]
            resolved_audio = profile["abs_audio_path"]
            resolved_text = ref_text.strip() or profile.get("ref_text")
            voice_label = f"preset_{preset_voice}"
            # Preset voices ship with a verified transcript, so use ultimate
            # (prompt-continuation) cloning by default — reference-only mode
            # loses a lot of pitch/timbre likeness. Callers can opt out by
            # sending ultimate_clone=false explicitly.
            use_ultimate = bool(resolved_text) and ultimate_clone is not False
        else:
            if ref_audio is None or not ref_audio.filename:
                raise HTTPException(
                    status_code=400,
                    detail="Please select a preset sample voice, upload a WAV/MP3, or record from the microphone.",
                )
            suffix = Path(ref_audio.filename or "ref.wav").suffix or ".wav"
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                content = await ref_audio.read()
                tmp.write(content)
                tmp_path = tmp.name
            resolved_audio = tmp_path
            resolved_text = ref_text.strip() or None
            use_ultimate = bool(resolved_text) and (ultimate_clone is not False)
            voice_label = "custom_ultimate" if use_ultimate else "custom_direct"

        def _run_sync_clone():
            with get_engine_lock():
                eng = get_cached_engine(model_id)
                return eng.synthesize(
                    text=text,
                    voice=preset_voice if preset_voice in voices else "custom",
                    ref_audio_path=resolved_audio,
                    ref_text=resolved_text,
                    cfg_value=cfg_value,
                    inference_timesteps=inference_timesteps,
                    speed=speed,
                    use_lora=use_lora,
                    ultimate_clone=use_ultimate,
                    emotion=emotion,
                )

        res = await asyncio.to_thread(_run_sync_clone)
    except GenerationCancelledError as exc:
        raise HTTPException(status_code=499, detail="Generation cancelled by user.") from exc
    finally:
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)

    file_id = f"{model_id}_{voice_label}_{uuid.uuid4().hex[:8]}.wav"
    out_path = GENERATED_DIR / file_id
    sf.write(str(out_path), res.audio, res.sample_rate)

    return SynthesisResponse(
        audio_url=f"/audio/api_generated/{file_id}",
        model_id=res.model_id,
        model_name=res.model_name,
        voice_id=voice_label,
        normalized_text=res.normalized_text,
        sample_rate=res.sample_rate,
        duration_sec=round(res.duration_sec, 2),
        latency_sec=round(res.latency_sec, 2),
        rtf=round(res.rtf, 2),
    )

