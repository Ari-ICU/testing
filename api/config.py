"""API Configuration and Path Definitions."""

from pathlib import Path
import sys

# Project root directory
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Paths & Directories
API_DIR = Path(__file__).resolve().parent

GENERATED_DIR = PROJECT_ROOT / "benchmarks" / "outputs" / "api_generated"
GENERATED_DIR.mkdir(parents=True, exist_ok=True)

CUSTOM_WAV_DIR = PROJECT_ROOT / "dataset" / "processed" / "custom_16k"
CUSTOM_WAV_DIR.mkdir(parents=True, exist_ok=True)

REAL_KHMER_DIR = PROJECT_ROOT / "dataset" / "processed" / "real_khmer_16k"
TRAIN_MANIFEST_PATH = PROJECT_ROOT / "dataset" / "demo_train.jsonl"
LORA_OUTPUT_DIR = PROJECT_ROOT / "models" / "voxcpm2_khmer_lora"
FINETUNE_LOG_PATH = LORA_OUTPUT_DIR / "finetune_console.log"
VOICES_DIR = PROJECT_ROOT / "dataset" / "voices"
OUTPUTS_DIR = PROJECT_ROOT / "benchmarks" / "outputs"

