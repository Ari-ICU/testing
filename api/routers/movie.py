"""Movie & Drama Dialogue Dubbing API Router.

Features:
- Multi-character Cambodian movie dialogue synthesis
- Script parsing ([Character (emotion)]: dialogue)
- Automatic dialogue timeline generation with timestamps
- SRT subtitle generation for video editors (Premiere, CapCut, DaVinci)
- Master 48kHz audio stitching with cinematic character pause transitions
"""

from __future__ import annotations

import asyncio
from pathlib import Path
import re
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
import numpy as np
import soundfile as sf

from api.config import GENERATED_DIR, PROJECT_ROOT
from api.dependencies import get_cached_engine, get_engine_lock
from api.schemas.movie import (
    MovieDialogueLine,
    MovieDialogueResultItem,
    MovieDubRequest,
    MovieDubResponse,
    MoviePresetItem,
    MoviePresetsResponse,
    ScriptParseRequest,
    ScriptParseResponse,
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

DEFAULT_MOVIE_PRESETS: list[MoviePresetItem] = [
    MoviePresetItem(
        id="tinfy_vs_pao_chin",
        title="🎭 ទិនហ្វី ប៉ះ ប៉ាវចិន (Comedy & Courtroom Drama)",
        genre="Comedy / Drama",
        description="Classic comedy duel between Tinfy and Judge Bao in courtroom setting",
        script_text="""[អ្នកនិទាន (cinematic)]: នៅសាលាក្តីក្រុងខៃហ្វុង ថ្ងៃនេះមានរឿងចម្លែកមួយបានកើតឡើង។
[ទិនហ្វី (comedy)]: ឥឡូវឆាប់ដោះលែងគេទាំងពីរទៅ ឲ្យខ្ញុំធ្វើអីក៏បានដែរ លោកម្ចាស់! ហិហិ!
[ប៉ាវចិន (stern)]: ហ៊ានប្រមាថតុលាការឬ? ឈប់សើចភ្លាម! ឆ្មាំទាំងឡាយ យកកាំបិតក្បាលឆ្កែមក!
[ទិនហ្វី (comedy)]: អូយ! កុំអីលោកបង! ខ្ញុំគ្រាន់តែនិយាយលេងសើចសោះហ្នឹង!
[ប៉ាវចិន (stern)]: នៅចំពោះមុខច្បាប់ គ្មានការលេងសើចឡើយ!""",
    ),
    MoviePresetItem(
        id="ancient_warrior_battle",
        title="⚔️ សង្គ្រាមមេទ័ពបុរាណ (Ancient Warrior Action)",
        genre="Historical Action",
        description="Intense battlefield confrontation between heroic commanders",
        script_text="""[អ្នកនិទាន (cinematic)]: ខ្យល់បក់បោកយ៉ាងខ្លាំងនៅលើវាលសមរភូមិ មុនពេលព្រះអាទិត្យរះ។
[ប៉ាវចិន (action)]: ទាហានទាំងអស់! លើកខែលការពារ និងត្រៀមវាយលុក!
[តារា (action)]: ពួកយើងមិនថយក្រោយជាដាច់ខាត! ដើម្បីទឹកដី និងប្រជាជន!
[សុភា (sad)]: សូមបងប្រយ័ត្នខ្លួនផង ខ្ញុំនឹងរង់ចាំការវិលត្រឡប់របស់បង!
[តារា (romantic)]: កុំបារម្ភអីអូន បងសន្យានឹងវិលត្រឡប់មកវិញដោយជ័យជម្នះ!""",
    ),
    MoviePresetItem(
        id="cinematic_trailer",
        title="🎬 ស្រមោលរាត្រី (Cinematic Suspense Trailer)",
        genre="Thriller / Mystery",
        description="Dramatic movie trailer with suspenseful narration and tense dialogues",
        script_text="""[អ្នកនិទាន (cinematic)]: នៅក្នុងទីក្រុងដ៏អាថ៌កំបាំងមួយ... គ្មានអ្នកណាដឹងថាមានរឿងអ្វីនឹងកើតឡើងនោះទេ។
[ចន្ធូ (suspense)]: តើអ្នកណា... អ្នកណានៅទីនោះ? ចេញមកភ្លាម!
[ទិនហ្វី (comedy)]: គឺខ្ញុំតើ! កុំភ័យអី កុំទាន់អាលស្រែក ខ្ញុំទើបតែដើរវង្វេងផ្លូវទេ!
[អ្នកនិទាន (cinematic)]: ភាពយន្តខ្មែរថ្មី នឹងមកដល់ឆាប់ៗនេះ នៅគ្រប់រោងភាពយន្ត!""",
    ),
]


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

        char_part = ""
        dialogue_text = ""
        emo_tag = "neutral"

        bracket_match = pattern.match(line_str)
        if bracket_match:
            char_full = bracket_match.group(1).strip()
            dialogue_text = bracket_match.group(2).strip()
            # Check for emotion in parentheses: e.g. "ទិនហ្វី (comedy)" or "អ្នកនិទាន (cinematic)"
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
                char_part = "អ្នកនិទាន"
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

        speed = 1.05 if matched_emo in ("comedy", "action") else (0.92 if matched_emo in ("cinematic", "sad") else 1.0)
        pause = 0.5 if matched_voice == "male_narrator" else 0.35

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


def format_srt_time(seconds: float) -> str:
    """Format seconds into standard SRT timestamp hh:mm:ss,ms."""
    ms = int(round((seconds % 1.0) * 1000))
    total_sec = int(seconds)
    sec = total_sec % 60
    total_min = total_sec // 60
    minute = total_min % 60
    hour = total_min // 60
    return f"{hour:02d}:{minute:02d}:{sec:02d},{ms:03d}"


@router.get("/presets", response_model=MoviePresetsResponse)
def api_get_movie_presets() -> MoviePresetsResponse:
    """Return pre-built Cambodian movie and drama dialogue scene presets."""
    return MoviePresetsResponse(presets=DEFAULT_MOVIE_PRESETS)


@router.post("/parse-script", response_model=ScriptParseResponse)
def api_parse_movie_script(req: ScriptParseRequest) -> ScriptParseResponse:
    """Parse raw movie script into structured dialogue lines with character and emotion detection."""
    parsed = parse_script_text(req.script_text)
    return ScriptParseResponse(lines=parsed)


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

                # Resolve character voice profile
                voice_id = line.voice if line.voice in voices else "female"
                clean_t = normalize_khmer_text(line.text)

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

                # Save individual line audio snippet
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

                # Add silence gap between characters
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

    # Generate master movie scene WAV
    scene_slug = re.sub(r"[^\w\-_]+", "_", req.title.strip().lower())[:24] or "scene"
    master_id = f"movie_{scene_slug}_{uuid.uuid4().hex[:8]}.wav"
    master_path = GENERATED_DIR / master_id
    sf.write(str(master_path), master_audio, sample_rate)

    total_duration = float(len(master_audio)) / float(sample_rate)

    # Generate SRT Subtitle file
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
