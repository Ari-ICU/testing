"""Voice Clone LoRA Dataset and Fine-Tuning Router."""

from __future__ import annotations

import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from typing import Any
import uuid

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
import librosa
import soundfile as sf

from api.config import (
    CUSTOM_WAV_DIR,
    FINETUNE_LOG_PATH,
    LORA_OUTPUT_DIR,
    PROJECT_ROOT,
    REAL_KHMER_DIR,
    TRAIN_MANIFEST_PATH,
)
from api.dependencies import (
    get_finetune_proc,
    set_finetune_proc,
    unload_all_engines,
)
from api.schemas.finetune import (
    DatasetListResponse,
    DatasetSampleItem,
    FinetuneDatasetResetRequest,
    FinetuneStartRequest,
    FinetuneStatusResponse,
)
from inference.engines import load_voice_profiles
from preprocessing.khmer_normalizer import normalize_khmer_text

router = APIRouter(prefix="/api/finetune", tags=["finetune"])
_STEP_LOSS_RE = re.compile(r"\[Step\s+(\d+)/(\d+)\]\s+loss=([0-9.]+)")

EMOTION_META: dict[str, tuple[str, str]] = {
    "neutral": ("neutral", "💬 ធម្មតា (Natural)"),
    "comedy": ("comedy", "🎭 កំប្លែង (Comedy)"),
    "stern": ("stern", "⚖️ ម៉ឺងម៉ាត់ (Stern)"),
    "happy": ("happy", "😃 រីករាយ (Cheerful)"),
    "sad": ("sad", "😢 សោកសៅ (Sad)"),
    "angry": ("angry", "😡 ខឹង (Angry)"),
    "story": ("story", "📖 និទាន (Narrative)"),
    "whisper": ("whisper", "🤫 ខ្សឹប (Whisper)"),
    "news": ("news", "📰 ព័ត៌មាន (News)"),
    "casual": ("casual", "🎙️ សន្ទនា (Casual)"),
    "heritage": ("heritage", "🏛️ បុរាណ (Heritage)"),
    "reporter": ("reporter", "📡 រាយការណ៍ (Broadcaster)"),
    "friendly": ("friendly", "👩 រួសរាយ (Warm)"),
    "warm": ("warm", "👨 កក់ក្តៅ (Warm)"),
}

DEFAULT_SPEAKER_EMOTIONS: dict[str, str] = {
    "tinfy": "comedy",
    "pao_chin": "stern",
    "female_news": "news",
    "female_youth": "happy",
    "male_narrator": "story",
    "male_podcast": "casual",
    "male_heritage": "heritage",
    "male_reporter": "reporter",
    "female": "friendly",
    "male": "warm",
}


def _read_manifest_records() -> list[dict[str, Any]]:
    if not TRAIN_MANIFEST_PATH.exists():
        from dataset.build_custom_manifest import create_demo_manifests

        create_demo_manifests()
    records: list[dict[str, Any]] = []
    for line in TRAIN_MANIFEST_PATH.read_text(encoding="utf-8").splitlines():
        if line.strip():
            try:
                records.append(json.loads(line))
            except Exception:
                pass
    return records


def _write_manifest_records(records: list[dict[str, Any]]) -> None:
    TRAIN_MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    content = "\n".join(json.dumps(r, ensure_ascii=False) for r in records)
    TRAIN_MANIFEST_PATH.write_text((content + "\n") if content else "", encoding="utf-8")


@router.get("/dataset", response_model=DatasetListResponse)
def api_list_finetune_dataset() -> DatasetListResponse:
    """List all voice clips currently in the LoRA fine-tuning manifest."""
    records = _read_manifest_records()
    samples = []
    for idx, r in enumerate(records):
        spk = str(r.get("speaker", "custom"))
        raw_emo = str(r.get("emotion") or DEFAULT_SPEAKER_EMOTIONS.get(spk, "neutral"))
        emo_key, emo_label = EMOTION_META.get(raw_emo, ("neutral", "💬 ធម្មតា"))
        samples.append(
            DatasetSampleItem(
                index=idx,
                id=str(r.get("id", f"clip_{idx}")),
                speaker=spk,
                speaker_label=str(r.get("speaker_label", "🎙️ Custom Speaker")),
                emotion=emo_key,
                emotion_label=emo_label,
                text=str(r.get("text", "")),
                duration=float(r.get("duration", 0.0)),
                has_ref=bool(r.get("ref_audio")),
                audio_url=f"/api/finetune/dataset/audio/{idx}?t={idx}",
            )
        )
    return DatasetListResponse(samples=samples)


@router.post("/dataset/reset")
def api_reset_finetune_dataset(req: FinetuneDatasetResetRequest) -> dict[str, Any]:
    """Restore dataset clips from catalog, optionally filtered by speaker."""
    from dataset.build_custom_manifest import create_demo_manifests

    create_demo_manifests()
    records = _read_manifest_records()
    if req.speaker and req.speaker != "all":
        filtered = [r for r in records if r.get("speaker") == req.speaker]
        if filtered:
            _write_manifest_records(filtered)
            records = filtered
    return {"status": "reset", "total": len(records)}


@router.get("/dataset/audio/{index}")
def api_stream_finetune_audio(index: int) -> FileResponse:
    """Stream audio for a specific dataset clip by index."""
    records = _read_manifest_records()
    if not (0 <= index < len(records)):
        raise HTTPException(status_code=404, detail="Clip index out of range")
    audio_path_str = str(records[index].get("audio", ""))
    p = Path(audio_path_str)
    if not p.is_absolute():
        p = PROJECT_ROOT / p
    if not p.exists():
        raise HTTPException(status_code=404, detail="Audio file not found on disk")
    return FileResponse(str(p), media_type="audio/wav")


@router.post("/dataset/add")
async def api_add_finetune_clip(
    text: str = Form(..., description="Exact Khmer transcript spoken in audio"),
    preset_ref_voice: str = Form("female", description="Voice anchor to pair clip with"),
    emotion: str = Form("neutral", description="Emotion/speaking style"),
    audio: UploadFile = File(..., description="Spoken voice clip WAV/MP3"),
    ref_audio: UploadFile | None = File(None, description="Optional custom reference anchor"),
) -> dict[str, Any]:
    """Add a new voice clip and transcript to the training dataset."""
    if not text.strip():
        raise HTTPException(status_code=400, detail="Transcript cannot be empty.")

    clip_id = f"custom_{uuid.uuid4().hex[:8]}"
    target_sr = 16000

    suffix = Path(audio.filename or "a.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_a:
        tmp_a.write(await audio.read())
        tmp_a_path = tmp_a.name

    try:
        wav, _ = librosa.load(tmp_a_path, sr=target_sr, mono=True)
    finally:
        Path(tmp_a_path).unlink(missing_ok=True)

    dst_wav = CUSTOM_WAV_DIR / f"{clip_id}_16k.wav"
    sf.write(str(dst_wav), wav, target_sr)
    duration = round(len(wav) / float(target_sr), 3)

    voices = load_voice_profiles()
    speaker_label = "🎙️ Custom Speaker"
    ref_dst_str: str | None = None

    if ref_audio is not None and ref_audio.filename:
        ref_suffix = Path(ref_audio.filename).suffix or ".wav"
        with tempfile.NamedTemporaryFile(delete=False, suffix=ref_suffix) as tmp_r:
            tmp_r.write(await ref_audio.read())
            tmp_r_path = tmp_r.name
        try:
            ref_wav, _ = librosa.load(tmp_r_path, sr=target_sr, mono=True)
        finally:
            Path(tmp_r_path).unlink(missing_ok=True)
        ref_dst = CUSTOM_WAV_DIR / f"{clip_id}_ref_16k.wav"
        sf.write(str(ref_dst), ref_wav, target_sr)
        ref_dst_str = str(ref_dst.resolve())
    elif preset_ref_voice in voices:
        prof = voices[preset_ref_voice]
        speaker_label = str(prof.get("label", preset_ref_voice))
        anchor_16k = REAL_KHMER_DIR / f"ref_anchor_{preset_ref_voice}_16k.wav"
        if anchor_16k.exists():
            ref_dst_str = str(anchor_16k.resolve())
        elif Path(prof["abs_audio_path"]).exists():
            ref_wav, _ = librosa.load(str(prof["abs_audio_path"]), sr=target_sr, mono=True)
            anchor_16k.parent.mkdir(parents=True, exist_ok=True)
            sf.write(str(anchor_16k), ref_wav, target_sr)
            ref_dst_str = str(anchor_16k.resolve())

    norm_t = normalize_khmer_text(text.strip(), transliterate_english=True)
    rec: dict[str, Any] = {
        "id": clip_id,
        "speaker": preset_ref_voice if preset_ref_voice in voices else "custom",
        "speaker_label": speaker_label,
        "emotion": emotion.strip() or "neutral",
        "audio": str(dst_wav.resolve()),
        "text": norm_t,
        "duration": duration,
        "dataset_id": 0,
    }
    if ref_dst_str:
        rec["ref_audio"] = ref_dst_str

    records = _read_manifest_records()
    records.append(rec)
    _write_manifest_records(records)
    return {"status": "added", "clip": rec, "total": len(records)}


@router.delete("/dataset/{index}")
def api_delete_finetune_clip(index: int) -> dict[str, Any]:
    """Delete a clip from the training dataset by index."""
    records = _read_manifest_records()
    if 0 <= index < len(records):
        records.pop(index)
        _write_manifest_records(records)
    return {"status": "deleted", "total": len(records)}


@router.post("/start")
def api_start_finetune(req: FinetuneStartRequest) -> dict[str, Any]:
    """Launch the VoxCPM 2 LoRA fine-tuning subprocess."""
    proc = get_finetune_proc()
    if proc is not None and proc.poll() is None:
        raise HTTPException(status_code=400, detail="Fine-tuning is already running.")

    # Free inference models from MPS unified memory before training
    unload_all_engines()

    LORA_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    save_every = max(1, min(5, req.max_steps // 2))
    cmd = [
        sys.executable,
        str(PROJECT_ROOT / "training" / "finetune_voxcpm2_khmer.py"),
        "--train-manifest",
        str(TRAIN_MANIFEST_PATH),
        "--output-dir",
        str(LORA_OUTPUT_DIR),
        "--max-steps",
        str(req.max_steps),
        "--save-every",
        str(save_every),
        "--lora-r",
        str(req.lora_r),
        "--lr",
        str(req.lr),
    ]
    if req.enable_proj:
        cmd.append("--enable-proj")
    if req.emotional_tuning:
        cmd.append("--emotional-tuning")
    log_f = open(FINETUNE_LOG_PATH, "w", encoding="utf-8")
    import os
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    new_proc = subprocess.Popen(
        cmd,
        cwd=str(PROJECT_ROOT),
        stdout=log_f,
        stderr=subprocess.STDOUT,
        text=True,
        env=env,
    )
    set_finetune_proc(new_proc)
    return {"status": "started", "pid": new_proc.pid}


@router.post("/stop")
def api_stop_finetune() -> dict[str, str]:
    """Terminate the active fine-tuning subprocess."""
    proc = get_finetune_proc()
    if proc is not None and proc.poll() is None:
        proc.terminate()
        set_finetune_proc(None)
    return {"status": "stopped"}


@router.get("/status", response_model=FinetuneStatusResponse)
def api_finetune_status() -> FinetuneStatusResponse:
    """Return fine-tuning state, console logs, and parsed loss curve."""
    proc = get_finetune_proc()
    running = proc is not None and proc.poll() is None
    lora_ready = (LORA_OUTPUT_DIR / "lora_weights.safetensors").exists()
    log_text = ""

    if FINETUNE_LOG_PATH.exists():
        log_text = FINETUNE_LOG_PATH.read_text(encoding="utf-8", errors="replace")[-6000:]
    elif (LORA_OUTPUT_DIR / "training.log").exists():
        log_text = (LORA_OUTPUT_DIR / "training.log").read_text(encoding="utf-8", errors="replace")[-6000:]

    loss_history: list[dict[str, Any]] = []
    for m in _STEP_LOSS_RE.finditer(log_text):
        loss_history.append(
            {
                "step": int(m.group(1)),
                "max_steps": int(m.group(2)),
                "loss": float(m.group(3)),
            }
        )

    return FinetuneStatusResponse(
        running=running,
        lora_ready=lora_ready,
        log=log_text,
        loss_history=loss_history,
    )

