"""Тесты операций аудита и поведения при сбое БД."""

from __future__ import annotations

from sqlalchemy.exc import OperationalError


def test_operations_empty(client, api):
    resp = client.get("/api/operations")
    assert resp.status_code == 200
    assert resp.json()["items"] == []


def test_operations_db_failure_reported_safely(client, api, monkeypatch):
    """Сбой БД → 500 с безопасным сообщением, без внутренностей исключения."""

    def broken_session():
        raise OperationalError("SELECT 1", {}, Exception("db is gone"))

    monkeypatch.setattr("app.routers.operations.SessionLocal", broken_session)
    resp = client.get("/api/operations")
    assert resp.status_code == 500
    body = resp.json()["error"]
    assert body["code"] == "internal"
    assert "db is gone" not in body["message"]
