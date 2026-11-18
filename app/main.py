"""Точка входа FastAPI: Adrobot — обёртка над Keitaro Admin API.

Запуск: uvicorn app.main:app --reload  →  http://127.0.0.1:8000
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .errors import install_error_handlers
from .keitaro.client import KeitaroClient
from .routers import campaigns, meta, offers, operations
from .services.offers import OfferSearchService
from .services.reference import ReferenceService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    keitaro = KeitaroClient(settings)
    app.state.keitaro = keitaro
    app.state.refs = ReferenceService(keitaro, settings)
    app.state.offer_search = OfferSearchService(keitaro, settings)
    yield
    await keitaro.aclose()


app = FastAPI(
    title="Adrobot — обёртка над Keitaro",
    description="Создатель кампаний и редактор офферов поверх Admin API Keitaro.",
    version="1.0.0",
    lifespan=lifespan,
)

install_error_handlers(app)

app.include_router(meta.router)          # /health, /api/meta
app.include_router(offers.router)        # /api/offers
app.include_router(campaigns.router)     # /api/campaigns...
app.include_router(operations.router)    # /api/operations

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
