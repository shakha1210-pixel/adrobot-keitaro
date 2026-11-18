"""campaigns: создание, список, детали, добавление/удаление офферов."""
from __future__ import annotations

from fastapi import APIRouter, Request

from ..config import get_settings
from ..keitaro.models import Campaign
from ..schemas import (
    AddOfferRequest,
    CampaignCreateOut,
    CampaignCreateRequest,
    CampaignDetailOut,
    CampaignListOut,
    StreamUpdateOut,
)
from ..services.campaign_creator import CampaignCreatorService
from ..services.campaign_editor import CampaignEditorService
from ..services.views import build_campaign_out

router = APIRouter()


def _editor(request: Request) -> CampaignEditorService:
    return CampaignEditorService(
        request.app.state.keitaro,
        request.app.state.refs,
        request.app.state.offer_search,
        get_settings(),
    )


@router.post(
    "/api/campaigns",
    response_model=CampaignCreateOut,
    status_code=201,
    tags=["campaigns"],
)
async def create_campaign(request: Request, body: CampaignCreateRequest) -> CampaignCreateOut:
    service = CampaignCreatorService(
        request.app.state.keitaro, request.app.state.refs, get_settings()
    )
    return await service.create(body)


@router.get("/api/campaigns", response_model=CampaignListOut, tags=["campaigns"])
async def list_campaigns(
    request: Request,
    prefix: bool = True,
    q: str | None = None,
) -> CampaignListOut:
    settings = get_settings()
    data = await request.app.state.keitaro.list_campaigns()
    refs = request.app.state.refs
    items = []
    for d in data:
        if str(d.get("state") or "active") == "deleted":
            continue
        name = str(d.get("name") or "")
        if prefix and not name.startswith(settings.campaign_prefix):
            continue
        if q and q.strip() and not (
            q.strip().lower() in name.lower() or str(d.get("id")).startswith(q.strip())
        ):
            continue
        items.append(build_campaign_out(Campaign.from_dict(d), refs, settings))
    items.sort(key=lambda c: c.id, reverse=True)
    return CampaignListOut(items=items[:200])


@router.get(
    "/api/campaigns/{campaign_id}",
    response_model=CampaignDetailOut,
    tags=["campaigns"],
)
async def campaign_detail(request: Request, campaign_id: int) -> CampaignDetailOut:
    return await _editor(request).detail(campaign_id)


@router.post(
    "/api/campaigns/{campaign_id}/streams/{stream_id}/offers",
    response_model=StreamUpdateOut,
    tags=["campaigns"],
)
async def add_offer(
    request: Request,
    campaign_id: int,
    stream_id: int,
    body: AddOfferRequest,
) -> StreamUpdateOut:
    stream = await _editor(request).add_offer(campaign_id, stream_id, body.offer_id)
    return StreamUpdateOut(stream=stream)


@router.delete(
    "/api/campaigns/{campaign_id}/streams/{stream_id}/offers/{offer_id}",
    response_model=StreamUpdateOut,
    tags=["campaigns"],
)
async def remove_offer(
    request: Request,
    campaign_id: int,
    stream_id: int,
    offer_id: int,
) -> StreamUpdateOut:
    stream = await _editor(request).remove_offer(campaign_id, stream_id, offer_id)
    return StreamUpdateOut(stream=stream)
