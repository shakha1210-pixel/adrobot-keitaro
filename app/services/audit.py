"""Аудит операций: запись в собственную БД (отладка и отчёт)."""

from __future__ import annotations

import logging

from ..db import SessionLocal
from ..models import OperationLog

log = logging.getLogger("adrobot.audit")


def log_operation(
    action: str,
    *,
    keitaro_campaign_id: int | None = None,
    campaign_name: str | None = None,
    payload: dict | None = None,
    status: str = "ok",
    error: str | None = None,
) -> None:
    """Пишет строку в operation_log. Никогда не роняет основной сценарий."""
    try:
        with SessionLocal() as session:
            session.add(
                OperationLog(
                    action=action,
                    keitaro_campaign_id=keitaro_campaign_id,
                    campaign_name=campaign_name,
                    payload=payload,
                    status=status,
                    error=error,
                )
            )
            session.commit()
    except Exception:
        log.exception("failed to write audit record (action=%s)", action)
