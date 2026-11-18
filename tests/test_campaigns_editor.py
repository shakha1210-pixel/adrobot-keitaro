"""Тесты редактора кампаний: детали, добавление/удаление офферов, доли."""

from __future__ import annotations

import json

import httpx
from conftest import API, json_response

CAMPAIGN = {
    "id": 734,
    "alias": "ab12cd",
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

GEO_STREAM = {
    "id": 1281,
    "campaign_id": 734,
    "type": "regular",
    "name": "UZ → Google",
    "position": 1,
    "state": "active",
    "schema": "redirect",
    "action_type": "http",
    "action_payload": "https://google.com",
    "filters": [{"id": 386, "name": "country_code", "mode": "allow", "payload": ["UZ"]}],
    "offers": [],
}


def _register_world(api, offers=None):
    """Регистрирует моки редактора; state хранит текущие офферы потока 1282."""
    offers = list(
        offers
        if offers is not None
        else [{"id": 41, "offer_id": 4, "share": 100, "state": "active"}]
    )
    state = {"offers": offers}

    def stream_payload():
        return {
            "id": 1282,
            "campaign_id": 734,
            "type": "regular",
            "name": "Offers stream",
            "position": 2,
            "state": "active",
            "schema": "offers",
            # Поля, которыми редактор НЕ управляет, но обязан сохранить при PUT:
            "action_options": {"header": "X-Foo: bar"},
            "comments": "keep me intact",
            "collect_clicks": True,
            "filter_or": True,
            "chance": 14,
            "triggers": [
                {
                    "id": 91,
                    "condition": "always",
                    "target": "stream",
                    "action": "disable",
                    "interval": 60,
                }
            ],
            "landings": [{"id": 46, "landing_id": 26, "share": 100, "state": "active"}],
            "filters": [{"id": 999, "name": "uniqueness", "mode": "reject", "payload": "stream"}],
            "offers": state["offers"],
        }

    api.get(f"{API}/campaigns/734").mock(return_value=json_response(CAMPAIGN))
    api.get(f"{API}/campaigns/734/streams").mock(
        side_effect=lambda _: json_response([GEO_STREAM, stream_payload()])
    )
    api.get(f"{API}/streams/1282").mock(side_effect=lambda _: json_response(stream_payload()))
    api.get(f"{API}/streams/1281").mock(return_value=json_response(GEO_STREAM))
    api.get(f"{API}/offers").mock(
        return_value=json_response(
            [
                {"id": 4, "name": "Offer Four", "state": "active"},
                {"id": 12, "name": "Offer Twelve", "state": "active"},
            ]
        )
    )
    api.get(f"{API}/offers/12").mock(
        return_value=json_response({"id": 12, "name": "Offer Twelve", "state": "active"})
    )
    api.get(f"{API}/offers/4").mock(
        return_value=json_response({"id": 4, "name": "Offer Four", "state": "active"})
    )
    api.post(f"{API}/report/build").mock(
        return_value=json_response(
            {
                "rows": [
                    {
                        "stream_id": "1282",
                        "offer_id": "4",
                        "clicks": 100,
                        "stream_unique_clicks": 80,
                        "bots": 5,
                        "conversions": 7,
                        "cr": "7.00",
                    }
                ]
            }
        )
    )

    def on_put(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        state["offers"] = body.get("offers", [])
        return json_response(body)

    api.put(f"{API}/streams/1282").mock(side_effect=on_put)
    return state


def test_detail_with_stats(client, api):
    _register_world(api)
    resp = client.get("/api/campaigns/734")
    assert resp.status_code == 200
    body = resp.json()
    assert body["campaign"]["id"] == 734
    assert body["campaign"]["domain"] == "in.posdk.xyz"
    assert len(body["streams"]) == 2

    offer_stream = next(s for s in body["streams"] if s["is_offer_stream"])
    offer = offer_stream["offers"][0]
    assert offer["offer_name"] == "Offer Four"
    assert offer["share"] == 100
    assert offer["clicks"] == 100
    assert offer["unique_clicks"] == 80
    assert offer["conversions"] == 7
    assert offer["bots"] == 5
    assert offer["cr"] == 7.0

    stats = body["stats"]
    assert stats["clicks"] == 100
    assert stats["conversions"] == 7
    assert stats["offers"] == 1


def test_add_offer_recalculates_shares(client, api):
    _register_world(api)
    resp = client.post("/api/campaigns/734/streams/1282/offers", json={"offer_id": 12})
    assert resp.status_code == 200, resp.text
    offers = resp.json()["stream"]["offers"]
    assert [o["offer_id"] for o in offers] == [4, 12]
    assert [o["share"] for o in offers] == [50, 50]
    assert sum(o["share"] for o in offers) == 100

    sent = json.loads(api.put(f"{API}/streams/1282").calls[0].request.content)
    assert sent["offers"] == [
        {"id": 41, "offer_id": 4, "share": 50},
        {"offer_id": 12, "share": 50},
    ]

    ops = client.get("/api/operations").json()["items"]
    assert ops[0]["action"] == "add_offer" and ops[0]["status"] == "ok"


def test_add_three_offers_shares(client, api):
    _register_world(api)
    for offer_id in (12, 15):
        api.get(f"{API}/offers/{offer_id}").mock(
            return_value=json_response(
                {"id": offer_id, "name": f"Offer {offer_id}", "state": "active"}
            )
        )
        assert (
            client.post(
                "/api/campaigns/734/streams/1282/offers", json={"offer_id": offer_id}
            ).status_code
            == 200
        )
    resp = client.get("/api/campaigns/734")
    shares = resp.json()["streams"][1]["offers"]
    assert [o["share"] for o in shares] == [34, 33, 33]
    assert sum(o["share"] for o in shares) == 100


def test_add_duplicate_conflict(client, api):
    _register_world(api)
    resp = client.post("/api/campaigns/734/streams/1282/offers", json={"offer_id": 4})
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "conflict"


def test_add_to_redirect_stream_rejected(client, api):
    _register_world(api)
    resp = client.post("/api/campaigns/734/streams/1281/offers", json={"offer_id": 12})
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "validation"


def test_remove_offer(client, api):
    _register_world(
        api,
        offers=[
            {"id": 41, "offer_id": 4, "share": 50, "state": "active"},
            {"id": 42, "offer_id": 12, "share": 50, "state": "active"},
        ],
    )
    resp = client.delete("/api/campaigns/734/streams/1282/offers/4")
    assert resp.status_code == 200
    offers = resp.json()["stream"]["offers"]
    assert [o["offer_id"] for o in offers] == [12]
    assert offers[0]["share"] == 100

    ops = client.get("/api/operations").json()["items"]
    assert ops[0]["action"] == "remove_offer" and ops[0]["status"] == "ok"


def test_remove_last_offer_conflict(client, api):
    _register_world(api)
    resp = client.delete("/api/campaigns/734/streams/1282/offers/4")
    assert resp.status_code == 409
    assert "последний" in resp.json()["error"]["message"]


def test_remove_unknown_offer_not_found(client, api):
    _register_world(api)
    resp = client.delete("/api/campaigns/734/streams/1282/offers/99")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "not_found"


def test_campaign_not_found(client, api):
    _register_world(api)
    api.get(f"{API}/campaigns/999").mock(
        return_value=httpx.Response(404, json={"message": "Campaign not found"})
    )
    resp = client.get("/api/campaigns/999")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "not_found"


def test_update_preserves_unmanaged_stream_fields(client, api):
    """Регрессия: PUT потока при правке офферов не должен терять triggers,
    comments, filter_or, action_options, chance, landings, filters."""
    _register_world(api)
    resp = client.post("/api/campaigns/734/streams/1282/offers", json={"offer_id": 12})
    assert resp.status_code == 200

    sent = json.loads(api.put(f"{API}/streams/1282").calls[0].request.content)
    assert sent["triggers"][0]["condition"] == "always"
    assert sent["comments"] == "keep me intact"
    assert sent["filter_or"] is True
    assert sent["action_options"] == {"header": "X-Foo: bar"}
    assert sent["chance"] == 14
    assert sent["collect_clicks"] is True
    assert sent["landings"][0]["landing_id"] == 26
    assert sent["filters"][0]["name"] == "uniqueness"
    # Изменены ТОЛЬКО привязки офферов
    assert sent["offers"] == [
        {"id": 41, "offer_id": 4, "share": 50},
        {"offer_id": 12, "share": 50},
    ]


def test_detail_survives_report_failure(client, api):
    """Регрессия: сбой отчёта не должен ронять просмотр кампании."""
    _register_world(api)
    api.post(f"{API}/report/build").mock(
        return_value=httpx.Response(500, json={"message": "report exploded"})
    )
    resp = client.get("/api/campaigns/734")
    assert resp.status_code == 200
    stats = resp.json()["stats"]
    assert stats["clicks"] == 0
    assert stats["conversions"] == 0
    assert resp.json()["streams"][1]["offers"][0]["share"] == 100


def test_add_offer_invalid_id_rejected(client, api):
    _register_world(api)
    resp = client.post("/api/campaigns/734/streams/1282/offers", json={"offer_id": 0})
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "validation"


def test_repeated_add_remove_keeps_shares_consistent(client, api):
    """Повторные операции не должны разъезжать доли: сумма всегда 100%."""
    _register_world(api)
    for offer_id in (12, 15):
        api.get(f"{API}/offers/{offer_id}").mock(
            return_value=json_response(
                {"id": offer_id, "name": f"Offer {offer_id}", "state": "active"}
            )
        )
    # добавить 12
    assert (
        client.post("/api/campaigns/734/streams/1282/offers", json={"offer_id": 12}).status_code
        == 200
    )
    # повторно добавить 12 — конфликт, состояние не меняется
    resp = client.post("/api/campaigns/734/streams/1282/offers", json={"offer_id": 12})
    assert resp.status_code == 409
    # добавить 15 → 3 оффера, доли в сумме 100
    assert (
        client.post("/api/campaigns/734/streams/1282/offers", json={"offer_id": 15}).status_code
        == 200
    )
    # удалить 12 → снова 2 оффера
    assert client.delete("/api/campaigns/734/streams/1282/offers/12").status_code == 200
    final = client.get("/api/campaigns/734").json()["streams"][1]["offers"]
    assert sum(o["share"] for o in final) == 100
    assert all(o["share"] > 0 for o in final)
