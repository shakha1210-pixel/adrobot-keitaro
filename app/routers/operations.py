"""operations: история операций (аудит из собственной БД)."""
from __future__ import annotations

from fastapi import APIRouter, Query

from ..db import SessionLocal
from ..models import OperationLog
from ..schemas import OperationListOut, OperationOut

router = APIRouter()


def _iso_utc(dt) -> str:
    text = dt.isoformat()
    return text + "Z" if dt.tzinfo is None else text.replace("+00:00", "Z")


@router.get("/api/operations", response_model=OperationListOut, tags=["operations"])
def list_operations(limit: int = Query(default=50, ge=1, le=200)) -> OperationListOut:
    with SessionLocal() as session:
        rows = (
            session.query(OperationLog)
            .order_by(OperationLog.id.desc())
            .limit(limit)
            .all()
        )
        items = [
            OperationOut(
                id=r.id,
                created_at=_iso_utc(r.created_at),
                action=r.action,
                keitaro_campaign_id=r.keitaro_campaign_id,
                campaign_name=r.campaign_name,
                status=r.status,
                error=r.error,
            )
            for r in rows
        ]
    return OperationListOut(items=items)
