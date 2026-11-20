"""Тесты поиска офферов (автокомплит)."""

from __future__ import annotations

import httpx
from conftest import API

OFFERS = [
    {"id": 1, "name": "Alpha offer", "country": "US", "state": "active"},
    {"id": 2, "name": "Beta offer", "country": "DE", "state": "active"},
    {"id": 12, "name": "Gamma", "country": "UZ", "state": "active"},
    {"id": 3, "name": "Archived", "state": "deleted"},
]


def _mock_offers(api, offers=None):
    route = api.get(f"{API}/offers").mock(
        return_value=httpx.Response(200, json=offers if offers is not None else OFFERS)
    )
    return route


def test_search_all(client, api):
    _mock_offers(api)
    resp = client.get("/api/offers")
    assert resp.status_code == 200
    ids = [item["id"] for item in resp.json()["items"]]
    assert ids == [1, 2, 12]  # архивные исключены, сортировка по id


def test_search_by_name(client, api):
    _mock_offers(api)
    resp = client.get("/api/offers", params={"q": "alp"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert [item["name"] for item in items] == ["Alpha offer"]


def test_search_by_id_prefix(client, api):
    _mock_offers(api)
    resp = client.get("/api/offers", params={"q": "12"})
    items = resp.json()["items"]
    assert [item["id"] for item in items] == [12]


def test_search_cached(client, api):
    route = _mock_offers(api)
    client.get("/api/offers")
    client.get("/api/offers", params={"q": "beta"})
    assert route.call_count == 1  # второй запрос идёт из кэша


def test_country_as_list_is_normalized(client, api):
    """Регрессия: реальный Keitaro отдаёт offer.country МАССИВОМ (["Peru"]),
    а не строкой — сервис должен нормализовать, а не падать с 500."""
    _mock_offers(
        api,
        [
            {"id": 5, "name": "List country", "country": ["Peru", "Chile"], "state": "active"},
            {"id": 6, "name": "String country", "country": "US", "state": "active"},
            {"id": 7, "name": "No country", "state": "active"},
        ],
    )
    resp = client.get("/api/offers")
    assert resp.status_code == 200
    items = {item["id"]: item for item in resp.json()["items"]}
    assert items[5]["country"] == "Peru, Chile"
    assert items[6]["country"] == "US"
    assert items[7]["country"] is None
