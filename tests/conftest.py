"""Фикстуры pytest: окружение, БД, клиент, моки справочников Keitaro."""

from __future__ import annotations

import json
import os
from pathlib import Path

# Окружение ДО импорта приложения
os.environ.setdefault("KEITARO_BASE_URL", "https://keitaro.test")
os.environ.setdefault("KEITARO_API_KEY", "test-key")
os.environ.setdefault("CAMPAIGN_PREFIX", "test_familiya_")
os.environ.setdefault("DEFAULT_DOMAIN", "in.posdk.xyz")
os.environ.setdefault("DEFAULT_GROUP", "FORTESTS")
os.environ.setdefault("DEFAULT_SOURCE", "FORTESTS")
os.environ.setdefault("REDIRECT_URL", "https://google.com")
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_adrobot.db")
os.environ.setdefault("KEITARO_RETRIES", "0")
os.environ.setdefault("OFFERS_CACHE_TTL", "300")

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db import Base, engine
from app.main import app

API = "https://keitaro.test/admin_api/v1"


@pytest.fixture(scope="session", autouse=True)
def _prepare_db():
    db_file = Path("test_adrobot.db")
    if db_file.exists():
        db_file.unlink()
    Base.metadata.create_all(engine)
    yield


@pytest.fixture(autouse=True)
def _clean_operations():
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM operation_log"))
    yield


@pytest.fixture()
def client():
    # raise_server_exceptions=False: в Starlette обработчик для Exception
    # живёт в ServerErrorMiddleware, который ПОСЛЕ отправки 500-ответа
    # всегда перевыбрасывает исключение (документированное поведение).
    # В проде ответ доставляется uvicorn'ом; в тестах мы проверяем именно ответ.
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture()
def api(respx_mock):
    """Мокирует справочники (домен/группа/источник) и общий список кампаний."""
    respx_mock.get(f"{API}/domains").mock(
        return_value=httpx.Response(200, json=[{"id": 3, "name": "in.posdk.xyz"}])
    )
    respx_mock.get(f"{API}/groups").mock(
        return_value=httpx.Response(200, json=[{"id": 7, "name": "FORTESTS"}])
    )
    respx_mock.get(f"{API}/traffic_sources").mock(
        return_value=httpx.Response(200, json=[{"id": 5, "name": "FORTESTS"}])
    )
    respx_mock.get(f"{API}/campaigns").mock(return_value=httpx.Response(200, json=[]))
    return respx_mock


def json_response(payload: dict, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=payload)


def echo_json(request: httpx.Request) -> httpx.Response:
    """Возвращает тело запроса как тело ответа (эмуляция POST/PUT Keitaro)."""
    return httpx.Response(200, json=json.loads(request.content))
