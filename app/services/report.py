"""Статистика по офферам потоков из отчёта Keitaro (POST /report/build)."""
from __future__ import annotations

import logging
from dataclasses import dataclass

from ..config import Settings
from ..keitaro.client import KeitaroClient

log = logging.getLogger("adrobot.report")


def _to_int(value) -> int:
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return 0


def _to_float(value) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


@dataclass
class OfferStats:
    clicks: int = 0
    unique_clicks: int = 0
    conversions: int = 0
    bots: int = 0
    cr: float = 0.0

    @classmethod
    def from_row(cls, row: dict) -> "OfferStats":
        return cls(
            clicks=_to_int(row.get("clicks")),
            unique_clicks=_to_int(row.get("stream_unique_clicks")),
            conversions=_to_int(row.get("conversions")),
            bots=_to_int(row.get("bots")),
            cr=_to_float(row.get("cr")),
        )


@dataclass
class CampaignTotals:
    clicks: int = 0
    unique_clicks: int = 0
    conversions: int = 0
    bots: int = 0

    @property
    def cr(self) -> float:
        return round(self.conversions * 100.0 / self.clicks, 1) if self.clicks else 0.0


def _report_payload(settings: Settings, campaign_id: int) -> dict:
    return {
        "range": {"interval": settings.report_interval, "timezone": settings.report_timezone},
        "grouping": ["stream_id", "offer_id"],
        "metrics": ["clicks", "stream_unique_clicks", "bots", "conversions", "cr"],
        "filters": [
            {"name": "campaign_id", "operator": "EQUALS", "expression": campaign_id}
        ],
        "sort": [{"name": "clicks", "order": "DESC"}],
    }


async def fetch_stream_offer_stats(
    client: KeitaroClient, settings: Settings, campaign_id: int
) -> tuple[dict[tuple[int, int], OfferStats], CampaignTotals]:
    """Ключ результата — (stream_id, offer_id). Отказ отчёта не роняет сценарий."""
    try:
        data = await client.build_report(_report_payload(settings, campaign_id))
        rows = data.get("rows", []) if isinstance(data, dict) else []
    except Exception as exc:  # noqa: BLE001
        log.warning("report/build failed for campaign %s: %s", campaign_id, exc)
        return {}, CampaignTotals()

    stats: dict[tuple[int, int], OfferStats] = {}
    totals = CampaignTotals()
    for row in rows:
        try:
            stream_id = int(row.get("stream_id") or 0)
            offer_id = int(row.get("offer_id") or 0)
        except (TypeError, ValueError):
            continue
        if offer_id <= 0:
            continue
        item = OfferStats.from_row(row)
        stats[(stream_id, offer_id)] = item
        totals.clicks += item.clicks
        totals.unique_clicks += item.unique_clicks
        totals.conversions += item.conversions
        totals.bots += item.bots
    return stats, totals
