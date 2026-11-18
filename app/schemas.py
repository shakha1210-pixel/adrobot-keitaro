"""Pydantic-схемы запросов/ответов нашего API."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator

from .countries import is_valid_country_code


# ---------- Запросы ----------

class CampaignCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255, description="Название кампании (с префиксом)")
    geo: str = Field(min_length=2, max_length=2, description="Гео-код страны ISO-3166 (2 буквы)")
    offer_id: int = Field(gt=0, description="ID оффера в Keitaro")

    @field_validator("geo")
    @classmethod
    def _normalize_geo(cls, v: str) -> str:
        v = v.strip().upper()
        if not is_valid_country_code(v):
            raise ValueError(f"Неизвестный гео-код страны: {v!r}. Используйте ISO-3166 (например, UZ).")
        return v


class AddOfferRequest(BaseModel):
    offer_id: int = Field(gt=0)


# ---------- Ответы ----------

class OfferOut(BaseModel):
    id: int
    name: str
    country: str | None = None
    payout_value: str | None = None
    payout_currency: str | None = None
    state: str | None = None


class OfferListOut(BaseModel):
    items: list[OfferOut]


class FilterOut(BaseModel):
    name: str
    mode: str
    payload: Any = None


class StreamOfferOut(BaseModel):
    id: int | None = None          # id привязки оффера к потоку (stream_offer)
    offer_id: int
    offer_name: str | None = None
    share: int
    clicks: int = 0
    unique_clicks: int = 0
    conversions: int = 0
    bots: int = 0
    cr: float = 0.0


class StreamOut(BaseModel):
    id: int
    name: str
    position: int
    type: str
    state: str
    schema: str
    action_type: str | None = None
    action_payload: str | None = None
    filters: list[FilterOut] = []
    offers: list[StreamOfferOut] = []
    is_offer_stream: bool = False


class CampaignOut(BaseModel):
    id: int
    name: str
    alias: str | None = None
    state: str | None = None
    type: str | None = None
    domain_id: int | None = None
    domain: str | None = None
    group_id: int | None = None
    group: str | None = None
    traffic_source_id: int | None = None
    source: str | None = None
    cost_type: str | None = None
    cost_value: str | None = None
    cost_currency: str | None = None
    url: str | None = None
    updated_at: str | None = None


class CampaignListOut(BaseModel):
    items: list[CampaignOut]


class CampaignStatsOut(BaseModel):
    clicks: int = 0
    unique_clicks: int = 0
    conversions: int = 0
    bots: int = 0
    cr: float = 0.0
    offers: int = 0


class CampaignCreateOut(BaseModel):
    campaign: CampaignOut
    streams: list[StreamOut]


class CampaignDetailOut(BaseModel):
    campaign: CampaignOut
    streams: list[StreamOut]
    stats: CampaignStatsOut


class StreamUpdateOut(BaseModel):
    stream: StreamOut


class OperationOut(BaseModel):
    id: int
    created_at: str
    action: str
    keitaro_campaign_id: int | None = None
    campaign_name: str | None = None
    status: str
    error: str | None = None


class OperationListOut(BaseModel):
    items: list[OperationOut]


class MetaOut(BaseModel):
    prefix: str
    domain: str
    group: str
    source: str
    redirect_url: str
    keitaro_url: str
    admin_url: str
    report: dict


class HealthOut(BaseModel):
    status: str = "ok"
    keitaro: str
    db: str
    version: str = "1.0.0"
