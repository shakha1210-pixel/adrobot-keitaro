"""Юнит-тесты KeitaroClient: политика повторов и неоднозначные исходы.

Ключевые инварианты:
- GET/PUT/DELETE (идемпотентные) повторяются при сетевых сбоях и 5xx;
- POST /campaigns и POST /streams НЕ повторяются никогда: 5xx/таймаут
  = KeitaroAmbiguousOutcome (ресурс мог быть создан);
- POST /report/build повторяется (read-only по сути);
- 4xx = KeitaroApiError с http_status, без повторов.
"""

from __future__ import annotations

import asyncio

import httpx
import pytest
from respx import MockRouter

from app.config import Settings
from app.errors import KeitaroAmbiguousOutcome, KeitaroApiError, KeitaroUnavailable
from app.keitaro.client import KeitaroClient

API = "https://keitaro.test/admin_api/v1"


@pytest.fixture()
def settings() -> Settings:
    return Settings(
        keitaro_base_url="https://keitaro.test",
        keitaro_api_key="test-key",
        keitaro_retries=1,  # одна повторная попытка для идемпотентных
        keitaro_timeout=5.0,
    )


def _run(coro):
    return asyncio.run(coro)


def _mk(settings: Settings) -> KeitaroClient:
    client = KeitaroClient(settings)
    try:
        yield client
    finally:
        asyncio.run(client.aclose())


@pytest.fixture()
def client(settings) -> KeitaroClient:
    yield from _mk(settings)


def test_get_retries_on_500_then_succeeds(respx_mock: MockRouter, client):
    route = respx_mock.get(f"{API}/campaigns").mock(
        side_effect=[
            httpx.Response(500, json={"message": "boom"}),
            httpx.Response(200, json=[]),
        ]
    )
    assert _run(client.list_campaigns()) == []
    assert route.call_count == 2


def test_get_retries_on_network_error_then_succeeds(respx_mock: MockRouter, client):
    route = respx_mock.get(f"{API}/offers").mock(
        side_effect=[httpx.ConnectError("down"), httpx.Response(200, json=[])]
    )
    assert _run(client.list_offers()) == []
    assert route.call_count == 2


def test_get_5xx_exhausted_raises_api_error(respx_mock: MockRouter, client):
    route = respx_mock.get(f"{API}/campaigns").mock(
        return_value=httpx.Response(500, json={"message": "internal"})
    )
    with pytest.raises(KeitaroApiError) as exc_info:
        _run(client.list_campaigns())
    assert exc_info.value.http_status == 500
    assert route.call_count == 2  # 1 попытка + 1 ретрай


def test_get_network_error_exhausted_raises_unavailable(respx_mock: MockRouter, client):
    respx_mock.get(f"{API}/campaigns").mock(side_effect=httpx.ConnectError("down"))
    with pytest.raises(KeitaroUnavailable):
        _run(client.list_campaigns())


def test_put_retries_on_network_error(respx_mock: MockRouter, client):
    route = respx_mock.put(f"{API}/streams/7").mock(
        side_effect=[httpx.ConnectError("down"), httpx.Response(200, json={"id": 7})]
    )
    assert _run(client.update_stream(7, {"id": 7})) == {"id": 7}
    assert route.call_count == 2


def test_post_create_campaign_never_retried_on_500(respx_mock: MockRouter, client):
    route = respx_mock.post(f"{API}/campaigns").mock(
        return_value=httpx.Response(500, json={"message": "boom"})
    )
    with pytest.raises(KeitaroAmbiguousOutcome):
        _run(client.create_campaign({"name": "x"}))
    assert route.call_count == 1


def test_post_create_campaign_timeout_is_ambiguous(respx_mock: MockRouter, client):
    route = respx_mock.post(f"{API}/campaigns").mock(side_effect=httpx.ReadTimeout("read timeout"))
    with pytest.raises(KeitaroAmbiguousOutcome):
        _run(client.create_campaign({"name": "x"}))
    assert route.call_count == 1


def test_post_create_stream_never_retried(respx_mock: MockRouter, client):
    route = respx_mock.post(f"{API}/streams").mock(
        return_value=httpx.Response(502, json={"message": "bad gateway"})
    )
    with pytest.raises(KeitaroAmbiguousOutcome):
        _run(client.create_stream({"campaign_id": 1}))
    assert route.call_count == 1


def test_post_400_is_definite_error(respx_mock: MockRouter, client):
    respx_mock.post(f"{API}/campaigns").mock(
        return_value=httpx.Response(400, json={"message": "alias is required"})
    )
    with pytest.raises(KeitaroApiError) as exc_info:
        _run(client.create_campaign({"name": "x"}))
    assert exc_info.value.http_status == 400


def test_401_reported_with_status(respx_mock: MockRouter, client):
    respx_mock.get(f"{API}/offers").mock(
        return_value=httpx.Response(401, json={"message": "bad api key"})
    )
    with pytest.raises(KeitaroApiError) as exc_info:
        _run(client.list_offers())
    assert exc_info.value.http_status == 401


def test_report_build_is_retried_as_readonly(respx_mock: MockRouter, client):
    route = respx_mock.post(f"{API}/report/build").mock(
        side_effect=[
            httpx.Response(503, json={"message": "overloaded"}),
            httpx.Response(200, json={"rows": [], "total": 0}),
        ]
    )
    assert _run(client.build_report({})) == {"rows": [], "total": 0}
    assert route.call_count == 2
