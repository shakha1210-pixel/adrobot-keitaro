"""HTTP-клиент Keitaro Admin API v1: таймауты, ретраи, обработка ошибок.

Единственное место, где встречаются URL, заголовок Api-Key и формат ответов Keitaro.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from ..config import Settings
from ..errors import KeitaroApiError, KeitaroUnavailable

log = logging.getLogger("adrobot.keitaro")

_RETRYABLE_STATUS = {429, 500, 502, 503, 504}
_RETRY_DELAY = 0.35  # секунд между попытками


def _extract_message(resp: httpx.Response) -> str:
    try:
        body = resp.json()
    except ValueError:
        body = None
    if isinstance(body, dict):
        for key in ("message", "error", "detail"):
            value = body.get(key)
            if isinstance(value, str) and value.strip():
                return value
        return str(body)[:300]
    if isinstance(body, (list, str)):
        return str(body)[:300]
    return resp.text[:300] or f"HTTP {resp.status_code}"


class KeitaroClient:
    """Асинхронный клиент Admin API v1."""

    def __init__(self, settings: Settings):
        self._settings = settings
        self._client: httpx.AsyncClient | None = None

    async def _ensure_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self._settings.api_base_url,
                headers={
                    "Api-Key": self._settings.keitaro_api_key,
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                timeout=httpx.Timeout(self._settings.keitaro_timeout),
                follow_redirects=True,
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()

    async def _request(self, method: str, path: str, *, params=None, json=None) -> Any:
        client = await self._ensure_client()
        last_error: Exception | None = None
        for attempt in range(self._settings.keitaro_retries + 1):
            try:
                resp = await client.request(method, path, params=params, json=json)
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_error = exc
                log.warning("keitaro %s %s: network error (attempt %d): %s",
                            method, path, attempt + 1, exc)
            else:
                if resp.status_code in _RETRYABLE_STATUS:
                    last_error = KeitaroApiError(
                        f"Keitaro ответил {resp.status_code}: {_extract_message(resp)}",
                        http_status=resp.status_code,
                    )
                    log.warning("keitaro %s %s -> %s (attempt %d)",
                                method, path, resp.status_code, attempt + 1)
                elif resp.status_code >= 400:
                    raise KeitaroApiError(
                        f"Keitaro ответил {resp.status_code}: {_extract_message(resp)}",
                        http_status=resp.status_code,
                    )
                else:
                    try:
                        return resp.json()
                    except ValueError:
                        return None
            if attempt < self._settings.keitaro_retries:
                await asyncio.sleep(_RETRY_DELAY * (attempt + 1))
        raise KeitaroUnavailable() from last_error

    # ---------- Справочники ----------

    async def list_offers(self) -> list[dict]:
        data = await self._request("GET", "/offers")
        return data if isinstance(data, list) else []

    async def list_domains(self) -> list[dict]:
        data = await self._request("GET", "/domains")
        return data if isinstance(data, list) else []

    async def list_groups(self, group_type: str = "campaigns") -> list[dict]:
        data = await self._request("GET", "/groups", params={"type": group_type})
        return data if isinstance(data, list) else []

    async def list_traffic_sources(self) -> list[dict]:
        data = await self._request("GET", "/traffic_sources")
        return data if isinstance(data, list) else []

    # ---------- Кампании ----------

    async def list_campaigns(self) -> list[dict]:
        data = await self._request("GET", "/campaigns")
        return data if isinstance(data, list) else []

    async def get_campaign(self, campaign_id: int) -> dict:
        return await self._request("GET", f"/campaigns/{campaign_id}") or {}

    async def get_offer(self, offer_id: int) -> dict:
        return await self._request("GET", f"/offers/{offer_id}") or {}

    async def create_campaign(self, payload: dict) -> dict:
        return await self._request("POST", "/campaigns", json=payload) or {}

    async def delete_campaign(self, campaign_id: int) -> Any:
        """Перемещает кампанию в архив (soft delete)."""
        return await self._request("DELETE", f"/campaigns/{campaign_id}")

    # ---------- Потоки ----------

    async def list_streams(self, campaign_id: int) -> list[dict]:
        data = await self._request("GET", f"/campaigns/{campaign_id}/streams")
        return data if isinstance(data, list) else []

    async def get_stream(self, stream_id: int) -> dict:
        return await self._request("GET", f"/streams/{stream_id}") or {}

    async def create_stream(self, payload: dict) -> dict:
        return await self._request("POST", "/streams", json=payload) or {}

    async def update_stream(self, stream_id: int, payload: dict) -> dict:
        return await self._request("PUT", f"/streams/{stream_id}", json=payload) or {}

    # ---------- Отчёты ----------

    async def build_report(self, payload: dict) -> dict:
        return await self._request("POST", "/report/build", json=payload) or {}
