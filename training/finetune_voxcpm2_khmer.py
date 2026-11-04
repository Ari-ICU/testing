"""Stage 3 — VoxCPM 2 Khmer LoRA Fine-Tuning Script (Apple Silicon M2 Pro 16GB & CUDA).

Fine-tunes `ravuthz/VoxCPM2-khmer` or `openbmb/VoxCPM2` on your own Khmer audio+text
JSONL manifest using parameter-efficient LoRA on the MiniCPM-4 Language Model (`base_lm`
+ `residual_lm`) and Local Diffusion Transformer (`feat_decoder.estimator`).

Saves lightweight LoRA checkpoints (`lora_weights.safetensors` + `lora_config.json`)
that can be loaded directly into `VoxCPM2Engine` or the FastAPI Web Studio.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import random
import re
import sys
import time

from huggingface_hub import snapshot_download
from safetensors.torch import save_file
import torch
from torch.utils.checkpoint import checkpoint

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from preprocessing.khmer_normalizer import normalize_khmer_text
from voxcpm.model.voxcpm import LoRAConfig
from voxcpm.model.voxcpm2 import VoxCPM2Model
from voxcpm.training import (
    Accelerator,
    BatchProcessor,
    TrainingTracker,
    build_dataloader,
    load_audio_text_datasets,
    validate_manifest,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fine-tune VoxCPM 2 on Khmer Speech with LoRA"
    )
    parser.add_argument(
        "--base-model",
        type=str,
        default="ravuthz/VoxCPM2-khmer",
        help="Hugging Face repo ID or local path (`ravuthz/VoxCPM2-khmer` or `openbmb/VoxCPM2`).",
    )
    parser.add_argument(
        "--train-manifest",
        type=str,
        default=str(PROJECT_ROOT / "dataset" / "demo_train.jsonl"),
        help="Path to training JSONL manifest with `audio` and `text` columns.",
    )
    parser.add_argument(
        "--val-manifest",
        type=str,
        default="",
        help="Optional path to validation JSONL manifest.",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=str(PROJECT_ROOT / "models" / "voxcpm2_khmer_lora"),
        help="Directory to save LoRA checkpoints (`lora_weights.safetensors`).",
    )
    parser.add_argument("--lora-r", type=int, default=32, help="LoRA rank (default: 32)")
    parser.add_argument(
        "--lora-alpha", type=int, default=64, help="LoRA alpha (default: 64)"
    )
    parser.add_argument(
        "--lora-dropout", type=float, default=0.05, help="LoRA dropout (default: 0.05)"
    )
    parser.add_argument(
        "--enable-proj",
        action="store_true",
        default=True,
        help="Also apply LoRA to linear projection layers for richer acoustic and emotional expression.",
    )
    parser.add_argument(
        "--emotional-tuning",
        action="store_true",
        default=True,
        help="Condition text tokenization on emotional prosody tags (e.g. [កំប្លែង], [ម៉ឺងម៉ាត់]).",
    )
    parser.add_argument("--batch-size", type=int, default=1, help="Batch size per step")
    parser.add_argument(
        "--grad-accum",
        type=int,
        default=4,
        help="Gradient accumulation steps (default: 4)",
    )
    parser.add_argument(
        "--lr", type=float, default=1e-4, help="Learning rate (default: 1e-4)"
    )
    parser.add_argument(
        "--max-steps", type=int, default=100, help="Total optimizer training steps"
    )
    parser.add_argument(
        "--save-every", type=int, default=25, help="Save checkpoint every N steps"
    )
    parser.add_argument(
        "--device",
        type=str,
        default="auto",
        help="Device (`auto`, `mps`, `cuda`, `cpu`)",
    )
    parser.add_argument(
        "--ref-audio",
        type=str,
        default="",
        help="Optional reference voice WAV path to condition voice-cloning LoRA fine-tuning.",
    )
    return parser.parse_args()


def save_lora_checkpoint(
    model: VoxCPM2Model, lora_cfg: LoRAConfig, save_dir: Path, step: int
) -> Path:
    save_dir.mkdir(parents=True, exist_ok=True)
    lora_state = {
        k: v.detach().cpu().contiguous()
        for k, v in model.get_lora_state_dict().items()
    }
    weights_path = save_dir / "lora_weights.safetensors"
    save_file(lora_state, str(weights_path))

    meta = {
        "step": step,
        "lora_config": lora_cfg.model_dump(),
        "num_lora_tensors": len(lora_state),
    }
    (save_dir / "lora_config.json").write_text(
        json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return weights_path


def main() -> None:
    args = parse_args()

    train_manifest_path = Path(args.train_manifest)
    if not train_manifest_path.exists():
        print(
            f"[*] Training manifest {train_manifest_path} not found. Generating demo manifest first..."
        )
        from dataset.build_custom_manifest import create_demo_manifests

        create_demo_manifests()

    # 1. Validate manifest
    val_res = validate_manifest(str(train_manifest_path), sample_rate=16000)
    if not val_res.is_valid:
        print(f"[!] Manifest validation warnings/errors: {val_res.errors}")

    # 2. Resolve base model path
    if Path(args.base_model).is_dir():
        model_path = args.base_model
    else:
        print(f"[*] Resolving base model snapshot: {args.base_model} ...")
        model_path = snapshot_download(repo_id=args.base_model)

    # 3. Configure LoRA
    lora_cfg = LoRAConfig(
        enable_lm=True,
        enable_dit=True,
        enable_proj=args.enable_proj,
        r=args.lora_r,
        alpha=args.lora_alpha,
        dropout=args.lora_dropout,
    )

    accelerator = Accelerator(amp=False, seed=42)
    device_str = str(accelerator.device) if args.device == "auto" else args.device
    device = torch.device(device_str)

    print(f"[*] Loading VoxCPM2Model in training mode on device={device} ...")
    model = VoxCPM2Model.from_local(
        path=model_path,
        optimize=False,
        training=True,
        device=device_str,
        lora_config=lora_cfg,
    )
    # Free static inference KV caches (unused in training, saves ~600MB on MPS)
    if getattr(model, "base_lm", None) is not None:
        model.base_lm.kv_cache = None
    if getattr(model, "residual_lm", None) is not None:
        model.residual_lm.kv_cache = None

    # Enable gradient checkpointing across transformer decoder layers to fit 16GB M2 Pro
    for sub_lm in (
        getattr(model, "base_lm", None),
        getattr(model, "residual_lm", None),
        getattr(getattr(model, "feat_encoder", None), "encoder", None),
        getattr(getattr(getattr(model, "feat_decoder", None), "estimator", None), "decoder", None),
    ):
        if sub_lm is not None and hasattr(sub_lm, "layers"):
            for layer in sub_lm.layers:
                orig_fwd = layer.forward

                def _make_ckpt_fwd(fn):
                    def _ckpt_fwd(hidden_states, position_emb, is_causal):
                        def _inner(h):
                            out, _ = fn(h, position_emb, is_causal)
                            return out

                        out = checkpoint(_inner, hidden_states, use_reentrant=False)
                        return out, None

                    return _ckpt_fwd

                layer.forward = _make_ckpt_fwd(orig_fwd)

    model.to(device)
    model.train()
    if device.type == "mps":
        torch.mps.empty_cache()

    trainable_params = [p for p in model.parameters() if p.requires_grad]
    total_params = sum(p.numel() for p in model.parameters())
    trainable_numel = sum(p.numel() for p in trainable_params)
    print(
        f"[+] LoRA active: {trainable_numel:,} trainable params / {total_params:,} total "
        f"({100.0 * trainable_numel / max(total_params, 1):.2f}%)"
    )

    # 4. Load & tokenize Khmer audio-text dataset
    encode_sr = int(getattr(model, "_encode_sample_rate", 16000))
    if args.ref_audio and Path(args.ref_audio).exists():
        # Inject ref_audio into manifest records that don't already specify one
        ref_abs = str(Path(args.ref_audio).resolve())
        updated_lines = []
        for line in train_manifest_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            rec = json.loads(line)
            if not rec.get("ref_audio"):
                rec["ref_audio"] = ref_abs
            updated_lines.append(json.dumps(rec, ensure_ascii=False))
        train_manifest_path.write_text("\n".join(updated_lines) + "\n", encoding="utf-8")

    train_ds, _ = load_audio_text_datasets(
        train_manifest=str(train_manifest_path),
        val_manifest=args.val_manifest,
        sample_rate=encode_sr,
    )

    STYLE_INSTRUCTION_MAP: dict[str, str] = {
        "neutral": "natural, clear, steady pace",
        "comedy": "humorous, playful, smiling, chuckling and lighthearted delivery",
        "tinfy": "humorous, playful, smiling, comedy tone",
        "stern": "firm, serious, authoritative, commanding voice",
        "pao_chin": "firm, serious, authoritative, commanding voice",
        "happy": "cheerful, happy, bright and energetic tone, warm smile in voice",
        "cheerful": "cheerful, happy, bright and energetic tone",
        "friendly": "warm, friendly, approachable and natural tone",
        "warm": "warm, calm, pleasant tone, gentle pace",
        "female_youth": "youthful, bright and cheerful tone",
        "sad": "sad, melancholic, soft low voice, slower pace, emotional sigh",
        "angry": "angry, firm, intense, loud and sharp tone, fast pace",
        "excited": "very excited, enthusiastic, high energy, dynamic pitch",
        "story": "expressive narrator, dramatic pauses, engaging and warm tone",
        "storytelling": "expressive narrator, dramatic pauses, engaging and warm tone",
        "male_narrator": "expressive narrator, dramatic pauses, deep and warm tone",
        "whisper": "soft whisper, quiet, intimate and breathy voice",
        "news": "authoritative news anchor, professional, articulate, steady broadcast pace",
        "female_news": "professional news anchor, articulate, clear and steady broadcast pace",
        "casual": "conversational, relaxed, friendly and natural pace",
        "male_podcast": "conversational podcast host, relaxed and friendly",
        "heritage": "historical, traditional recitation, slow and dignified",
        "male_heritage": "historical, traditional recitation, slow and dignified",
        "reporter": "field reporter, lively, broadcast style",
        "male_reporter": "field reporter, lively, broadcast style",
    }

    def _tokenize_batch(batch: dict[str, list[Any]]) -> dict[str, list[list[int]]]:
        ids_list = []
        texts = batch["text"]
        emotions = batch.get("emotion") or ["" for _ in texts]
        speakers = batch.get("speaker") or ["" for _ in texts]

        for raw_t, emo, spk in zip(texts, emotions, speakers):
            # Check if raw_t already carries a parenthesized control tag
            match = re.match(r"^\(([^)]+)\)\s*(.*)$", str(raw_t).strip(), flags=re.DOTALL)
            if match:
                existing_tag, khmer_text = match.group(1).strip(), match.group(2).strip()
            else:
                existing_tag, khmer_text = None, str(raw_t).strip()

            norm_t = normalize_khmer_text(khmer_text, transliterate_english=True)
            tag = (
                existing_tag
                or STYLE_INSTRUCTION_MAP.get(str(emo or "").lower())
                or STYLE_INSTRUCTION_MAP.get(str(spk or "").lower())
            )

            # CFG Dropout: On ~15% of samples during training, drop the style tag
            # to learn unconditional generation and strengthen CFG contrast at inference
            drop_tag = random.random() < 0.15

            if args.emotional_tuning and tag and not drop_tag:
                prompt_str = f"({tag}) {norm_t}"
            else:
                prompt_str = norm_t

            ids_list.append(model.text_tokenizer(prompt_str))
        return {"text_ids": ids_list}

    train_ds = train_ds.map(_tokenize_batch, batched=True)

    train_loader = build_dataloader(
        train_ds,
        accelerator=accelerator,
        batch_size=args.batch_size,
        num_workers=0,
    )

    batch_processor = BatchProcessor(
        config=model.config,
        audio_vae=model.audio_vae,
        dataset_cnt=1,
        device=device,
    )

    optimizer = torch.optim.AdamW(trainable_params, lr=args.lr, weight_decay=0.01)
    warmup_steps = max(1, min(5, args.max_steps // 6))

    def _get_lr(step_idx: int) -> float:
        if step_idx < warmup_steps:
            return args.lr * float(step_idx + 1) / float(warmup_steps)
        prog = float(step_idx - warmup_steps) / float(max(1, args.max_steps - warmup_steps))
        prog = min(1.0, max(0.0, prog))
        return args.lr * (0.15 + 0.85 * 0.5 * (1.0 + math.cos(math.pi * prog)))

    output_dir = Path(args.output_dir)
    tracker = TrainingTracker(
        log_file=str(output_dir / "training.log"), rank=accelerator.rank
    )

    print(
        f"[*] Starting LoRA fine-tuning for {args.max_steps} steps (grad_accum={args.grad_accum}, warmup={warmup_steps})...",
        flush=True,
    )
    optimizer.zero_grad()
    global_step = 0
    micro_step = 0
    t0 = time.perf_counter()

    while global_step < args.max_steps:
        for batch in train_loader:
            micro_step += 1
            packed = batch_processor(batch)
            progress = float(global_step) / float(max(args.max_steps, 1))

            outputs = model(
                text_tokens=packed["text_tokens"],
                text_mask=packed["text_mask"],
                audio_feats=packed["audio_feats"],
                audio_mask=packed["audio_mask"],
                loss_mask=packed["loss_mask"],
                position_ids=packed["position_ids"],
                labels=packed["labels"],
                progress=progress,
            )

            loss_diff = outputs["loss/diff"]
            loss_stop = outputs["loss/stop"]
            loss_diff_val = float(loss_diff.detach().item())
            loss_stop_val = float(loss_stop.detach().item())
            loss = (loss_diff + loss_stop) / args.grad_accum
            loss.backward()

            del packed, outputs, loss_diff, loss_stop, loss
            if device.type == "mps":
                torch.mps.empty_cache()

            if micro_step % args.grad_accum == 0:
                cur_lr = _get_lr(global_step)
                for pg in optimizer.param_groups:
                    pg["lr"] = cur_lr

                torch.nn.utils.clip_grad_norm_(trainable_params, max_norm=1.0)
                optimizer.step()
                optimizer.zero_grad(set_to_none=True)
                if device.type == "mps":
                    torch.mps.empty_cache()
                global_step += 1
                tracker.step = global_step

                total_loss_val = loss_diff_val + loss_stop_val
                tracker.log_metrics(
                    {
                        "loss_total": total_loss_val,
                        "loss_diff": loss_diff_val,
                        "loss_stop": loss_stop_val,
                    },
                    split="train",
                )
                print(
                    f"[Step {global_step}/{args.max_steps}] loss={total_loss_val:.4f} "
                    f"(diff={loss_diff_val:.4f}, stop={loss_stop_val:.4f}) lr={cur_lr:.2e}",
                    flush=True,
                )

                if global_step % args.save_every == 0 or global_step == args.max_steps:
                    ckpt_dir = output_dir / f"step_{global_step}"
                    save_lora_checkpoint(model, lora_cfg, ckpt_dir, global_step)
                    latest_path = save_lora_checkpoint(
                        model, lora_cfg, output_dir, global_step
                    )
                    print(f"[+] Saved LoRA weights to: {latest_path}", flush=True)

                if global_step >= args.max_steps:
                    break

    elapsed = time.perf_counter() - t0
    print(
        f"[✓] Fine-tuning complete in {elapsed:.1f}s! Latest LoRA checkpoint: {output_dir / 'lora_weights.safetensors'}",
        flush=True,
    )


if __name__ == "__main__":
    main()

