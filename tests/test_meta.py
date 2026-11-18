"""Тесты /health и /api/meta."""

from __future__ import annotations

import httpx
from conftest import API


def test_health_ok(client, api):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["keitaro"] == "ok"
    assert body["db"] == "ok"


def test_health_keitaro_down(client, api):
    api.get(f"{API}/campaigns").mock(side_effect=httpx.ConnectError("down"))
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["keitaro"] == "unreachable"


def test_meta_ok(client, api):
    resp = client.get("/api/meta")
    assert resp.status_code == 200
    body = resp.json()
    assert body["prefix"] == "test_familiya_"
    assert body["domain"] == "in.posdk.xyz"
    assert body["group"] == "FORTESTS"
    assert body["source"] == "FORTESTS"
    assert body["redirect_url"] == "https://google.com"


def test_meta_missing_domain(client, api):
    api.get(f"{API}/domains").mock(return_value=httpx.Response(200, json=[]))
    resp = client.get("/api/meta")
    assert resp.status_code == 502
    body = resp.json()
    assert body["error"]["code"] == "keitaro_error"
    assert "домен" in body["error"]["message"]
