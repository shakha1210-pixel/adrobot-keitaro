"""Тесты создателя кампаний: happy path, валидация, откат."""

from __future__ import annotations

import httpx
from conftest import API, echo_json, json_response

CAMPAIGN = {
    "id": 734,
    "alias": "test-familiya-campaign1-ab12cd",
    "name": "test_familiya_campaign1",
    "type": "position",
    "state": "active",
    "domain_id": 3,
    "group_id": 7,
    "traffic_source_id": 5,
    "cost_type": "CPC",
    "cost_value": "0.0000",
    "cost_currency": "USD",
    "updated_at": "2026-11-19 10:00:00",
}

STREAMS = [
    {
        "id": 1281,
        "campaign_id": 734,
        "type": "regular",
        "name": "UZ → Google",
        "position": 1,
        "state": "active",
        "schema": "redirect",
        "action_type": "http",
        "action_payload": "https://google.com",
        "filters": [{"id": 386, "name": "country", "mode": "accept", "payload": ["UZ"]}],
        "offers": [],
    },
    {
        "id": 1282,
        "campaign_id": 734,
        "type": "regular",
        "name": "→ Offer Twelve",
        "position": 2,
        "state": "active",
        "schema": "landings",
        "action_type": "http",
        "offers": [{"id": 41, "offer_id": 12, "share": 100, "state": "active"}],
    },
]


def _register_world(api):
    api.get(f"{API}/offers/12").mock(
        return_value=json_response({"id": 12, "name": "Offer Twelve", "state": "active"})
    )
    api.post(f"{API}/campaigns").mock(return_value=json_response(CAMPAIGN))
    api.post(f"{API}/streams").mock(side_effect=echo_json)
    api.get(f"{API}/campaigns/734/streams").mock(return_value=json_response(STREAMS))


def test_create_happy_path(client, api):
    _register_world(api)
    resp = client.post(
        "/api/campaigns",
        json={"name": "test_familiya_campaign1", "geo": "uz", "offer_id": 12},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()

    assert body["campaign"]["id"] == 734
    assert body["campaign"]["domain"] == "in.posdk.xyz"
    assert body["campaign"]["url"] == "https://in.posdk.xyz/test-familiya-campaign1-ab12cd"
    assert len(body["streams"]) == 2

    geo_stream = body["streams"][0]
    assert geo_stream["position"] == 1
    assert geo_stream["schema"] == "redirect"
    assert geo_stream["action_payload"] == "https://google.com"
    assert geo_stream["filters"] == [{"name": "country", "mode": "accept", "payload": ["UZ"]}]

    offer_stream = body["streams"][1]
    assert offer_stream["schema"] == "landings"  # реальный Keitaro: офферы в landings-схеме
    assert offer_stream["is_offer_stream"] is True
    assert offer_stream["offers"][0]["offer_id"] == 12
    assert offer_stream["offers"][0]["share"] == 100
    assert offer_stream["offers"][0]["offer_name"] == "Offer Twelve"

    # payload кампании содержит домен/группу/источник
    campaign_req = api.post(f"{API}/campaigns").calls[0].request
    sent = campaign_req.content and __import__("json").loads(campaign_req.content)
    assert sent["domain_id"] == 3
    assert sent["group_id"] == 7
    assert sent["traffic_source_id"] == 5
    assert sent["alias"].startswith("test-familiya-campaign1-")

    # payload потоков: сначала гео-поток, затем офферный
    import json as _json

    first = _json.loads(api.post(f"{API}/streams").calls[0].request.content)
    second = _json.loads(api.post(f"{API}/streams").calls[1].request.content)
    assert first["position"] == 1 and first["schema"] == "redirect"
    # Реальный Keitaro использует name="country", mode="accept"
    assert first["filters"] == [{"name": "country", "mode": "accept", "payload": ["UZ"]}]
    assert second["position"] == 2 and second["schema"] == "landings"
    assert second["action_type"] == "http"  # обязателен на реальном Keitaro
    assert second["offers"] == [{"offer_id": 12, "share": 100}]

    # аудит: успешная операция
    ops = client.get("/api/operations").json()["items"]
    assert len(ops) == 1
    assert ops[0]["action"] == "create_campaign"
    assert ops[0]["status"] == "ok"
    assert ops[0]["keitaro_campaign_id"] == 734


def test_validation_bad_prefix(client, api):
    _register_world(api)
    resp = client.post("/api/campaigns", json={"name": "wrong_name", "geo": "UZ", "offer_id": 12})
    assert resp.status_code == 422
    body = resp.json()
    assert body["error"]["code"] == "validation"
    assert "префикс" in body["error"]["message"]


def test_validation_bad_geo(client, api):
    _register_world(api)
    for geo in ("UZB", "U1", "ZZ"):
        resp = client.post(
            "/api/campaigns",
            json={"name": "test_familiya_c1", "geo": geo, "offer_id": 12},
        )
        assert resp.status_code == 422, f"geo={geo}"
        assert resp.json()["error"]["code"] == "validation"


def test_offer_not_found(client, api):
    _register_world(api)
    api.get(f"{API}/offers/12").mock(
        return_value=httpx.Response(404, json={"message": "Offer not found"})
    )
    resp = client.post(
        "/api/campaigns", json={"name": "test_familiya_c1", "geo": "UZ", "offer_id": 12}
    )
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "not_found"


def test_rollback_on_stream_failure(client, api):
    _register_world(api)
    api.post(f"{API}/streams").mock(return_value=httpx.Response(500, json={"message": "boom"}))
    delete_route = api.delete(f"{API}/campaigns/734").mock(return_value=json_response([]))
    resp = client.post(
        "/api/campaigns", json={"name": "test_familiya_c1", "geo": "UZ", "offer_id": 12}
    )
    assert resp.status_code == 502
    # POST /streams не повторяется (мутация): 5xx = неоднозначный исход,
    # сервис откатывает созданную кампанию и просит свериться с админкой.
    assert resp.json()["error"]["code"] == "keitaro_ambiguous"
    assert delete_route.call_count == 1  # кампания откачена (архивирована)

    ops = client.get("/api/operations").json()["items"]
    assert ops[0]["action"] == "create_campaign"
    assert ops[0]["status"] == "error"


def test_rollback_when_verification_fails(client, api):
    """Регрессия: потоки созданы, но финальный GET /streams упал — кампания
    не должна остаться в Keitaro без ответа клиенту (откат)."""
    _register_world(api)
    api.get(f"{API}/campaigns/734/streams").mock(
        side_effect=httpx.ConnectError("verification failed")
    )
    delete_route = api.delete(f"{API}/campaigns/734").mock(return_value=json_response([]))
    resp = client.post(
        "/api/campaigns", json={"name": "test_familiya_c1", "geo": "UZ", "offer_id": 12}
    )
    assert resp.status_code == 502
    assert delete_route.call_count == 1  # кампания откачена

    ops = client.get("/api/operations").json()["items"]
    assert ops[0]["action"] == "create_campaign"
    assert ops[0]["status"] == "error"


def test_rollback_when_streams_incomplete(client, api):
    """Регрессия: GET вернул только один поток (HTTP 200, но список неполный) —
    кампания не должна объявляться успешной, откатываем."""
    _register_world(api)
    api.get(f"{API}/campaigns/734/streams").mock(return_value=json_response([STREAMS[0]]))
    delete_route = api.delete(f"{API}/campaigns/734").mock(return_value=json_response([]))
    resp = client.post(
        "/api/campaigns", json={"name": "test_familiya_c1", "geo": "UZ", "offer_id": 12}
    )
    assert resp.status_code == 502
    body = resp.json()["error"]
    assert body["code"] == "keitaro_error"
    assert "2 потока" in body["message"]
    assert delete_route.call_count == 1


def test_rollback_when_offer_stream_misconfigured(client, api):
    """Регрессия: офферный поток вернулся с неверной долей — откат."""
    _register_world(api)
    bad_offer_stream = {
        **STREAMS[1],
        "offers": [{"id": 41, "offer_id": 12, "share": 50, "state": "active"}],
    }
    api.get(f"{API}/campaigns/734/streams").mock(
        return_value=json_response([STREAMS[0], bad_offer_stream])
    )
    delete_route = api.delete(f"{API}/campaigns/734").mock(return_value=json_response([]))
    resp = client.post(
        "/api/campaigns", json={"name": "test_familiya_c1", "geo": "UZ", "offer_id": 12}
    )
    assert resp.status_code == 502
    assert "Офферный поток" in resp.json()["error"]["message"]
    assert delete_route.call_count == 1


def test_name_in_archive_conflict(client, api):
    """Регрессия: Keitaro запрещает имя архивной кампании — сервис должен
    вернуть понятный 409, а не прятать причину за 502."""
    _register_world(api)
    api.post(f"{API}/campaigns").mock(
        return_value=httpx.Response(
            422, json={"name": ["Name has already been used in the archive"]}
        )
    )
    resp = client.post(
        "/api/campaigns", json={"name": "test_familiya_c1", "geo": "UZ", "offer_id": 12}
    )
    assert resp.status_code == 409
    body = resp.json()["error"]
    assert body["code"] == "conflict"
    assert "архиве" in body["message"]

    ops = client.get("/api/operations").json()["items"]
    assert ops[0]["action"] == "create_campaign"
    assert ops[0]["status"] == "error"
