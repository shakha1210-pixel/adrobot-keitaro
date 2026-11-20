"""Юнит-тесты утилит: доли, alias, домены."""

from __future__ import annotations

import re

from app.services.campaign_creator import generate_alias
from app.services.campaign_editor import distribute_shares
from app.services.views import normalize_domain


def test_distribute_shares():
    assert distribute_shares(1) == [100]
    assert distribute_shares(2) == [50, 50]
    assert distribute_shares(3) == [34, 33, 33]
    assert distribute_shares(0) == []
    for n in range(1, 20):
        shares = distribute_shares(n)
        assert len(shares) == n
        assert sum(shares) == 100
        assert all(s > 0 for s in shares)


def test_normalize_domain():
    """Реальный Keitaro отдаёт домен как "https://kylovoa.com/" — нормализуем."""
    assert normalize_domain("https://kylovoa.com/") == "kylovoa.com"
    assert normalize_domain("kylovoa.com") == "kylovoa.com"
    assert normalize_domain("http://a.b/x/") == "a.b/x"
    assert normalize_domain(None) is None
    assert normalize_domain("") is None


def test_generate_alias_latin_and_unique():
    a1 = generate_alias("test_ivanov_campaign1")
    a2 = generate_alias("Тест_Иванов_кампания")
    a3 = generate_alias("Привет, мир!")
    for alias in (a1, a2, a3):
        assert re.fullmatch(r"[a-z0-9][a-z0-9-]*[a-z0-9]", alias)
    assert a1.startswith("test-ivanov-campaign1-")
    assert a1 != a2  # случайный суффикс гарантирует уникальность
    assert a3.startswith("privet-mir-")
