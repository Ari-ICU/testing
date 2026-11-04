"""Modular API Routers."""

from .finetune import router as finetune_router
from .history import router as history_router
from .synthesis import router as synthesis_router
from .voices import router as voices_router

__all__ = [
    "finetune_router",
    "history_router",
    "synthesis_router",
    "voices_router",
]

