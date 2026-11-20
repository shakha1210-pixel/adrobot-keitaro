"""Точка входа FastAPI: Adrobot — обёртка над Keitaro Admin API.

Запуск: uvicorn app.main:app --reload  →  http://127.0.0.1:8000
"""

from __future__ import annotations

import logging
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
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


class NoCacheStaticFiles(StaticFiles):
    """Статика всегда отдаётся с Cache-Control: no-cache.

    Фронтенд обновляется без хешированных имён файлов, поэтому кеш браузера
    может смешать старый app.js с новым index.html (пустые подписи, мёртвый
    переключатель языка). no-cache гарантирует свежие ассеты при каждой загрузке.
    """

    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response


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


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    """Корреляционный ID: принимает X-Request-ID клиента или генерирует свой."""
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


app.include_router(meta.router)  # /health, /health/live, /health/ready, /api/meta
app.include_router(offers.router)  # /api/offers
app.include_router(campaigns.router)  # /api/campaigns...
app.include_router(operations.router)  # /api/operations

app.mount("/", NoCacheStaticFiles(directory=STATIC_DIR, html=True), name="static")
