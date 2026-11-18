"""Настройки приложения (pydantic-settings, .env)."""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Все параметры читаются из .env / переменных окружения."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Keitaro ---
    keitaro_base_url: str = "https://tlgk.host"
    keitaro_api_key: str = ""
    keitaro_timeout: float = 15.0
    keitaro_retries: int = 2

    # --- Параметры создаваемых кампаний ---
    campaign_prefix: str = "test_familiya_"
    campaign_type: str = "position"  # ротация потоков «по позиции»
    default_domain: str = "in.posdk.xyz"
    default_group: str = "FORTESTS"
    default_source: str = "FORTESTS"
    redirect_url: str = "https://google.com"

    # --- Отчёт / статистика ---
    report_interval: str = "7_days_ago"
    report_timezone: str = "UTC"

    # --- БД и кэш ---
    database_url: str = "sqlite:///./adrobot.db"
    offers_cache_ttl: float = 30.0

    @property
    def api_base_url(self) -> str:
        """База Admin API v1: https://host/admin_api/v1."""
        return self.keitaro_base_url.rstrip("/") + "/admin_api/v1"

    @property
    def admin_url(self) -> str:
        """Ссылка на админку (для UI)."""
        return self.keitaro_base_url.rstrip("/") + "/admin"

    @property
    def is_configured(self) -> bool:
        return bool(self.keitaro_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
