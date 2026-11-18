"""meta: /health и /api/meta."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Request
from sqlalchemy import text

from ..config import get_settings
from ..db import engine
from ..errors import KeitaroApiError, KeitaroUnavailable
from ..schemas import HealthOut, MetaOut

log = logging.getLogger("adrobot.meta")

router = APIRouter()


@router.get("/health", response_model=HealthOut, tags=["meta"])
async def health(request: Request) -> HealthOut:
    db = "ok"
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001
        log.exception("db health check failed")
        db = "error"

    settings = get_settings()
    if not settings.is_configured:
        keitaro = "unconfigured"
    else:
        try:
            await request.app.state.keitaro.list_campaigns()
            keitaro = "ok"
        except KeitaroUnavailable:
            keitaro = "unreachable"
        except KeitaroApiError as exc:
            log.warning("keitaro health check failed: %s", exc)
            keitaro = "unreachable"
    return HealthOut(status="ok", keitaro=keitaro, db=db)


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
