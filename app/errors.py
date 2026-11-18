"""Доменные исключения и единый формат ошибки API.

Формат ответа: {"error": {"code": "...", "message": "..."}}

Правило раскрытия информации: сообщения 5xx-ошибок интеграции (keitaro_*)
по умолчанию НЕ попадают в ответ клиенту — они пишутся в лог, а клиенту
возвращается безопасный общий текст. Исключение — ошибки, помеченные
`public=True` (собственные, заранее составленные сообщения сервиса).
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

log = logging.getLogger("adrobot")

# Безопасные сообщения-заглушки для кодов, чьи внутренние детали скрываются.
_PUBLIC_FALLBACK: dict[str, str] = {
    "keitaro_error": "Ошибка интеграции с Keitaro. Подробности — в логах сервиса.",
    "keitaro_unavailable": "Сервис Keitaro временно недоступен, попробуйте позже.",
    "keitaro_ambiguous": (
        "Keitaro не подтвердил результат операции. Проверьте кампанию в админке Keitaro, "
        "прежде чем повторять действие."
    ),
    "internal": "Внутренняя ошибка сервиса.",
}


class AppError(Exception):
    """Базовая доменная ошибка с HTTP-кодом и машинным кодом.

    public=False означает: текст ошибки — для логов, клиенту вернётся
    безопасная заглушка из _PUBLIC_FALLBACK.
    """

    status = 500
    code = "internal"

    def __init__(self, message: str, *, public: bool = True, details: Any = None):
        super().__init__(message)
        self.message = message
        self.public = public
        self.details = details

    def client_message(self) -> str:
        if self.public:
            return self.message
        return _PUBLIC_FALLBACK.get(self.code, _PUBLIC_FALLBACK["internal"])

    def as_body(self) -> dict:
        body: dict[str, Any] = {"error": {"code": self.code, "message": self.client_message()}}
        if self.details is not None:
            body["error"]["details"] = self.details
        return body


class ValidationError(AppError):
    status = 422
    code = "validation"


class NotFoundError(AppError):
    status = 404
    code = "not_found"


class ConflictError(AppError):
    status = 409
    code = "conflict"


class KeitaroUnavailable(AppError):
    """Keitaro недоступен (сеть/таймаут исчерпаны) для идемпотентных операций."""

    status = 502
    code = "keitaro_unavailable"

    def __init__(self, message: str = "Сервис Keitaro временно недоступен, попробуйте позже."):
        super().__init__(message)


class KeitaroApiError(AppError):
    """Keitaro ответил ошибкой 4xx/5xx. Текст — внутренний (в лог), не для клиента."""

    status = 502
    code = "keitaro_error"

    def __init__(self, message: str, *, http_status: int = 0, public: bool = False):
        super().__init__(message, public=public)
        self.http_status = http_status


class KeitaroAmbiguousOutcome(AppError):
    """Неидемпотентная операция (POST) завершилась неоднозначно.

    Таймаут/5xx не означают, что Keitaro НЕ выполнил операцию: ресурс мог
    быть создан. Повторять вслепую нельзя — нужна сверка в админке.
    """

    status = 502
    code = "keitaro_ambiguous"

    def __init__(self, message: str):
        super().__init__(message, public=True)


def _first_error(errors: list) -> str:
    if not errors:
        return "Неверные параметры запроса."
    err = errors[0]
    loc = ".".join(str(p) for p in err.get("loc", []) if p != "body")
    msg = err.get("msg", "неверное значение")
    return f"{loc}: {msg}" if loc else msg


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError) -> JSONResponse:
        if exc.status >= 500:
            request_id = getattr(request.state, "request_id", "-")
            log.error(
                "domain error %s (request_id=%s, public=%s): %s",
                exc.code,
                request_id,
                exc.public,
                exc.message,
            )
        return JSONResponse(status_code=exc.status, content=exc.as_body())

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={"error": {"code": "validation", "message": _first_error(exc.errors())}},
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        request_id = getattr(request.state, "request_id", "-")
        log.exception("unhandled error (request_id=%s): %s", request_id, exc)
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "internal", "message": _PUBLIC_FALLBACK["internal"]}},
        )
