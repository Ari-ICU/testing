"""Stage 4 — KhmerVoice AI Production FastAPI Server.

Clean Modular Architecture:
- `api.config`: Centralized paths and directory constants
- `api.dependencies`: Engine caching, PyTorch thread locks, and training process handles
- `api.schemas`: Pydantic models for validation and OpenAPI docs
- `api.routers.voices`: Model metadata & Cambodian voice profiles
- `api.routers.synthesis`: Khmer text normalization, live progress, speech synthesis & cloning
- `api.routers.finetune`: LoRA training dataset manager & background trainer
- `api.routers.history`: Generated audio library & management
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.config import OUTPUTS_DIR, VOICES_DIR
from api.routers import (
    finetune_router,
    history_router,
    synthesis_router,
    voices_router,
)

app = FastAPI(
    title="KhmerVoice AI API",
    description="Natural Khmer Text-to-Speech, Zero-Shot Voice Cloning & LoRA Fine-Tuning Backend API",
    version="2.2.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Cross-Origin Resource Sharing for Next.js & external clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Audio asset mounts (synthesized audio files & sample reference voices)
app.mount("/audio", StaticFiles(directory=str(OUTPUTS_DIR)), name="audio")
app.mount("/voices", StaticFiles(directory=str(VOICES_DIR)), name="voices")

# Include modular API routers
app.include_router(voices_router)
app.include_router(synthesis_router)
app.include_router(finetune_router)
app.include_router(history_router)


@app.get("/")
def api_root() -> dict[str, Any]:
    return {
        "name": "KhmerVoice AI API",
        "status": "online",
        "version": "2.2.0",
        "docs_url": "/docs",
        "frontend_url": "http://localhost:3000",
        "endpoints": {
            "models": "/api/models",
            "voices": "/api/voices",
            "synthesize": "/api/synthesize",
            "clone": "/api/clone",
            "progress": "/api/progress",
            "normalize": "/api/normalize",
            "finetune_dataset": "/api/finetune/dataset",
            "finetune_status": "/api/finetune/status",
            "history": "/api/history",
        },
    }


@app.get("/favicon.ico", include_in_schema=False)
def favicon() -> Response:
    """Handle browser favicon request."""
    return Response(status_code=204)
