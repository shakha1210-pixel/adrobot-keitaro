"""meta: /health (сводный), /health/live (liveness), /health/ready (readiness), /api/meta.

Разделение семантики:
- live  — жив ли процесс (всегда 200, если приложение поднято);
- ready — готов ли сервис выполнять работу: БД доступна И Keitaro доступен
          (503 при сбое критической зависимости);
- /health — подробный сводный статус для UI (всегда 200, детали в полях).
Ни один из ответов не раскрывает ключи, URL внутренних сервисов или
подробности ошибок интеграции.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request, Response
from sqlalchemy import text

from ..config import get_settings
from ..db import engine
from ..errors import KeitaroApiError, KeitaroUnavailable
from ..schemas import HealthOut, LivenessOut, MetaOut, ReadinessOut

log = logging.getLogger("adrobot.meta")

router = APIRouter()


def _db_status() -> str:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return "ok"
    except Exception:
        log.exception("db health check failed")
        return "error"


async def _keitaro_status(request: Request) -> str:
    settings = get_settings()
    if not settings.is_configured:
        return "unconfigured"
    try:
        await request.app.state.keitaro.list_campaigns()
        return "ok"
    except KeitaroUnavailable:
        return "unreachable"
    except KeitaroApiError as exc:
        log.warning("keitaro health check failed: %s", exc)
        return "unreachable"


@router.get("/health", response_model=HealthOut, tags=["meta"])
async def health(request: Request) -> HealthOut:
    return HealthOut(
        status="ok",
        keitaro=await _keitaro_status(request),
        db=_db_status(),
    )


@router.get("/health/live", response_model=LivenessOut, tags=["meta"])
async def live() -> LivenessOut:
    return LivenessOut(status="ok")


@router.get("/health/ready", response_model=ReadinessOut, tags=["meta"])
async def ready(request: Request, response: Response) -> ReadinessOut:
    db = _db_status()
    keitaro = await _keitaro_status(request)
    is_ready = db == "ok" and keitaro == "ok"
    body = ReadinessOut(
        status="ready" if is_ready else "not_ready",
        db=db,
        keitaro=keitaro,
    )
    if not is_ready:
        response.status_code = 503
    return body


@router.get("/api/meta", response_model=MetaOut, tags=["meta"])
async def meta(request: Request) -> MetaOut:
    settings = get_settings()
    refs = await request.app.state.refs.resolve()
    return MetaOut(
        prefix=settings.campaign_prefix,
        domain=str(refs["domain"]["name"]),
        group=str(refs["group"]["name"]),
        source=str(refs["source"]["name"]),
        redirect_url=settings.redirect_url,
        keitaro_url=settings.keitaro_base_url.rstrip("/"),
        admin_url=settings.admin_url,
        report={"interval": settings.report_interval, "timezone": settings.report_timezone},
    )
