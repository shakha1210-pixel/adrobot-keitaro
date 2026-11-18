"""Справочники Keitaro: домен/группа/источник по имени → ID (с кэшем на время жизни процесса)."""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from ..config import Settings
from ..errors import KeitaroApiError
from ..keitaro.client import KeitaroClient

log = logging.getLogger("adrobot.reference")


def _find_by_name(items: list[dict], name: str) -> dict | None:
    wanted = name.strip().lower()
    for item in items:
        if str(item.get("name") or "").strip().lower() == wanted:
            return item
    return None


class ReferenceService:
    """Резолвит имена из .env в ID Keitaro. Кэш живёт до перезапуска процесса."""

    def __init__(self, client: KeitaroClient, settings: Settings):
        self._client = client
        self._settings = settings
        self._lock = asyncio.Lock()
        self._refs: dict[str, dict] | None = None  # domain/group/source -> {id, name, raw}
        self._domains: list[dict] = []
        self._groups: list[dict] = []
        self._sources: list[dict] = []

    def clear(self) -> None:
        self._refs = None
        self._domains, self._groups, self._sources = [], [], []

    async def resolve(self) -> dict[str, dict]:
        if self._refs is not None:
            return self._refs
        async with self._lock:
            if self._refs is not None:
                return self._refs
            domains = await self._client.list_domains()
            groups = await self._client.list_groups("campaigns")
            sources = await self._client.list_traffic_sources()

            domain = _find_by_name(domains, self._settings.default_domain)
            group = _find_by_name(groups, self._settings.default_group)
            source = _find_by_name(sources, self._settings.default_source)

            missing = []
            if domain is None:
                missing.append(f"домен «{self._settings.default_domain}»")
            if group is None:
                missing.append(f"группа «{self._settings.default_group}»")
            if source is None:
                missing.append(f"источник «{self._settings.default_source}»")
            if missing:
                raise KeitaroApiError(
                    "Не найдено в Keitaro: " + ", ".join(missing)
                    + ". Проверьте DEFAULT_DOMAIN / DEFAULT_GROUP / DEFAULT_SOURCE в .env."
                )

            self._domains, self._groups, self._sources = domains, groups, sources
            self._refs = {
                "domain": {"id": int(domain["id"]), "name": domain.get("name")},
                "group": {"id": int(group["id"]), "name": group.get("name")},
                "source": {"id": int(source["id"]), "name": source.get("name")},
            }
            log.info("reference resolved: domain=%s group=%s source=%s",
                     self._refs["domain"]["id"], self._refs["group"]["id"], self._refs["source"]["id"])
            return self._refs

    def domain_name(self, domain_id: int | None) -> str | None:
        for item in self._domains:
            if item.get("id") == domain_id:
                return item.get("name")
        return None

    def group_name(self, group_id: int | None) -> str | None:
        for item in self._groups:
            if item.get("id") == group_id:
                return item.get("name")
        return None

    def source_name(self, source_id: int | None) -> str | None:
        for item in self._sources:
            if item.get("id") == source_id:
                return item.get("name")
        return None

    def any_resolved(self) -> bool:
        return self._refs is not None
