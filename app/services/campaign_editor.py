"""Редактор кампании: просмотр, добавление/удаление офферов, пересчёт долей.

Правило долей: после каждого изменения сумма = 100%, распределение поровну,
остаток от деления отдаётся первым офферам в списке.
"""

from __future__ import annotations

import logging

from ..config import Settings
from ..errors import ConflictError, KeitaroApiError, NotFoundError, ValidationError
from ..keitaro.client import KeitaroClient
from ..keitaro.models import Campaign, Stream, StreamOfferBinding
from ..schemas import CampaignDetailOut, StreamOut
from .audit import log_operation
from .offers import OfferSearchService
from .reference import ReferenceService
from .report import fetch_stream_offer_stats
from .views import build_campaign_out, build_stats_out, build_stream_out

log = logging.getLogger("adrobot.editor")


def distribute_shares(count: int) -> list[int]:
    """Поровну с остатком первым: distribute_shares(3) == [34, 33, 33]."""
    if count <= 0:
        return []
    base, remainder = divmod(100, count)
    return [base + (1 if i < remainder else 0) for i in range(count)]


class CampaignEditorService:
    def __init__(
        self,
        client: KeitaroClient,
        refs: ReferenceService,
        offers: OfferSearchService,
        settings: Settings,
    ):
        self._client = client
        self._refs = refs
        self._offers = offers
        self._settings = settings

    async def _load_campaign(self, campaign_id: int) -> Campaign:
        try:
            data = await self._client.get_campaign(campaign_id)
        except KeitaroApiError as exc:
            if exc.http_status == 404:
                raise NotFoundError(f"Кампания #{campaign_id} не найдена в Keitaro.") from exc
            raise
        if not data.get("id"):
            raise NotFoundError(f"Кампания #{campaign_id} не найдена в Keitaro.")
        return Campaign.from_dict(data)

    async def _load_stream(self, campaign_id: int, stream_id: int) -> Stream:
        try:
            data = await self._client.get_stream(stream_id)
        except KeitaroApiError as exc:
            if exc.http_status == 404:
                raise NotFoundError(f"Поток #{stream_id} не найден в Keitaro.") from exc
            raise
        if not data.get("id"):
            raise NotFoundError(f"Поток #{stream_id} не найден в Keitaro.")
        stream = Stream.from_dict(data)
        if stream.campaign_id != campaign_id:
            raise NotFoundError(f"Поток #{stream_id} не принадлежит кампании #{campaign_id}.")
        return stream

    async def _load_offer(self, offer_id: int) -> dict:
        try:
            offer = await self._client.get_offer(offer_id)
        except KeitaroApiError as exc:
            if exc.http_status == 404:
                raise NotFoundError(f"Оффер #{offer_id} не найден в Keitaro.") from exc
            raise
        if not offer.get("id"):
            raise NotFoundError(f"Оффер #{offer_id} не найден в Keitaro.")
        return offer

    async def detail(self, campaign_id: int) -> CampaignDetailOut:
        campaign = await self._load_campaign(campaign_id)
        streams_data = await self._client.list_streams(campaign_id)
        streams = [
            Stream.from_dict(d)
            for d in streams_data
            if str(d.get("state") or "active") != "deleted"
        ]
        streams.sort(key=lambda s: (s.position, s.id))

        offer_ids = {b.offer_id for s in streams for b in s.offers if b.offer_id}
        offer_names = await self._offers.name_map(offer_ids)
        stats, totals = await fetch_stream_offer_stats(self._client, self._settings, campaign_id)

        streams_out = [build_stream_out(s, offer_names, stats) for s in streams]
        offer_count = sum(len(s.offers) for s in streams_out)
        return CampaignDetailOut(
            campaign=build_campaign_out(campaign, self._refs, self._settings),
            streams=streams_out,
            stats=build_stats_out(totals, offer_count),
        )

    async def _stream_out(self, campaign_id: int, stream_id: int) -> StreamOut:
        detail = await self.detail(campaign_id)
        for stream in detail.streams:
            if stream.id == stream_id:
                return stream
        raise NotFoundError(f"Поток #{stream_id} не найден.")

    def _require_offers_stream(self, stream: Stream) -> None:
        # Реальный Keitaro: офферы живут в schema="landings"; "offers" — legacy.
        if stream.schema not in ("offers", "landings"):
            raise ValidationError(
                "В этом потоке нельзя управлять офферами: он создан для редиректа, "
                "а не для офферов."
            )

    def _update_payload(self, stream: Stream, offers: list[StreamOfferBinding]) -> dict:
        """Тело PUT /streams/{id}.

        Строится от ИСХОДНОГО представления потока (raw из GET), чтобы не
        потерять поля, которыми приложение не управляет: triggers, comments,
        filter_or, chance, action_options, landings и т.д. Меняем только
        привязки офферов (offers) — единственное, чем управляет редактор.
        """
        payload = dict(stream.raw) if stream.raw else {}
        payload["id"] = stream.id
        payload["campaign_id"] = stream.campaign_id
        payload["schema"] = stream.schema
        payload["offers"] = [
            {"id": b.id, "offer_id": b.offer_id, "share": b.share}
            if b.id is not None
            else {"offer_id": b.offer_id, "share": b.share}
            for b in offers
        ]
        return payload

    async def add_offer(self, campaign_id: int, stream_id: int, offer_id: int) -> StreamOut:
        campaign = await self._load_campaign(campaign_id)
        stream = await self._load_stream(campaign_id, stream_id)
        self._require_offers_stream(stream)
        if any(b.offer_id == offer_id for b in stream.offers):
            raise ConflictError("Этот оффер уже добавлен в поток.")
        offer = await self._load_offer(offer_id)

        shares = distribute_shares(len(stream.offers) + 1)
        bindings = [
            StreamOfferBinding(id=b.id, offer_id=b.offer_id, share=shares[i], state=b.state)
            for i, b in enumerate(stream.offers)
        ]
        bindings.append(StreamOfferBinding(offer_id=offer_id, share=shares[-1]))

        await self._client.update_stream(stream_id, self._update_payload(stream, bindings))
        log_operation(
            "add_offer",
            keitaro_campaign_id=campaign_id,
            campaign_name=campaign.name,
            payload={"stream_id": stream_id, "offer_id": offer_id, "offer_name": offer.get("name")},
            status="ok",
        )
        return await self._stream_out(campaign_id, stream_id)

    async def remove_offer(self, campaign_id: int, stream_id: int, offer_id: int) -> StreamOut:
        campaign = await self._load_campaign(campaign_id)
        stream = await self._load_stream(campaign_id, stream_id)
        self._require_offers_stream(stream)

        remaining = [b for b in stream.offers if b.offer_id != offer_id]
        if len(remaining) == len(stream.offers):
            raise NotFoundError(f"Оффер #{offer_id} не найден в этом потоке.")
        if not remaining:
            raise ConflictError("Нельзя удалить последний оффер в потоке: поток останется пустым.")

        shares = distribute_shares(len(remaining))
        bindings = [
            StreamOfferBinding(id=b.id, offer_id=b.offer_id, share=shares[i], state=b.state)
            for i, b in enumerate(remaining)
        ]
        await self._client.update_stream(stream_id, self._update_payload(stream, bindings))
        log_operation(
            "remove_offer",
            keitaro_campaign_id=campaign_id,
            campaign_name=campaign.name,
            payload={"stream_id": stream_id, "offer_id": offer_id},
            status="ok",
        )
        return await self._stream_out(campaign_id, stream_id)
