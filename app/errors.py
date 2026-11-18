"""Доменные исключения и единый формат ошибки API.

Формат ответа: {"error": {"code": "...", "message": "..."}}
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

log = logging.getLogger("adrobot")


class AppError(Exception):
    """Базовая доменная ошибка с HTTP-кодом и машинным кодом."""

    status = 500
    code = "internal"

    def __init__(self, message: str, *, details: Any = None):
        super().__init__(message)
        self.message = message
        self.details = details

    def as_body(self) -> dict:
        body: dict[str, Any] = {"error": {"code": self.code, "message": self.message}}
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
    """Keitaro недоступен (сеть/таймаут) или отдал 5xx после ретраев."""

    status = 502
    code = "keitaro_unavailable"

    def __init__(self, message: str = "Сервис Keitaro временно недоступен, попробуйте позже."):
        super().__init__(message)


class KeitaroApiError(AppError):
    """Keitaro ответил ошибкой 4xx (в т.ч. неверный ключ)."""

    status = 502
    code = "keitaro_error"

    def __init__(self, message: str, *, http_status: int = 0):
        super().__init__(message)
        self.http_status = http_status


def _first_error(errors: list) -> str:
    if not errors:
        return "Неверные параметры запроса."
    err = errors[0]
    loc = ".".join(str(p) for p in err.get("loc", []) if p != "body")
    msg = err.get("msg", "неверное значение")
    return f"{loc}: {msg}" if loc else msg


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        if exc.status >= 500:
            log.error("domain error %s: %s", exc.code, exc.message)
        return JSONResponse(status_code=exc.status, content=exc.as_body())

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={"error": {"code": "validation", "message": _first_error(exc.errors())}},
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "internal", "message": "Внутренняя ошибка сервиса."}},
        )
