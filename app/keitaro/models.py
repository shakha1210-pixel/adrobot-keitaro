"""Типизированные DTO ответов Keitaro Admin API v1.

Исходник контракта: https://gist.github.com/asabirov/3cd29f43de41bd76ab93de073a7883a9
(официальная документация Admin API v1, asabirov — разработчик Keitaro).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


def _to_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


@dataclass
class Offer:
    id: int
    name: str
    country: str | None = None
    payout_value: str | None = None
    payout_currency: str | None = None
    state: str | None = None

    @classmethod
    def from_dict(cls, d: dict) -> Offer:
        return cls(
            id=int(d.get("id", 0)),
            name=str(d.get("name") or ""),
            country=d.get("country"),
            payout_value=str(d.get("payout_value")) if d.get("payout_value") is not None else None,
            payout_currency=d.get("payout_currency"),
            state=d.get("state"),
        )


@dataclass
class Campaign:
    id: int
    name: str
    alias: str | None = None
    state: str | None = None
    type: str | None = None
    domain_id: int | None = None
    domain: str | None = None
    group_id: int | None = None
    traffic_source_id: int | None = None
    cost_type: str | None = None
    cost_value: str | None = None
    cost_currency: str | None = None
    updated_at: str | None = None

    @classmethod
    def from_dict(cls, d: dict) -> Campaign:
        return cls(
            id=int(d.get("id", 0)),
            name=str(d.get("name") or ""),
            alias=d.get("alias"),
            state=d.get("state"),
            type=d.get("type"),
            domain_id=_to_int(d.get("domain_id")),
            domain=d.get("domain") or d.get("domain_name"),
            group_id=_to_int(d.get("group_id")),
            traffic_source_id=_to_int(d.get("traffic_source_id")),
            cost_type=d.get("cost_type"),
            cost_value=str(d.get("cost_value")) if d.get("cost_value") is not None else None,
            cost_currency=d.get("cost_currency"),
            updated_at=d.get("updated_at"),
        )


@dataclass
class StreamFilter:
    name: str
    mode: str
    payload: Any = None
    id: int | None = None  # id фильтра в Keitaro (нужен при обновлении потока)

    @classmethod
    def from_dict(cls, d: dict) -> StreamFilter:
        return cls(
            name=str(d.get("name") or ""),
            mode=str(d.get("mode") or ""),
            payload=d.get("payload"),
            id=_to_int(d.get("id")),
        )


@dataclass
class StreamOfferBinding:
    id: int | None = None  # id привязки (stream_offer)
    offer_id: int = 0
    share: int = 0
    state: str | None = None

    @classmethod
    def from_dict(cls, d: dict) -> StreamOfferBinding:
        return cls(
            id=_to_int(d.get("id")),
            offer_id=int(d.get("offer_id") or 0),
            share=int(d.get("share") or 0),
            state=d.get("state"),
        )


@dataclass
class Stream:
    id: int
    campaign_id: int
    name: str
    type: str = "regular"
    position: int = 1
    state: str = "active"
    schema: str = "offers"
    action_type: str | None = None
    action_payload: str | None = None
    filters: list[StreamFilter] = field(default_factory=list)
    offers: list[StreamOfferBinding] = field(default_factory=list)
    raw: dict = field(default_factory=dict, repr=False)  # исходный payload Keitaro

    @classmethod
    def from_dict(cls, d: dict) -> Stream:
        return cls(
            id=int(d.get("id", 0)),
            campaign_id=int(d.get("campaign_id", 0)),
            name=str(d.get("name") or ""),
            type=str(d.get("type") or "regular"),
            position=int(d.get("position") or 1),
            state=str(d.get("state") or "active"),
            schema=str(d.get("schema") or "offers"),
            action_type=d.get("action_type"),
            action_payload=d.get("action_payload"),
            filters=[StreamFilter.from_dict(f) for f in (d.get("filters") or [])],
            offers=[StreamOfferBinding.from_dict(o) for o in (d.get("offers") or [])],
            raw=dict(d),
        )
