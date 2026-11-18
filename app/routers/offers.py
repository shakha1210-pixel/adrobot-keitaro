"""offers: автокомплит офферов Keitaro."""

from __future__ import annotations

from fastapi import APIRouter, Request

from ..schemas import OfferListOut, OfferOut

router = APIRouter()


@router.get("/api/offers", response_model=OfferListOut, tags=["offers"])
async def search_offers(request: Request, q: str | None = None) -> OfferListOut:
    items = await request.app.state.offer_search.search(q)
    return OfferListOut(
        items=[
            OfferOut(
                id=o.id,
                name=o.name,
                country=o.country,
                payout_value=o.payout_value,
                payout_currency=o.payout_currency,
                state=o.state,
            )
            for o in items
        ]
    )
