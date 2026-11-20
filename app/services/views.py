"""Преобразование DTO Keitaro в схемы ответов нашего API."""

from __future__ import annotations

import re

from ..config import Settings
from ..keitaro.models import Campaign, Stream
from ..schemas import CampaignOut, CampaignStatsOut, FilterOut, StreamOfferOut, StreamOut
from .reference import ReferenceService
from .report import CampaignTotals, OfferStats


def normalize_domain(name: str | None) -> str | None:
    """Реальный Keitaro отдаёт домен с протоколом и слэшем ("https://kylovoa.com/")."""
    if not name:
        return None
    cleaned = re.sub(r"^https?://", "", str(name).strip()).rstrip("/")
    return cleaned or None


def build_campaign_out(
    campaign: Campaign,
    refs: ReferenceService,
    settings: Settings,
) -> CampaignOut:
    domain = normalize_domain(
        campaign.domain
        or refs.domain_name(campaign.domain_id)
        or settings.default_domain
    )
    url = f"https://{domain}/{campaign.alias}" if domain and campaign.alias else None
    return CampaignOut(
        id=campaign.id,
        name=campaign.name,
        alias=campaign.alias,
        state=campaign.state,
        type=campaign.type,
        domain_id=campaign.domain_id,
        domain=domain,
        group_id=campaign.group_id,
        group=refs.group_name(campaign.group_id),
        traffic_source_id=campaign.traffic_source_id,
        source=refs.source_name(campaign.traffic_source_id),
        cost_type=campaign.cost_type,
        cost_value=campaign.cost_value,
        cost_currency=campaign.cost_currency,
        url=url,
        updated_at=campaign.updated_at,
    )


def build_stream_out(
    stream: Stream,
    offer_names: dict[int, str],
    stats: dict[tuple[int, int], OfferStats],
) -> StreamOut:
    offers: list[StreamOfferOut] = []
    for binding in stream.offers:
        item_stats = stats.get((stream.id, binding.offer_id)) or OfferStats()
        offers.append(
            StreamOfferOut(
                id=binding.id,
                offer_id=binding.offer_id,
                offer_name=offer_names.get(binding.offer_id) or f"Оффер #{binding.offer_id}",
                share=binding.share,
                clicks=item_stats.clicks,
                unique_clicks=item_stats.unique_clicks,
                conversions=item_stats.conversions,
                bots=item_stats.bots,
                cr=item_stats.cr,
            )
        )
    return StreamOut(
        id=stream.id,
        name=stream.name,
        position=stream.position,
        type=stream.type,
        state=stream.state,
        schema=stream.schema,
        action_type=stream.action_type,
        action_payload=stream.action_payload,
        filters=[FilterOut(name=f.name, mode=f.mode, payload=f.payload) for f in stream.filters],
        offers=offers,
        # Реальный Keitaro хранит офферы в потоках schema="landings" («Landing pages & offers»);
        # legacy-значение "offers" сохраняем для совместимости.
        is_offer_stream=stream.schema in ("offers", "landings"),
    )


def build_stats_out(totals: CampaignTotals, offer_count: int) -> CampaignStatsOut:
    return CampaignStatsOut(
        clicks=totals.clicks,
        unique_clicks=totals.unique_clicks,
        conversions=totals.conversions,
        bots=totals.bots,
        cr=totals.cr,
        offers=offer_count,
    )
