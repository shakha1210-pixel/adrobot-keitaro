"""Поиск офферов для автокомплита (кэш списка на N секунд)."""
from __future__ import annotations

import time

from ..config import Settings
from ..keitaro.client import KeitaroClient
from ..keitaro.models import Offer

_ARCHIVED_STATES = {"deleted", "removed", "archived"}


class OfferSearchService:
    def __init__(self, client: KeitaroClient, settings: Settings):
        self._client = client
        self._settings = settings
        self._offers: list[Offer] | None = None
        self._fetched_at: float = 0.0

    def clear(self) -> None:
        self._offers = None
        self._fetched_at = 0.0

    async def _all(self) -> list[Offer]:
        now = time.monotonic()
        if self._offers is None or now - self._fetched_at > self._settings.offers_cache_ttl:
            data = await self._client.list_offers()
            self._offers = [Offer.from_dict(d) for d in data if d.get("id")]
            self._fetched_at = now
        return self._offers

    async def search(self, q: str | None = None, limit: int = 20) -> list[Offer]:
        offers = [
            o for o in await self._all()
            if (o.state or "active").lower() not in _ARCHIVED_STATES
        ]
        if q:
            needle = q.strip().lower()
            offers = [
                o for o in offers
                if needle in o.name.lower() or str(o.id).startswith(needle)
            ]
        offers.sort(key=lambda o: o.id)
        return offers[:limit]

    async def name_map(self, offer_ids: set[int]) -> dict[int, str]:
        result: dict[int, str] = {}
        for o in await self._all():
            if o.id in offer_ids:
                result[o.id] = o.name
        return result
