"""Movie & Video Dialogue Dubbing API Router.

Features:
- Multi-character Cambodian movie dialogue synthesis
- SRT subtitle parsing and timecode alignment
- Video multiplexing with ffmpeg (merging dubbed Khmer voice into video)
- Background audio preservation (e.g. 15% original SFX/BGM)
- SRT subtitle export synchronized to video timeline
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import uuid
from typing import Any, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
import numpy as np
import soundfile as sf

from api.config import GENERATED_DIR, PROJECT_ROOT
from api.dependencies import get_cached_engine, get_engine_lock
from api.schemas.movie import (
    MovieDialogueLine,
    MovieDialogueResultItem,
    MovieDubRequest,
    MovieDubResponse,
    ScriptParseRequest,
    ScriptParseResponse,
    SrtParseRequest,
    SrtParseResponse,
    SubtitledLine,
    VideoDubResponse,
)
from inference.engines import GenerationCancelledError, clear_cancel, is_cancelled, load_voice_profiles
from preprocessing.khmer_normalizer import normalize_khmer_text

router = APIRouter(prefix="/api/movie", tags=["movie"])

CHARACTER_VOICE_MAP: dict[str, str] = {
    "ទិនហ្វី": "tinfy",
    "tinfy": "tinfy",
    "កំប្លែង": "tinfy",
    "ប៉ាវចិន": "pao_chin",
    "pao_chin": "pao_chin",
    "ចៅក្រម": "pao_chin",
    "មេទ័ព": "pao_chin",
    "អ្នកនិទាន": "male_narrator",
    "អ្នកនិទានរឿង": "male_narrator",
    "narrator": "male_narrator",
    "តួប្រុស": "male",
    "តារា": "male",
    "hero": "male",
    "dara": "male",
    "តួស្រី": "female",
    "សុភា": "female",
    "heroine": "female",
    "sophea": "female",
    "ក្មេងស្រី": "female_youth",
    "ចន្ធូ": "female_youth",
    "chanthou": "female_youth",
    "អ្នកកាសែត": "male_reporter",
    "ចាន់": "male_reporter",
    "បុប្ផា": "female_news",
    "រិទ្ធី": "male_podcast",
    "សុខា": "male_heritage",
}

EMOTION_TAG_MAP: dict[str, str] = {
    "កំប្លែង": "comedy",
    "comedy": "comedy",
    "សើច": "comedy",
    "ម៉ឺងម៉ាត់": "stern",
    "stern": "stern",
    "ខឹង": "angry",
    "angry": "angry",
    "ភាពយន្ត": "cinematic",
    "កុន": "cinematic",
    "cinematic": "cinematic",
    "និទាន": "cinematic",
    "movie_narrator": "cinematic",
    "ប្រយុទ្ធ": "action",
    "action": "action",
    "ស្រែក": "action",
    "សោកសៅ": "sad",
    "sad": "sad",
    "យំ": "sad",
    "melodrama": "melodrama",
    "ស្នេហា": "romantic",
    "romantic": "romantic",
    "ផ្អែមល្ហែម": "romantic",
    "រន្ធត់": "suspense",
    "suspense": "suspense",
    "ខ្សឹប": "whisper",
    "whisper": "whisper",
    "រីករាយ": "happy",
    "happy": "happy",
    "សប្បាយ": "happy",
    "excited": "excited",
    "រំភើប": "excited",
    "ធម្មតា": "neutral",
    "neutral": "neutral",
}


def parse_timestamp_to_seconds(ts: str) -> float:
    """Convert '00:01:23,400' or '01:23.400' to seconds."""
    ts = ts.strip().replace(",", ".")
    parts = ts.split(":")
    if len(parts) == 3:
        h, m, s = parts
        return float(h) * 3600.0 + float(m) * 60.0 + float(s)
    elif len(parts) == 2:
        m, s = parts
        return float(m) * 60.0 + float(s)
    try:
        return float(ts)
    except Exception:
        return 0.0


def format_srt_time(seconds: float) -> str:
    """Format seconds into standard SRT timestamp hh:mm:ss,ms."""
    ms = int(round((seconds % 1.0) * 1000))
    total_sec = int(seconds)
    sec = total_sec % 60
    total_min = total_sec // 60
    minute = total_min % 60
    hour = total_min // 60
    return f"{hour:02d}:{minute:02d}:{sec:02d},{ms:03d}"


def parse_srt_content(raw_srt: str) -> list[SubtitledLine]:
    """Parse SubRip (.srt) subtitle content into SubtitledLine objects."""
    lines: list[SubtitledLine] = []
    if not raw_srt:
        return lines

    # Clean BOM and carriage returns
    clean_text = raw_srt.replace("\ufeff", "").replace("\r\n", "\n").replace("\r", "\n")

    # Match SRT blocks: index, timestamp interval, and subtitle text
    block_pattern = re.compile(
        r"(?:^|\n+)(?:(\d+)\s*\n)?(\d{1,2}:\d{2}:\d{2}[,\.]\d{1,3}|\d{1,2}:\d{2}[,\.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,\.]\d{1,3}|\d{1,2}:\d{2}[,\.]\d{1,3})\s*\n([\s\S]*?)(?=(?:\n+\d+\s*\n+\d{1,2}:|\n+\d{1,2}:|\Z))"
    )

    matches = block_pattern.findall(clean_text)
    seq = 1
    for m in matches:
        _, start_str, end_str, body = m
        start_sec = parse_timestamp_to_seconds(start_str)
        end_sec = parse_timestamp_to_seconds(end_str)

        body_clean = re.sub(r"<[^>]+>", "", body).strip()
        if not body_clean:
            continue

        # Extract character and emotion tags if present: e.g. "[ទិនហ្វី (comedy)]: ឥឡូវឆាប់..."
        char_part = "អ្នកនិទាន"
        emo_tag = "neutral"
        text_content = body_clean

        match_bracket = re.match(r"^\s*\[([^\]]+)\]\s*:\s*(.*)$", body_clean)
        if match_bracket:
            char_full = match_bracket.group(1).strip()
            text_content = match_bracket.group(2).strip()
            inner = re.match(r"^([^(]+)\s*(?:\(([^)]+)\))?$", char_full)
            if inner:
                char_part = inner.group(1).strip()
                if inner.group(2):
                    emo_tag = inner.group(2).strip().lower()
        else:
            simple = re.match(r"^\s*([^:：\n]+)\s*[:：]\s*(.*)$", body_clean)
            if simple:
                char_part = simple.group(1).strip()
                text_content = simple.group(2).strip()

        matched_voice = "male_narrator"
        char_clean = char_part.lower()
        for k, v in CHARACTER_VOICE_MAP.items():
            if k in char_clean or char_clean in k:
                matched_voice = v
                break

        matched_emo = EMOTION_TAG_MAP.get(emo_tag, emo_tag)
        if matched_emo == "neutral":
            if matched_voice == "tinfy":
                matched_emo = "comedy"
            elif matched_voice == "pao_chin":
                matched_emo = "stern"
            elif matched_voice == "male_narrator":
                matched_emo = "cinematic"

        slot_dur = max(0.5, end_sec - start_sec)
        # Approximate speed if subtitle slot is tight
        speed = 1.05 if matched_emo in ("comedy", "action") else 1.0

        lines.append(
            SubtitledLine(
                index=seq,
                start_time=round(start_sec, 3),
                end_time=round(end_sec, 3),
                character=char_part,
                voice=matched_voice,
                text=text_content,
                emotion=matched_emo,
                speed=speed,
            )
        )
        seq += 1

    return lines


def parse_script_text(raw_text: str) -> list[MovieDialogueLine]:
    """Parse movie script text into structured MovieDialogueLine items."""
    lines: list[MovieDialogueLine] = []
    if not raw_text:
        return lines

    pattern = re.compile(r"^\s*\[([^\]]+)\]\s*:\s*(.*)$")
    simple_pattern = re.compile(r"^\s*([^:：\n]+)\s*[:：]\s*(.*)$")

    for raw_line in raw_text.splitlines():
        line_str = raw_line.strip()
        if not line_str or line_str.startswith("#"):
            continue

        char_part = "អ្នកនិទាន"
        dialogue_text = ""
        emo_tag = "neutral"

        bracket_match = pattern.match(line_str)
        if bracket_match:
            char_full = bracket_match.group(1).strip()
            dialogue_text = bracket_match.group(2).strip()
            inner_match = re.match(r"^([^(]+)\s*(?:\(([^)]+)\))?$", char_full)
            if inner_match:
                char_part = inner_match.group(1).strip()
                if inner_match.group(2):
                    emo_tag = inner_match.group(2).strip().lower()
        else:
            simple_match = simple_pattern.match(line_str)
            if simple_match:
                char_part = simple_match.group(1).strip()
                dialogue_text = simple_match.group(2).strip()
            else:
                dialogue_text = line_str

        char_clean = char_part.lower()
        matched_voice = "male_narrator"
        for k, v in CHARACTER_VOICE_MAP.items():
            if k in char_clean or char_clean in k:
                matched_voice = v
                break

        matched_emo = EMOTION_TAG_MAP.get(emo_tag, emo_tag)
        if matched_emo == "neutral":
            if matched_voice == "tinfy":
                matched_emo = "comedy"
            elif matched_voice == "pao_chin":
                matched_emo = "stern"
            elif matched_voice == "male_narrator":
                matched_emo = "cinematic"

        speed = 1.05 if matched_emo in ("comedy", "action") else (0.95 if matched_emo in ("cinematic", "sad") else 1.0)
        pause = 0.5 if matched_voice == "male_narrator" else 0.4

        if dialogue_text:
            lines.append(
                MovieDialogueLine(
                    character=char_part,
                    voice=matched_voice,
                    text=dialogue_text,
                    emotion=matched_emo,
                    speed=speed,
                    pause_after_sec=pause,
                )
            )
    return lines


@router.post("/parse-script", response_model=ScriptParseResponse)
def api_parse_movie_script(req: ScriptParseRequest) -> ScriptParseResponse:
    """Parse raw script text into structured lines with character and emotion detection."""
    parsed = parse_script_text(req.script_text)
    return ScriptParseResponse(lines=parsed)


@router.post("/parse-srt", response_model=SrtParseResponse)
async def api_parse_srt(
    srt_file: Optional[UploadFile] = File(None),
    srt_text: Optional[str] = Form(None),
) -> SrtParseResponse:
    """Parse standard SRT subtitle file or string into timestamped dialogue lines."""
    content = ""
    if srt_file is not None and srt_file.filename:
        raw_bytes = await srt_file.read()
        content = raw_bytes.decode("utf-8", errors="replace")
    elif srt_text:
        content = srt_text

    if not content.strip():
        raise HTTPException(status_code=400, detail="Please provide an SRT subtitle file or text.")

    lines = parse_srt_content(content)
    total_dur = max([l.end_time for l in lines], default=0.0)
    return SrtParseResponse(
        lines=lines,
        total_lines=len(lines),
        total_duration_sec=round(total_dur, 2),
    )


@router.post("/dub", response_model=MovieDubResponse)
async def api_dub_movie_scene(req: MovieDubRequest) -> MovieDubResponse:
    """Synthesize a complete multi-character movie scene, generating master WAV and SRT subtitles."""
    lines_to_dub = req.lines
    if not lines_to_dub and req.script_text:
        lines_to_dub = parse_script_text(req.script_text)

    if not lines_to_dub:
        raise HTTPException(status_code=400, detail="No dialogue lines found to dub.")

    clear_cancel()
    voices = load_voice_profiles()

    def _run_movie_synthesis() -> tuple[list[dict[str, Any]], np.ndarray, int]:
        with get_engine_lock():
            engine = get_cached_engine(req.model_id)
            sr = 48000
            segments: list[np.ndarray] = []
            results: list[dict[str, Any]] = []
            current_time = 0.0

            for idx, line in enumerate(lines_to_dub):
                if is_cancelled():
                    raise GenerationCancelledError("Movie dubbing cancelled by user.")

                voice_id = line.voice if line.voice in voices else "female"
                clean_t = normalize_khmer_text(line.text)
                if not clean_t.strip():
                    continue

                synth_res = engine.synthesize(
                    text=clean_t,
                    voice=voice_id,
                    normalize=False,
                    speed=line.speed,
                    use_lora=req.use_lora,
                    emotion=line.emotion,
                )

                audio_chunk = synth_res.audio
                sr = synth_res.sample_rate
                duration = float(len(audio_chunk)) / float(sr)

                start_t = current_time
                end_t = current_time + duration

                line_wav_id = f"movie_line_{idx + 1}_{voice_id}_{uuid.uuid4().hex[:6]}.wav"
                line_wav_path = GENERATED_DIR / line_wav_id
                sf.write(str(line_wav_path), audio_chunk, sr)

                results.append({
                    "line_index": idx + 1,
                    "character": line.character,
                    "voice": voice_id,
                    "emotion": line.emotion,
                    "text": line.text,
                    "start_time": round(start_t, 3),
                    "end_time": round(end_t, 3),
                    "duration": round(duration, 3),
                    "audio_url": f"/audio/api_generated/{line_wav_id}",
                })

                segments.append(audio_chunk)
                current_time = end_t

                pause_sec = max(0.05, float(line.pause_after_sec))
                pause_samples = int(pause_sec * sr)
                if pause_samples > 0:
                    silence = np.zeros(pause_samples, dtype=np.float32)
                    segments.append(silence)
                    current_time += pause_sec

            stitched_audio = np.concatenate(segments) if segments else np.zeros(sr, dtype=np.float32)
            return results, stitched_audio, sr

    try:
        line_results, master_audio, sample_rate = await asyncio.to_thread(_run_movie_synthesis)
    except GenerationCancelledError as exc:
        raise HTTPException(status_code=499, detail="Movie dubbing cancelled.") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Movie dubbing failed: {exc}") from exc

    scene_slug = re.sub(r"[^\w\-_]+", "_", req.title.strip().lower())[:24] or "scene"
    master_id = f"movie_{scene_slug}_{uuid.uuid4().hex[:8]}.wav"
    master_path = GENERATED_DIR / master_id
    sf.write(str(master_path), master_audio, sample_rate)

    total_duration = float(len(master_audio)) / float(sample_rate)

    srt_blocks = []
    for item in line_results:
        idx = item["line_index"]
        t_start = format_srt_time(item["start_time"])
        t_end = format_srt_time(item["end_time"])
        char = item["character"]
        txt = item["text"]
        srt_blocks.append(f"{idx}\n{t_start} --> {t_end}\n[{char}]: {txt}\n")

    srt_content = "\n".join(srt_blocks)
    srt_id = f"{master_id[:-4]}.srt"
    (GENERATED_DIR / srt_id).write_text(srt_content, encoding="utf-8")

    return MovieDubResponse(
        title=req.title,
        full_audio_url=f"/audio/api_generated/{master_id}",
        total_duration_sec=round(total_duration, 2),
        srt_subtitles=srt_content,
        lines=[MovieDialogueResultItem(**item) for item in line_results],
    )


@router.post("/dub-video", response_model=VideoDubResponse)
async def api_dub_video(
    lines_json: str = Form(..., description="JSON array of SubtitledLine items"),
    title: str = Form("Dubbed Movie Scene"),
    model_id: str = Form("voxcpm2_khmer"),
    use_lora: bool = Form(True),
    mix_original_audio: bool = Form(True, description="Mix original video background sound/music at low volume"),
    bg_volume: float = Form(0.15, description="Volume multiplier for original video audio (0.05 to 0.40)"),
    video: Optional[UploadFile] = File(None, description="Optional MP4/MOV video file to multiplex"),
) -> VideoDubResponse:
    """Dub movie video from timestamped subtitle lines, outputting master WAV, SRT, and multiplexed MP4."""
    try:
        raw_lines = json.loads(lines_json)
        sub_lines = [SubtitledLine(**item) for item in raw_lines]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid lines_json format: {exc}")

    if not sub_lines:
        raise HTTPException(status_code=400, detail="At least one subtitle line is required.")

    clear_cancel()
    voices = load_voice_profiles()

    # Save uploaded video if present
    tmp_video_path: Optional[Path] = None
    if video is not None and video.filename:
        video_suffix = Path(video.filename).suffix or ".mp4"
        tmp_video = tempfile.NamedTemporaryFile(delete=False, suffix=video_suffix)
        tmp_video.write(await video.read())
        tmp_video.close()
        tmp_video_path = Path(tmp_video.name)

    def _run_subtitled_dubbing() -> tuple[list[dict[str, Any]], np.ndarray, int]:
        with get_engine_lock():
            engine = get_cached_engine(model_id)
            sr = 48000

            # Calculate total duration needed for master timeline
            max_end = max([l.end_time for l in sub_lines], default=10.0)
            total_samples = int((max_end + 3.0) * sr)
            master_buffer = np.zeros(total_samples, dtype=np.float32)
            results: list[dict[str, Any]] = []

            for idx, line in enumerate(sub_lines):
                if is_cancelled():
                    raise GenerationCancelledError("Video dubbing cancelled by user.")

                voice_id = line.voice if line.voice in voices else "female"
                clean_t = normalize_khmer_text(line.text)
                if not clean_t.strip():
                    continue

                synth_res = engine.synthesize(
                    text=clean_t,
                    voice=voice_id,
                    normalize=False,
                    speed=line.speed,
                    use_lora=use_lora,
                    emotion=line.emotion,
                )

                chunk_audio = synth_res.audio
                sr = synth_res.sample_rate
                dur = float(len(chunk_audio)) / float(sr)

                start_s = line.start_time
                end_s = start_s + dur

                start_idx = int(start_s * sr)
                end_idx = start_idx + len(chunk_audio)

                if end_idx > len(master_buffer):
                    pad = np.zeros(end_idx - len(master_buffer) + int(sr * 2.0), dtype=np.float32)
                    master_buffer = np.concatenate([master_buffer, pad])

                # Overlay speech at exact timestamp
                master_buffer[start_idx:end_idx] += chunk_audio

                # Save line snippet
                line_wav_id = f"sub_line_{idx + 1}_{voice_id}_{uuid.uuid4().hex[:6]}.wav"
                line_wav_path = GENERATED_DIR / line_wav_id
                sf.write(str(line_wav_path), chunk_audio, sr)

                results.append({
                    "line_index": idx + 1,
                    "character": line.character,
                    "voice": voice_id,
                    "emotion": line.emotion,
                    "text": line.text,
                    "start_time": round(start_s, 3),
                    "end_time": round(end_s, 3),
                    "duration": round(dur, 3),
                    "audio_url": f"/audio/api_generated/{line_wav_id}",
                })

            # Trim trailing silence
            non_zeros = np.nonzero(master_buffer)[0]
            trim_end = non_zeros[-1] + int(0.5 * sr) if len(non_zeros) > 0 else len(master_buffer)
            final_master = master_buffer[: min(trim_end, len(master_buffer))]

            # Normalize peak to -1dB to prevent clipping
            peak = float(np.max(np.abs(final_master))) if final_master.size > 0 else 0.0
            if peak > 0.95:
                final_master = final_master * (0.92 / peak)

            return results, final_master, sr

    try:
        line_results, master_audio, sample_rate = await asyncio.to_thread(_run_subtitled_dubbing)
    except GenerationCancelledError as exc:
        if tmp_video_path:
            tmp_video_path.unlink(missing_ok=True)
        raise HTTPException(status_code=499, detail="Dubbing cancelled.") from exc
    except Exception as exc:
        if tmp_video_path:
            tmp_video_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Dubbing failed: {exc}") from exc

    # Write Master Audio WAV
    clean_title = re.sub(r"[^\w\-_]+", "_", title.strip().lower())[:24] or "dubbed"
    unique_tag = uuid.uuid4().hex[:8]
    master_wav_id = f"dubbed_{clean_title}_{unique_tag}.wav"
    master_wav_path = GENERATED_DIR / master_wav_id
    sf.write(str(master_wav_path), master_audio, sample_rate)
    total_duration = float(len(master_audio)) / float(sample_rate)

    # Generate SRT Subtitle
    srt_blocks = []
    for item in line_results:
        idx = item["line_index"]
        t_start = format_srt_time(item["start_time"])
        t_end = format_srt_time(item["end_time"])
        char = item["character"]
        txt = item["text"]
        srt_blocks.append(f"{idx}\n{t_start} --> {t_end}\n[{char}]: {txt}\n")

    srt_content = "\n".join(srt_blocks)
    srt_id = f"{master_wav_id[:-4]}.srt"
    (GENERATED_DIR / srt_id).write_text(srt_content, encoding="utf-8")

    # If Video was uploaded, multiplex audio into video using ffmpeg
    dubbed_video_url: Optional[str] = None
    if tmp_video_path and tmp_video_path.exists():
        ffmpeg_bin = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
        if ffmpeg_bin and Path(ffmpeg_bin).exists():
            out_video_id = f"dubbed_video_{clean_title}_{unique_tag}.mp4"
            out_video_path = GENERATED_DIR / out_video_id

            if mix_original_audio:
                # Keep original audio ducked to 15% and layer Khmer dubbed speech on top
                cmd = [
                    ffmpeg_bin,
                    "-y",
                    "-i",
                    str(tmp_video_path),
                    "-i",
                    str(master_wav_path),
                    "-filter_complex",
                    f"[0:a]volume={bg_volume}[bg];[1:a]volume=1.0[dub];[bg][dub]amix=inputs=2:duration=first:dropout_transition=2[aout]",
                    "-map",
                    "0:v:0",
                    "-map",
                    "[aout]",
                    "-c:v",
                    "copy",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "256k",
                    str(out_video_path),
                ]
            else:
                # Replace video audio completely with new Khmer master track
                cmd = [
                    ffmpeg_bin,
                    "-y",
                    "-i",
                    str(tmp_video_path),
                    "-i",
                    str(master_wav_path),
                    "-map",
                    "0:v:0",
                    "-map",
                    "1:a:0",
                    "-c:v",
                    "copy",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "256k",
                    str(out_video_path),
                ]

            try:
                res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)
                if res.returncode == 0 and out_video_path.exists():
                    dubbed_video_url = f"/audio/api_generated/{out_video_id}"
                else:
                    # Fallback without filter_complex if original video had no audio track
                    fallback_cmd = [
                        ffmpeg_bin,
                        "-y",
                        "-i",
                        str(tmp_video_path),
                        "-i",
                        str(master_wav_path),
                        "-map",
                        "0:v:0",
                        "-map",
                        "1:a:0",
                        "-c:v",
                        "copy",
                        "-c:a",
                        "aac",
                        "-b:a",
                        "256k",
                        str(out_video_path),
                    ]
                    f_res = subprocess.run(fallback_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=60)
                    if f_res.returncode == 0 and out_video_path.exists():
                        dubbed_video_url = f"/audio/api_generated/{out_video_id}"
            except Exception as ffmpeg_err:
                print(f"[!] Warning: FFmpeg multiplexing failed: {ffmpeg_err}")
            finally:
                tmp_video_path.unlink(missing_ok=True)

    return VideoDubResponse(
        title=title,
        video_url=dubbed_video_url,
        full_audio_url=f"/audio/api_generated/{master_wav_id}",
        total_duration_sec=round(total_duration, 2),
        srt_subtitles=srt_content,
        lines=[MovieDialogueResultItem(**item) for item in line_results],
    )
