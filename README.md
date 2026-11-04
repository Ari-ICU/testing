# 🇰🇭 KhmerVoice AI — Khmer Text-to-Speech, Voice Cloning & LoRA Fine-Tuning Studio (Apple M2 Pro 16GB)

A full-stack Khmer Text-to-Speech (TTS), Zero-Shot & Ultimate Voice Cloning, and Parameter-Efficient LoRA Fine-Tuning system optimized for **Apple Silicon (M2 Pro 16GB unified memory)** at **48kHz studio quality**.

---

## ✨ Key Capabilities & Highlights

### 1. Multi-Engine Khmer TTS & Voice Cloning (`inference/engines.py`)
- **`voxcpm2_khmer` (`ravuthz/VoxCPM2-khmer`)**: Community Khmer-adapted VoxCPM 2 checkpoint (~4.9 GB weights) producing 48kHz studio audio with:
  - **Isolated Zero-Shot Timbre Cloning (`reference_wav_path`)**: Extracts pure vocal timbre from any 3–10s WAV/MP3 or browser microphone recording without prompt-text bleed.
  - **Ultimate Prosody + Timbre Cloning (`prompt_wav_path` + `prompt_text`)**: Clones both speaking cadence and vocal timbre when an optional reference transcript is provided.
  - **Dynamic LoRA Adapter Hot-Swapping**: Toggle your custom fine-tuned speaker LoRA (`models/voxcpm2_khmer_lora/lora_weights.safetensors`) on or off directly from the Web Studio.
- **`voxcpm2_base` (`openbmb/VoxCPM2`)**: Official multilingual 2B VoxCPM 2 supporting 30 languages including Khmer at 48kHz.
- **`mms` (`facebook/mms-tts-khm`)**: Ultra-fast (~0.15s/sentence, `RTF ~0.04x`) local VITS single-speaker baseline.
- **`f5_khmer` (`sarunvisoth/khmer-tts-demo`)**: 1,000-hour Khmer F5-TTS via Hugging Face Space API (with automatic local fallback when ZeroGPU quota is reached) or local checkpoint (`KHMER_F5_CKPT`).

### 2. 48kHz Studio Audio DSP & Reference Conditioning
- **Automatic Reference Audio Pre-Conditioning (`clean_reference_audio_file`)**: Custom uploaded WAV/MP3 files and browser microphone recordings are automatically stripped of DC offset and sub-75Hz room rumble, trimmed of outer dead silence, capped to the cleanest 10-second voiced window, and RMS-leveled before conditioning VoxCPM 2.
- **Studio Waveform Mastering (`finalize_waveform`, `smooth_audio_segment`)**:
  - Compresses unnatural mid-sentence diffusion pauses (>180ms) down to natural ~130ms breath pauses.
  - Matches active voiced RMS across multi-sentence chunks so long monologues never drop in volume.
  - Applies zero-phase sub-bass cleanup (<68Hz), subtle 5.2kHz vocal clarity air, transparent syllabic dynamic leveling, high-resolution time-stretching (`0.80x–1.25x`), and soft-knee peak limiting.

### 3. Comprehensive Khmer Linguistic Normalizer (`preprocessing/khmer_normalizer.py`)
- **Unicode NFC & Confusable Repair**: Strips invisible zero-width joiners (`ZWSP`, `ZWNJ`, `ZWJ`) and repairs Thai-to-Khmer diacritic confusables.
- **Lek Too (`ៗ`) Expansion**: Smoothly expands single-word and phrase-tail repetitions without inserting unnatural pause gaps.
- **Dates, Clock Times & Ranges**:
  - Dates: `២/១១/២០២៦` or `02-11-2026` → `ថ្ងៃទីពីរ ខែវិច្ឆិកា ឆ្នាំពីរពាន់ម្ភៃប្រាំមួយ`
  - Times: `០៨:៣០` → `ម៉ោងប្រាំបី សាមសិបនាទី`, `7:00` → `ម៉ោងប្រាំពីរគត់`
  - Ranges & Units: `10-20km` → `ដប់ដល់ម្ភៃ គីឡូម៉ែត្រ`, `32°C` → `សាមសិបពីរ អង្សាសេ`
- **Cambodian Phone Numbers**: Reads `012 345 678` or `+855 12 345 678` digit-by-digit in grouped rhythm (`សូន្យមួយពីរ បីបួនប្រាំ ប្រាំមួយប្រាំពីរប្រាំបី`) instead of as millions.
- **Currencies, Decimals & Percentages**: `៥០០០៛` → `ប្រាំពាន់រៀល`, `$50` → `ហាសិបដុល្លារ`, `99.5%` → `កៅសិបប្រាំបួនក្បៀសប្រាំភាគរយ`.
- **60+ English Tech & Social Loanwords**: Transliterates `AI`, `Telegram`, `Facebook`, `YouTube`, `TikTok`, `Comment`, `Like`, `Subscribe`, `Share`, `WiFi`, `Bluetooth`, `ABA`, `QR`, `MacBook`, `iPhone`, `LoRA`, etc. into natural Khmer phonetics.
- **Clause- & Syllable-Aware Prosody Chunking**: Splits long paragraphs into breath-sized chunks without cutting inside Khmer orthographic syllable clusters or before classifiers (`ខែ`, `ឆ្នាំ`, `រៀល`, `ដុល្លារ`, `នាក់`, `គីឡូ`).

### 4. Real-Time Web Studio & LoRA Fine-Tuning UI (`api/`)
- **Full-Width 60fps Real-Time Waveform Visualizer**:
  - During generation: Streams live autoregressive voice frame energy (`feat_decoder` forward hook) at 300ms intervals and progressive partial audio (`live_partial.wav`) so you see the voice signal growing frame-by-frame and can listen to completed chunks while remaining chunks synthesize.
  - During playback: Full-width high-DPI waveform synced to `<audio>` via `requestAnimationFrame` + Web Audio `AnalyserNode` with emerald played bars, cyan upcoming bars, live moving playhead badge, frequency-reactive bounce, and click-to-seek.
- **In-Browser Microphone WAV Recorder**: Record 16-bit PCM WAV reference voices or LoRA training clips directly in the browser with a live oscilloscope.
- **A/B Voice Comparison**: Pin any generated result (**📌 Pin for A/B Compare**) to compare Pretrained vs. Custom LoRA or different CFG/Speed settings side-by-side.
- **End-to-End Voice Clone LoRA Fine-Tuning (`training/finetune_voxcpm2_khmer.py`)**:
  - Upload or record custom WAV+transcript clips in Tab 2, audition every dataset clip inline, and train LoRA adapters on `base_lm`, `residual_lm`, and `feat_decoder` using gradient checkpointing and cosine LR warmup within 16GB M2 Pro memory.

---

## 📁 Project Architecture

```text
voxcpm/
├── api/
│   ├── main.py                         # Minimal FastAPI application factory & static mounts
│   ├── config.py                       # Centralized filesystem paths & directory constants
│   ├── dependencies.py                 # Thread-safe engine caching, locks & LoRA process handles
│   ├── schemas/                        # Pydantic request & response models
│   │   ├── synthesis.py                # SynthesizeRequest, CloneRequest, NormalizeRequest
│   │   └── finetune.py                 # FinetuneStartRequest, DatasetListResponse
│   ├── routers/                        # Clean modular APIRouters
│   │   ├── voices.py                   # GET /api/models, GET /api/voices
│   │   ├── synthesis.py                # POST /api/synthesize, /api/clone, /api/normalize, GET /api/progress
│   │   ├── finetune.py                 # /api/finetune/dataset/*, /api/finetune/start, stop, status
│   │   └── history.py                  # GET /api/history, DELETE /api/history/{filename}
├── preprocessing/
│   └── khmer_normalizer.py             # Khmer NFC, ៗ, dates, times, phone numbers, currencies, units & chunker
├── inference/
│   ├── engines.py                      # Unified engine adapters, studio DSP mastering & live token hooks
│   └── generate.py                     # CLI speech synthesizer & zero-shot voice cloner
├── training/
│   ├── finetune_voxcpm2_khmer.py       # Stage 3 VoxCPM 2 Khmer LoRA trainer (MPS gradient checkpointing)
│   └── evaluate_finetuned.py           # Side-by-side Pretrained vs. LoRA audio comparison script
├── frontend/                           # Next.js + Motion + Tailwind CSS Flat Studio
│   ├── src/
│   │   ├── app/                        # App Router (page.tsx, layout.tsx, globals.css)
│   │   ├── components/                 # StudioTab, FinetuneTab, HistoryTab
│   │   │   └── ui/                     # CustomDropdown, Button, Card, Slider, Switch, WaveformPlayer
│   │   └── lib/                        # cn & time formatting utilities
│   ├── package.json
│   └── next.config.ts                  # Reverse proxy rewrites to FastAPI 127.0.0.1:8000
├── dataset/
│   ├── voices/
│   │   ├── ref_tinfy.wav               # 🎭 Tinfy — Classic Khmer Comedy Movie Dub (tinfy_khmer_dub)
│   │   ├── ref_pao_chin.wav            # ⚖️ Pao Chin — Judge Bao Deep Booming Khmer Dub (pao_chin_khmer_dub)
│   │   ├── ref_female.wav              # 👩 Sophea — Real Female #1 (f-adt1-0002)
│   │   ├── ref_male.wav                # 👨 Dara — Real Male #1 (m-adt1-0002)
│   │   ├── ref_female_news.wav         # 👩‍💼 Bopha — Real Female #2 (f-adt2-0002)
│   │   ├── ref_male_narrator.wav       # 👨‍🏫 Vannak — Real Male #2 (m-adt1-0001)
│   │   ├── ref_female_youth.wav        # 👧 Chanthou — Real Female #3 (f-adt1-0001)
│   │   ├── ref_male_podcast.wav        # 🎙️ Rithy — Real Male #3 (m-adt2-0002)
│   │   ├── ref_male_heritage.wav       # 🏛️ Sokha — Real Male #4 (m-adt2-0001)
│   │   ├── ref_male_reporter.wav       # 📰 Chan — Phnom Penh News Reporter (grkpp_news)
│   │   └── voices.json                 # Reference transcripts & 10 real Cambodian speaker profiles
│   ├── build_custom_manifest.py        # Restores 10 real Cambodian voices & 32 human training clips
│   └── prepare_openslr42.py            # OpenSLR 42 corpus downloader & cleaner
└── benchmarks/
    ├── suite.py                        # Stage 1 7-category Khmer evaluation suite & HTML report generator
    └── outputs/                        # Generated WAVs, summary.json, and interactive report.html
```

---

## 🚀 Quickstart on Apple Silicon (M2 Pro 16GB)

### 1. Activate Virtual Environment & Install Dependencies
```bash
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Launch the KhmerVoice AI Next.js Studio (Recommended)

Start the FastAPI backend:
```bash
.venv/bin/uvicorn api.main:app --host 127.0.0.1 --port 8000 --reload
```

In a second terminal, start the Next.js frontend:
```bash
cd frontend
npm run dev
```
Open **`http://localhost:3000`** in your browser to use the studio (API documentation is available at `http://127.0.0.1:8000/docs`).
- **Tab 1 — Voice Cloning & Speech Studio**:
  - Choose a preset Khmer script or type your own long-form text.
  - Select **Female (`ស្រី`)**, **Male (`ប្រុស`)**, **Upload Custom Audio (`.wav`/`.mp3`)**, or **Record from Microphone**.
  - Adjust **Guidance (CFG)**, **Diffusion Steps**, and **Speech Speed**, or toggle **Custom LoRA Adapter**.
  - Watch the live frame-by-frame voice signal grow during synthesis, then interact with the 100% full-width real-time waveform player or **📌 Pin for A/B Compare**.
- **Tab 2 — Voice Clone LoRA Fine-Tuning**:
  - Upload or record 3–20 short voice clips with their exact Khmer transcripts, audition each clip inline, and click **🚀 Start LoRA Fine-Tuning** to train your custom speaker adapter on M2 Pro MPS.
- **Tab 3 — Generated Audio Library**:
  - Replay, download, or manage all previously synthesized WAV files.

---

### 3. Generate & Clone Voices from the CLI (`inference/generate.py`)
```bash
# 1. VoxCPM 2 Khmer with built-in Tinfy (ទិនហ្វី) or native Khmer reference voice (48kHz)
.venv/bin/python -m inference.generate \
  --model voxcpm2_khmer \
  --voice tinfy \
  --text "អេ កុំៗៗ អា៎ចង្រៃយក! ឡាន ម៉ូតូ យន្តហោះមិនព្រមជិះ តែមកធ្វើដំណើរតាមផ្លូវទឹកវិញលោកបងអើយ ទឹកឥឡូវទឹកឡើងខ្លាំងណាស់!"

# 2. Zero-Shot Voice Cloning with your own custom reference WAV/MP3
.venv/bin/python -m inference.generate \
  --model voxcpm2_khmer \
  --ref-audio path/to/your_voice.wav \
  --text "នៅម៉ោង ០៨:៣០ ព្រឹក សីតុណ្ហភាព 32°C សូមទាក់ទងមកលេខ 012 345 678 តាម Telegram។"

# 3. Fast local Meta MMS Khmer baseline
.venv/bin/python -m inference.generate \
  --model mms \
  --text "ជម្រាបសួរ! ថ្ងៃទី ២/១១/២០២៦ កាហ្វេមួយកែវតម្លៃ ៥០០០៛។"
```

---

### 4. Run LoRA Fine-Tuning from the CLI (`training/finetune_voxcpm2_khmer.py`)
```bash
# Train a custom Khmer LoRA adapter on M2 Pro MPS (fits comfortably in 16GB RAM)
.venv/bin/python training/finetune_voxcpm2_khmer.py \
  --base-model ravuthz/VoxCPM2-khmer \
  --train-manifest dataset/demo_train.jsonl \
  --output-dir models/voxcpm2_khmer_lora \
  --lora-r 16 \
  --lr 1e-4 \
  --max-steps 30 \
  --save-every 10
```

---

## 🔌 REST API Endpoints (`api/main.py`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Serves the KhmerVoice AI Web Studio (`api/static/index.html`) |
| `POST` | `/api/normalize` | Normalizes Khmer text and returns prosody chunks |
| `GET` | `/api/progress` | Streams real-time token frame peaks, stage, and progressive audio URL |
| `POST` | `/api/clone` | Multipart synthesis + zero-shot or Ultimate voice cloning (non-blocking) |
| `POST` | `/api/synthesize` | JSON-based Khmer speech synthesis |
| `POST` | `/api/cancel` | Immediately aborts active MPS generation via `stop_head` pre-hook |
| `GET` | `/api/finetune/dataset` | Lists clips in `dataset/demo_train.jsonl` with inline audio URLs |
| `POST` | `/api/finetune/dataset/add` | Resamples uploaded/recorded clip to 16kHz and appends to manifest |
| `POST` | `/api/finetune/start` | Unloads inference models and launches LoRA fine-tuning subprocess |
| `GET` | `/api/finetune/status` | Streams live training console logs and step-by-step loss curve |
| `GET` | `/api/history` | Lists generated WAV files in `benchmarks/outputs/api_generated/` |
