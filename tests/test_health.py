"""Тесты observability: live/ready, корреляционный ID, отсутствие утечек."""

from __future__ import annotations

import httpx
from conftest import API

from app.config import Settings


def test_live_always_ok(client, api):
    resp = client.get("/health/live")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_ready_ok_when_deps_ok(client, api):
    resp = client.get("/health/ready")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready"
    assert body["db"] == "ok"
    assert body["keitaro"] == "ok"


def test_ready_503_when_keitaro_down(client, api):
    api.get(f"{API}/campaigns").mock(side_effect=httpx.ConnectError("down"))
    resp = client.get("/health/ready")
    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "not_ready"
    assert body["keitaro"] == "unreachable"


def test_ready_503_when_unconfigured(client, api, monkeypatch):
    monkeypatch.setattr(
        "app.routers.meta.get_settings",
        lambda: Settings(keitaro_api_key=""),
    )
    resp = client.get("/health/ready")
    assert resp.status_code == 503
    assert resp.json()["keitaro"] == "unconfigured"


def test_health_keeps_200_with_detail_when_down(client, api):
    api.get(f"{API}/campaigns").mock(side_effect=httpx.ConnectError("down"))
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["keitaro"] == "unreachable"


def test_keitaro_error_details_not_leaked(client, api):
    """Регрессия: внутренности Keitaro (текст его ошибок) не должны попадать клиенту."""
    api.get(f"{API}/offers").mock(
        return_value=httpx.Response(401, json={"message": "bad api key: internal-secret"})
    )
    resp = client.get("/api/offers")
    assert resp.status_code == 502
    body = resp.json()["error"]
    assert body["code"] == "keitaro_error"
    assert "internal-secret" not in body["message"]
    assert "401" not in body["message"]


def test_request_id_header_present(client, api):
    api.get(f"{API}/offers").mock(return_value=httpx.Response(200, json=[]))
    resp = client.get("/api/offers")
    assert resp.headers.get("X-Request-ID")
    resp = client.get("/api/offers", headers={"X-Request-ID": "trace-42"})
    assert resp.headers["X-Request-ID"] == "trace-42"


def test_static_served_with_no_cache(client, api):
    """Регрессия: статика должна отдаваться с no-cache, иначе браузер
    смешивает старый app.js с новым index.html (пустые подписи, мёртвые кнопки)."""
    for path in ("/", "/app.js", "/styles.css"):
        resp = client.get(path)
        assert resp.status_code == 200
        assert resp.headers.get("Cache-Control") == "no-cache"
