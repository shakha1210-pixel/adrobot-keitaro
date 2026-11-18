"""DI-зависимости: доступ к сервисам из app.state (создаются в lifespan)."""
from __future__ import annotations

from fastapi import Request

from .keitaro.client import KeitaroClient
from .services.offers import OfferSearchService
from .services.reference import ReferenceService


def get_keitaro(request: Request) -> KeitaroClient:
    return request.app.state.keitaro


def get_refs(request: Request) -> ReferenceService:
    return request.app.state.refs


def get_offer_search(request: Request) -> OfferSearchService:
    return request.app.state.offer_search
