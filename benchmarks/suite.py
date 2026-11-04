"""Stage 1 — Khmer TTS Model Evaluation & Benchmark Suite (KhmerVoice AI).

Evaluates pronunciation, Khmer text normalization, speaking style/pauses,
voice cloning, and Apple Silicon M2 Pro speed across:
- `mms` (`facebook/mms-tts-khm`)
- `f5_khmer` (`sarunvisoth/khmer-tts-demo` or local checkpoint)
- `voxcpm2_khmer` (`ravuthz/VoxCPM2-khmer`)
- `voxcpm2_base` (`openbmb/VoxCPM2`)

Generates WAV files, a JSON summary, and an interactive side-by-side HTML
audio comparison dashboard at `benchmarks/outputs/report.html`.
"""

from __future__ import annotations

import argparse
import html
import json
from pathlib import Path
import sys
import time
from typing import Any

import soundfile as sf

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from inference.engines import AVAILABLE_MODELS, get_engine
from preprocessing.khmer_normalizer import normalize_khmer_text

BENCHMARK_PROMPTS: list[dict[str, str]] = [
    {
        "id": "01_greeting",
        "category": "Natural Greeting & Intonation",
        "text": "ជម្រាបសួរ! សូមស្វាគមន៍មកកាន់ប្រព័ន្ធបំប្លែងអត្ថបទទៅជាសំឡេងភាសាខ្មែរ។",
        "focus": "Everyday politeness, natural sentence-final cadence (។)",
    },
    {
        "id": "02_numbers_currency",
        "category": "Khmer Numerals & Currency (៛ / $)",
        "text": "កាហ្វេមួយកែវតម្លៃ ៥០០០៛ ឬប្រហែល $1.25 ក្នុងឆ្នាំ ២០២៦។",
        "focus": "Verbalization of ៥០០០៛, decimal $1.25, and year ២០២៦",
    },
    {
        "id": "03_dates",
        "category": "Khmer Dates & Time",
        "text": "កិច្ចប្រជុំនេះនឹងប្រព្រឹត្តទៅនៅថ្ងៃទី ២/១១/២០២៦ វេលាម៉ោង ៩ ព្រឹក។",
        "focus": "Date expansion (២/១១/២០២៦ -> ថ្ងៃទីពីរ ខែវិច្ឆិកា ឆ្នាំពីរពាន់ម្ភៃប្រាំមួយ)",
    },
    {
        "id": "04_repetition",
        "category": "Repetition Symbol (ៗ / Lek Too)",
        "text": "នៅផ្សារមានលក់បន្លែស្រស់ៗ និងផ្លែឈើល្អៗជាច្រើនមុខ។",
        "focus": "Proper reduplication of ស្រស់ៗ and ល្អៗ",
    },
    {
        "id": "05_clusters",
        "category": "Complex Consonant Clusters & Subscripts",
        "text": "ព្រះរាជាណាចក្រកម្ពុជាមានវប្បធម៌ និងអរិយធម៌ដ៏រុងរឿង។",
        "focus": "Coeng (្) clusters: ព្រះ, ក្រ, កម្ពុ, វប្បធម៌, រុងរឿង",
    },
    {
        "id": "06_codeswitch",
        "category": "English Mixed with Khmer",
        "text": "បច្ចេកវិទ្យា AI និង Software ទំនើបជួយសម្រួលការងារនៅលើ Computer។",
        "focus": "Code-switching transliteration (AI, Software, Computer)",
    },
    {
        "id": "07_paragraph",
        "category": "Multi-Clause Paragraph & Pauses",
        "text": "ការអានសៀវភៅជួយបង្កើនចំណេះដឹង និងពង្រីកការគិតរបស់យើង។ ដូច្នេះ យើងគួរតែចំណាយពេលយ៉ាងតិច ៣០ នាទីក្នុងមួយថ្ងៃ ដើម្បីអានសៀវភៅល្អៗ។",
        "focus": "Multi-sentence chunking, breathing pauses, and prosody continuity",
    },
]


def build_html_report(
    results: list[dict[str, Any]],
    models_tested: list[str],
    output_dir: Path,
) -> Path:
    report_path = output_dir / "report.html"

    # Group by prompt_id -> model_id
    by_prompt: dict[str, dict[str, dict[str, Any]]] = {}
    for r in results:
        by_prompt.setdefault(r["prompt_id"], {})[r["model_id"]] = r

    model_headers = "".join(
        f"<th>{html.escape(AVAILABLE_MODELS[m]['name'])}<br>"
        f"<span class='sub'>{html.escape(AVAILABLE_MODELS[m]['repo_id'])}</span></th>"
        for m in models_tested
    )

    rows_html = []
    for p in BENCHMARK_PROMPTS:
        pid = p["id"]
        if pid not in by_prompt:
            continue
        norm = normalize_khmer_text(p["text"])
        cells = []
        for m in models_tested:
            item = by_prompt[pid].get(m)
            if not item:
                cells.append("<td class='empty'>Not run</td>")
            elif item.get("error"):
                cells.append(
                    f"<td class='error'>⚠️ {html.escape(str(item['error']))}</td>"
                )
            else:
                rel_wav = item["rel_audio_path"]
                cells.append(
                    f"<td>"
                    f"<audio controls preload='metadata' src='{html.escape(rel_wav)}'></audio>"
                    f"<div class='metrics'>"
                    f"<span>⏱️ Latency: <b>{item['latency_sec']:.2f}s</b></span>"
                    f"<span>⚡ RTF: <b>{item['rtf']:.2f}x</b></span>"
                    f"<span>🔊 {item['duration_sec']:.1f}s @ {item['sample_rate']//1000}kHz</span>"
                    f"<span>🎙️ Voice: {html.escape(item['voice_id'])}</span>"
                    f"</div>"
                    f"</td>"
                )
        rows_html.append(
            f"<tr>"
            f"<td class='prompt-cell'>"
            f"<div class='cat'>{html.escape(p['category'])}</div>"
            f"<div class='khm-raw'>{html.escape(p['text'])}</div>"
            f"<div class='khm-norm'><b>Normalized:</b> {html.escape(norm)}</div>"
            f"<div class='focus'>🎯 {html.escape(p['focus'])}</div>"
            f"</td>"
            f"{''.join(cells)}"
            f"</tr>"
        )

    html_doc = f"""<!DOCTYPE html>
<html lang="km">
<head>
  <meta charset="UTF-8">
  <title>KhmerVoice AI — Stage 1 Khmer TTS Benchmark Report</title>
  <link href="https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@400;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {{
      --bg: #0f172a;
      --card: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: #38bdf8;
    }}
    body {{
      margin: 0;
      padding: 32px;
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', 'Kantumruy Pro', sans-serif;
    }}
    h1 {{ margin: 0 0 8px 0; font-size: 26px; }}
    p.lead {{ color: var(--muted); margin: 0 0 24px 0; }}
    table {{
      width: 100%;
      border-collapse: collapse;
      background: var(--card);
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--border);
    }}
    th, td {{
      padding: 16px;
      text-align: left;
      vertical-align: top;
      border-bottom: 1px solid var(--border);
      border-right: 1px solid var(--border);
    }}
    th {{ background: #0b1120; font-weight: 600; font-size: 14px; }}
    th .sub {{ color: var(--muted); font-weight: 400; font-size: 12px; }}
    .prompt-cell {{ width: 340px; }}
    .cat {{ color: var(--accent); font-weight: 600; font-size: 12px; text-transform: uppercase; margin-bottom: 6px; }}
    .khm-raw {{ font-family: 'Kantumruy Pro', sans-serif; font-size: 17px; line-height: 1.6; margin-bottom: 8px; }}
    .khm-norm {{ font-family: 'Kantumruy Pro', sans-serif; font-size: 13px; color: #cbd5e1; background: #0f172a; padding: 8px; border-radius: 6px; margin-bottom: 6px; }}
    .focus {{ font-size: 12px; color: var(--muted); }}
    audio {{ width: 250px; height: 38px; margin-bottom: 8px; }}
    .metrics {{ display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: var(--muted); }}
    .metrics span {{ background: #0f172a; padding: 3px 7px; border-radius: 4px; }}
    .error {{ color: #f87171; font-size: 13px; }}
  </style>
</head>
<body>
  <h1>🇰🇭 KhmerVoice AI — Stage 1 Model Benchmark Comparison</h1>
  <p class="lead">Apple M2 Pro (16GB) Evaluation Suite · Listen side-by-side to compare Khmer pronunciation, number/date reading, pauses, and voice cloning.</p>
  <table>
    <thead>
      <tr>
        <th>Khmer Evaluation Sentence & Normalization</th>
        {model_headers}
      </tr>
    </thead>
    <tbody>
      {''.join(rows_html)}
    </tbody>
  </table>
</body>
</html>
"""
    report_path.write_text(html_doc, encoding="utf-8")
    return report_path


def run_benchmark(
    models: list[str],
    voice: str = "female",
    limit_prompts: int | None = None,
    output_dir: Path | None = None,
) -> dict[str, Any]:
    out_dir = output_dir or (PROJECT_ROOT / "benchmarks" / "outputs")
    out_dir.mkdir(parents=True, exist_ok=True)

    prompts = BENCHMARK_PROMPTS[:limit_prompts] if limit_prompts else BENCHMARK_PROMPTS
    all_results: list[dict[str, Any]] = []

    for model_id in models:
        print(f"\n========================================================")
        print(f"🚀 Benchmarking: {AVAILABLE_MODELS[model_id]['name']} ({model_id})")
        print(f"========================================================")
        model_dir = out_dir / model_id
        model_dir.mkdir(parents=True, exist_ok=True)

        engine = get_engine(model_id)
        try:
            engine.load()
        except Exception as exc:
            print(f"[!] Could not load {model_id}: {exc}")
            for p in prompts:
                all_results.append(
                    {
                        "prompt_id": p["id"],
                        "category": p["category"],
                        "model_id": model_id,
                        "error": str(exc),
                    }
                )
            continue

        for p in prompts:
            pid = p["id"]
            print(f"  -> [{pid}] {p['category']}...")
            try:
                res = engine.synthesize(text=p["text"], voice=voice)
                wav_filename = f"{pid}_{voice}.wav"
                wav_path = model_dir / wav_filename
                sf.write(str(wav_path), res.audio, res.sample_rate)

                item = {
                    "prompt_id": pid,
                    "category": p["category"],
                    "model_id": model_id,
                    "model_name": res.model_name,
                    "raw_text": res.raw_text,
                    "normalized_text": res.normalized_text,
                    "voice_id": res.voice_id,
                    "sample_rate": res.sample_rate,
                    "duration_sec": round(res.duration_sec, 3),
                    "latency_sec": round(res.latency_sec, 3),
                    "rtf": round(res.rtf, 3),
                    "audio_path": str(wav_path),
                    "rel_audio_path": f"{model_id}/{wav_filename}",
                }
                all_results.append(item)
                print(
                    f"     ✓ {res.duration_sec:.2f}s audio in {res.latency_sec:.2f}s "
                    f"(RTF {res.rtf:.2f}x) -> {wav_path.name}"
                )
            except Exception as exc:
                print(f"     ✗ Failed on {pid}: {exc}")
                all_results.append(
                    {
                        "prompt_id": pid,
                        "category": p["category"],
                        "model_id": model_id,
                        "error": str(exc),
                    }
                )

        engine.unload()

    summary_path = out_dir / "summary.json"
    summary_data = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "voice": voice,
        "models_tested": models,
        "results": all_results,
    }
    summary_path.write_text(
        json.dumps(summary_data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    report_path = build_html_report(all_results, models, out_dir)
    print(f"\n✅ Benchmark complete!")
    print(f"   📊 JSON Summary : {summary_path}")
    print(f"   🎧 HTML Report  : {report_path}")
    return summary_data


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Stage 1 Khmer TTS Benchmark Suite")
    parser.add_argument(
        "--models",
        nargs="+",
        choices=list(AVAILABLE_MODELS.keys()),
        default=["mms", "f5_khmer", "voxcpm2_khmer"],
        help="Models to include in the benchmark run.",
    )
    parser.add_argument(
        "--voice",
        choices=["female", "male"],
        default="female",
        help="Reference voice profile for cloning models.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional limit on number of test sentences to run (1-7).",
    )
    args = parser.parse_args()
    run_benchmark(models=args.models, voice=args.voice, limit_prompts=args.limit)


if __name__ == "__main__":
    main()

