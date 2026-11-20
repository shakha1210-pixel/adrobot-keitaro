"""Создатель кампаний: name + geo + offer_id → кампания с двумя потоками.

Поток 1 (позиция 1): фильтр «страна = geo» (allow) → редирект на REDIRECT_URL (Google).
Поток 2 (позиция 2): catch-all → выбранный оффер (доля 100%).

При сбое на шаге потоков созданная кампания удаляется (откат).
"""

from __future__ import annotations

import logging
import re
import secrets

from ..config import Settings
from ..errors import ConflictError, KeitaroApiError, NotFoundError, ValidationError
from ..keitaro.client import KeitaroClient
from ..keitaro.models import Campaign, Stream
from ..schemas import CampaignCreateOut, CampaignCreateRequest
from .audit import log_operation
from .reference import ReferenceService
from .views import build_campaign_out, build_stream_out

log = logging.getLogger("adrobot.creator")

_TRANSLIT = str.maketrans(
    {
        "а": "a",
        "б": "b",
        "в": "v",
        "г": "g",
        "д": "d",
        "е": "e",
        "ё": "e",
        "ж": "zh",
        "з": "z",
        "и": "i",
        "й": "y",
        "к": "k",
        "л": "l",
        "м": "m",
        "н": "n",
        "о": "o",
        "п": "p",
        "р": "r",
        "с": "s",
        "т": "t",
        "у": "u",
        "ф": "f",
        "х": "h",
        "ц": "ts",
        "ч": "ch",
        "ш": "sh",
        "щ": "sch",
        "ъ": "",
        "ы": "y",
        "ь": "",
        "э": "e",
        "ю": "yu",
        "я": "ya",
        "ў": "u",
        "ғ": "g",
        "қ": "q",
        "ҳ": "h",
        "ʻ": "",
        "ʼ": "",
    }
)


def generate_alias(name: str) -> str:
    """Уникальный alias кампании: латиница, цифры, дефис + случайный суффикс."""
    slug = name.lower().translate(_TRANSLIT)
    slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")[:24].strip("-")
    if not slug:
        slug = "campaign"
    return f"{slug}-{secrets.token_hex(3)}"


class CampaignCreatorService:
    def __init__(self, client: KeitaroClient, refs: ReferenceService, settings: Settings):
        self._client = client
        self._refs = refs
        self._settings = settings

    async def _find_offer(self, offer_id: int) -> dict:
        try:
            offer = await self._client.get_offer(offer_id)
        except KeitaroApiError as exc:
            if exc.http_status == 404:
                raise NotFoundError(f"Оффер #{offer_id} не найден в Keitaro.") from exc
            raise
        if not offer.get("id"):
            raise NotFoundError(f"Оффер #{offer_id} не найден в Keitaro.")
        return offer

    @staticmethod
    def _verify_streams(
        streams: list[Stream], req: CampaignCreateRequest, settings: Settings
    ) -> None:
        """Кампания считается успешной только при точном соответствии обоих потоков.

        GET может вернуть пустой/неполный список даже при HTTP 200 — проверяем
        фактическую конфигурацию, иначе откатываем кампанию.
        """
        geo_streams = [s for s in streams if s.schema == "redirect"]
        offer_streams = [s for s in streams if s.schema in ("offers", "landings")]
        if len(geo_streams) != 1 or len(offer_streams) != 1:
            raise KeitaroApiError(
                "Ожидалось ровно 2 потока (редирект + офферный), Keitaro вернул "
                f"{len(streams)} — конфигурация не подтверждена, кампания откачена.",
                public=True,
            )
        geo_stream = geo_streams[0]
        offer_stream = offer_streams[0]

        geo_filter_ok = any(
            f.name == settings.country_filter_name
            and f.mode == settings.country_filter_mode
            and req.geo
            in (f.payload if isinstance(f.payload, list) else str(f.payload or "").split())
            for f in geo_stream.filters
        )
        if not (geo_stream.action_payload == settings.redirect_url and geo_filter_ok):
            raise KeitaroApiError(
                "Гео-поток настроен неверно — конфигурация не подтверждена, кампания откачена.",
                public=True,
            )

        if not (
            len(offer_stream.offers) == 1
            and offer_stream.offers[0].offer_id == req.offer_id
            and offer_stream.offers[0].share == 100
        ):
            raise KeitaroApiError(
                "Офферный поток настроен неверно — конфигурация не подтверждена, "
                "кампания откачена.",
                public=True,
            )

    async def create(self, req: CampaignCreateRequest) -> CampaignCreateOut:
        settings = self._settings
        if not req.name.startswith(settings.campaign_prefix):
            raise ValidationError(
                f"Название кампании должно начинаться с префикса «{settings.campaign_prefix}» "
                f"(например: {settings.campaign_prefix}campaign1)."
            )

        offer = await self._find_offer(req.offer_id)
        offer_name = str(offer.get("name") or f"Оффер #{req.offer_id}")
        refs = await self._refs.resolve()

        campaign_payload = {
            "name": req.name,
            "alias": generate_alias(req.name),
            "type": settings.campaign_type,
            "state": "active",
            "domain_id": refs["domain"]["id"],
            "group_id": refs["group"]["id"],
            "traffic_source_id": refs["source"]["id"],
            "cost_type": "CPC",
            "cost_value": "0",
            "cost_currency": "USD",
            "cost_auto": False,
        }
        try:
            campaign_data = await self._client.create_campaign(campaign_payload)
        except KeitaroApiError as exc:
            if exc.http_status == 422 and "archive" in (exc.message or "").lower():
                # Keitaro запрещает повторно использовать имя архивной кампании.
                log_operation(
                    "create_campaign",
                    campaign_name=req.name,
                    payload={"name": req.name, "geo": req.geo, "offer_id": req.offer_id},
                    status="error",
                    error=str(exc),
                )
                raise ConflictError(
                    "Кампания с таким названием уже есть в архиве Keitaro. "
                    "Используйте другое название (например, добавьте «_2»)."
                ) from exc
            raise
        except Exception as exc:
            # ID неизвестен (ресурс мог быть создан, но Keitaro не подтвердил) —
            # откатить нельзя, фиксируем в аудите и сообщаем о сверке.
            log_operation(
                "create_campaign",
                campaign_name=req.name,
                payload={"name": req.name, "geo": req.geo, "offer_id": req.offer_id},
                status="error",
                error=str(exc),
            )
            raise
        campaign_id = int(campaign_data.get("id") or 0)
        if not campaign_id:
            raise KeitaroApiError("Keitaro не вернул ID созданной кампании.", public=True)

        try:
            await self._client.create_stream(
                {
                    "campaign_id": campaign_id,
                    "type": "regular",
                    "name": f"{req.geo} → Google",
                    "position": 1,
                    "state": "active",
                    "schema": "redirect",
                    "action_type": "http",
                    "action_payload": settings.redirect_url,
                    "collect_clicks": True,
                    "filters": [
                        {
                            "name": settings.country_filter_name,
                            "mode": settings.country_filter_mode,
                            "payload": [req.geo],
                        }
                    ],
                }
            )
            await self._client.create_stream(
                {
                    "campaign_id": campaign_id,
                    "type": "regular",
                    "name": f"→ {offer_name}"[:255],
                    "position": 2,
                    "state": "active",
                    # Реальный Keitaro: офферный поток — это schema="landings"
                    # («Landing pages & offers») с массивом offers; action_type обязателен.
                    "schema": "landings",
                    "action_type": "http",
                    "collect_clicks": True,
                    "offers": [{"offer_id": req.offer_id, "share": 100}],
                }
            )
            # Финальная сверка — тоже внутри rollback-границы: если потоки созданы,
            # а GET упал, кампания не должна остаться «сиротой» без ответа клиенту.
            streams_data = await self._client.list_streams(campaign_id)
            streams = [
                Stream.from_dict(d)
                for d in streams_data
                if str(d.get("state") or "active") != "deleted"
            ]
            # Кампания считается успешной только при точном соответствии обоих потоков.
            self._verify_streams(streams, req, settings)
        except Exception as exc:
            log.error("сбой при создании потоков кампании %s, откатываем: %s", campaign_id, exc)
            try:
                await self._client.delete_campaign(campaign_id)
            except Exception as rollback_exc:
                log.error("не удалось откатить кампанию %s: %s", campaign_id, rollback_exc)
            log_operation(
                "create_campaign",
                keitaro_campaign_id=campaign_id,
                campaign_name=req.name,
                payload={"name": req.name, "geo": req.geo, "offer_id": req.offer_id},
                status="error",
                error=str(exc),
            )
            raise

        offer_names = {req.offer_id: offer_name}
        campaign = Campaign.from_dict(campaign_data)

        log_operation(
            "create_campaign",
            keitaro_campaign_id=campaign_id,
            campaign_name=req.name,
            payload={"name": req.name, "geo": req.geo, "offer_id": req.offer_id},
            status="ok",
        )
        return CampaignCreateOut(
            campaign=build_campaign_out(campaign, self._refs, settings),
            streams=[build_stream_out(s, offer_names, {}) for s in streams],
        )
