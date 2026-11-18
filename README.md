# Adrobot — обёртка над Keitaro

[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.x-D71F00)](https://www.sqlalchemy.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](#лицензия)

> 🇺🇿 O'zbekcha: [README.uz.md](README.uz.md) · Архитектура: [docs/ARCHITECTURE.ru.md](docs/ARCHITECTURE.ru.md) · [docs/ARCHITECTURE.uz.md](docs/ARCHITECTURE.uz.md)

Веб-сервис на **FastAPI + SQLAlchemy** поверх [Admin API v1](https://gist.github.com/asabirov/3cd29f43de41bd76ab93de073a7883a9) трекера [Keitaro](https://keitaro.io). Два рабочих инструмента в одном приложении:

1. **Создатель кампаний** — принимает название, гео-код страны и ID оффера, создаёт кампанию с двумя потоками и настроенными доменом, группой и источником.
2. **Редактор кампании** — добавление и удаление офферов в существующих кампаниях с автоматическим пересчётом долей и живой статистикой из Keitaro.

---

## Содержание

- [Что умеет](#что-умеет)
- [Быстрый старт](#быстрый-старт)
- [Установка и запуск](#установка-и-запуск)
- [Миграции](#миграции)
- [Конфигурация](#конфигурация)
- [API сервиса](#api-сервиса)
- [Тесты](#тесты)
- [Демо-режим](#демо-режим-без-реального-keitaro)
- [Структура проекта](#структура-проекта)
- [Использование ИИ-агентов](#использование-ии-агентов)
- [Что не успел / что бы доделал](#что-не-успел--что-бы-доделал)

## Что умеет

**Создатель кампаний** (`Новая кампания` в UI):

- валидация названия — обязательный префикс `test_<фамилия>_` проверяется на бэкенде;
- гео-код страны — 2 буквы ISO-3166, нормализуется в верхний регистр;
- проверка существования оффера в Keitaro (иначе `404`);
- кампания создаётся с доменом, группой и источником (резолвятся по имени из `.env`);
- поток №1 (позиция 1): фильтр «страна = гео» (allow) → редирект на `REDIRECT_URL` (Google);
- поток №2 (позиция 2): catch-all → выбранный оффер с долей 100%;
- при сбое на шаге потоков созданная кампания автоматически откатывается (архивируется);
- каждая операция пишется в таблицу аудита `operation_log`.

**Редактор кампаний** (`Редактор кампаний` в UI):

- поиск кампаний по префиксу/названию/ID;
- карточки потоков: фильтры, назначение, состояние;
- добавление оффера — доли автоматически пересчитываются, **сумма всегда = 100%**;
- удаление оффера — доли перераспределяются; последний оффер удалить нельзя (`409`);
- статистика по каждому офферу (клики, уники, боты, конверсии, CR) напрямую из `POST /report/build`.

## Быстрый старт

```bash
git clone <URL репозитория>
cd adrobot-keitaro

# Windows (PowerShell)
python -m venv .venv
.\.venv\Scripts\activate
# Linux / macOS
# python3 -m venv .venv && source .venv/bin/activate

pip install -r requirements.txt

cp .env.example .env        # Windows: copy .env.example .env
# отредактируйте .env: KEITARO_API_KEY и CAMPAIGN_PREFIX

alembic upgrade head        # применить миграции
uvicorn app.main:app --reload
```

Откройте <http://127.0.0.1:8000> — интерфейс, <http://127.0.0.1:8000/docs> — Swagger.

> **Windows одной командой:** `.\scripts\dev.ps1` — создаёт venv, ставит зависимости, применяет миграции и запускает сервер.

## Установка и запуск

Требования: **Python 3.11+**, доступ к Keitaro и API-ключ (`Профиль → API ключи` в админке).

| Шаг | Команда |
|---|---|
| 1. Клонировать | `git clone <URL репозитория> && cd adrobot-keitaro` |
| 2. Окружение | `python -m venv .venv` → активация (см. выше) |
| 3. Зависимости | `pip install -r requirements.txt` |
| 4. Конфигурация | `cp .env.example .env` и заполнить `KEITARO_API_KEY`, `CAMPAIGN_PREFIX` |
| 5. Миграции | `alembic upgrade head` |
| 6. Запуск | `uvicorn app.main:app --reload` |

Без API-ключа сервис запустится, но операции с Keitaro будут недоступны — в UI появится статус «ключ не задан».

## Миграции

База данных по умолчанию — SQLite (`adrobot.db`), при желании — PostgreSQL через `DATABASE_URL`. Схема управляется Alembic:

```bash
alembic upgrade head                          # применить все миграции
alembic downgrade -1                          # откатить последнюю
alembic revision --autogenerate -m "описание" # новая миграция по моделям
alembic current                               # текущая ревизия
```

## Конфигурация

Все параметры — в `.env` (шаблон — [.env.example](.env.example)):

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `KEITARO_BASE_URL` | `https://tlgk.host` | адрес трекера (без `/admin_api/v1`) |
| `KEITARO_API_KEY` | — | ключ Admin API |
| `KEITARO_TIMEOUT` | `15` | таймаут запроса к Keitaro, с |
| `KEITARO_RETRIES` | `2` | ретраи при 5xx/сетевых ошибках |
| `CAMPAIGN_PREFIX` | `test_familiya_` | обязательный префикс названия кампании |
| `CAMPAIGN_TYPE` | `position` | ротация потоков (`position`/`weight`) |
| `DEFAULT_DOMAIN` | `in.posdk.xyz` | домен кампании (имя в Keitaro) |
| `DEFAULT_GROUP` | `FORTESTS` | группа кампании (имя в Keitaro) |
| `DEFAULT_SOURCE` | `FORTESTS` | источник трафика (имя в Keitaro) |
| `REDIRECT_URL` | `https://google.com` | назначение гео-потока |
| `REPORT_INTERVAL` | `7_days_ago` | период статистики (`today`, `all_time`, …) |
| `REPORT_TIMEZONE` | `UTC` | таймзона отчёта |
| `DATABASE_URL` | `sqlite:///./adrobot.db` | БД (SQLite/PostgreSQL) |
| `OFFERS_CACHE_TTL` | `30` | кэш списка офферов, с |

## API сервиса

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/health` | живость сервиса + статус Keitaro и БД |
| GET | `/api/meta` | префикс, домен/группа/источник, URL Keitaro |
| GET | `/api/offers?q=` | автокомплит офферов (по имени или ID) |
| POST | `/api/campaigns` | создать кампанию `{name, geo, offer_id}` |
| GET | `/api/campaigns?prefix=1&q=` | список кампаний (по умолчанию — с префиксом) |
| GET | `/api/campaigns/{id}` | кампания + потоки + офферы + статистика |
| POST | `/api/campaigns/{id}/streams/{sid}/offers` | добавить оффер `{offer_id}` |
| DELETE | `/api/campaigns/{id}/streams/{sid}/offers/{oid}` | удалить оффер |
| GET | `/api/operations?limit=50` | история операций (аудит) |

Единый формат ошибки:

```json
{"error": {"code": "conflict", "message": "Нельзя удалить последний оффер в потоке: поток останется пустым."}}
```

Коды: `validation` (422), `not_found` (404), `conflict` (409), `keitaro_unavailable` / `keitaro_error` (502), `internal` (500).

Пример создания кампании:

```bash
curl -X POST http://127.0.0.1:8000/api/campaigns \
  -H "Content-Type: application/json" \
  -d '{"name": "test_familiya_campaign1", "geo": "UZ", "offer_id": 12}'
```

## Тесты

```bash
pytest            # весь набор (24 теста)
pytest -v         # подробно
```

Покрытие: создание кампании (happy path, валидация, откат), редактор (добавление/удаление офферов, пересчёт долей, конфликты), поиск офферов, health/meta, утилиты долей и alias. Keitaro мокается через [respx](https://pypi.org/project/respx/) — тесты не трогают реальный трекер.

## Демо-режим (без реального Keitaro)

Для скринкастов и локальной разработки в комплекте есть эмулятор Admin API v1:

```bash
# терминал 1
python scripts/mock_keitaro.py      # http://127.0.0.1:8999

# .env
# KEITARO_BASE_URL=http://127.0.0.1:8999
# KEITARO_API_KEY=demo

# терминал 2
uvicorn app.main:app --reload       # http://127.0.0.1:8000
```

Эмулятор держит офферы, справочники, кампании и потоки в памяти и отдаёт детерминированную «статистику», чтобы цифры в UI были согласованы.

## Структура проекта

```
adrobot-keitaro/
├── app/
│   ├── main.py              # FastAPI, lifespan, роутеры, статика
│   ├── config.py            # pydantic-settings (.env)
│   ├── db.py                # engine, SessionLocal, Base
│   ├── models.py            # ORM: OperationLog (аудит)
│   ├── schemas.py           # Pydantic-схемы API
│   ├── errors.py            # доменные ошибки + обработчики
│   ├── countries.py         # ISO-3166 гео-коды
│   ├── keitaro/
│   │   ├── client.py        # HTTP-клиент Admin API v1 (ретраи, таймауты)
│   │   └── models.py        # DTO ответов Keitaro
│   ├── services/            # reference, offers, report, audit,
│   │                        # campaign_creator, campaign_editor, views
│   └── routers/             # meta, offers, campaigns, operations
├── alembic/                 # миграции (alembic upgrade head)
├── static/                  # UI: index.html, styles.css, app.js
├── tests/                   # pytest + respx
├── scripts/
│   ├── dev.ps1              # быстрый запуск на Windows
│   └── mock_keitaro.py      # демо-эмулятор Keitaro
├── docs/                    # ARCHITECTURE.ru.md / .uz.md
├── .env.example
└── requirements.txt
```

## Использование ИИ-агентов

- **Проектирование** — архитектура сервиса (слои, сценарии, план) описана в [docs/ARCHITECTURE.ru.md](docs/ARCHITECTURE.ru.md) и согласована с ИИ-агентом до начала кодинга.
- **Код** — бэкенд, фронтенд, тесты и документация генерировались ИИ-агентами (DeepSeek Harness / Cursor) по готовому контракту API; вручную исправлялись несоответствия Keitaro API.
- **Проверка** — все тесты, миграции и smoke-сценарии (создание → статистика → добавление/удаление офферов) прогонялись вручную; на реальном Keitaro проверен ручной smoke-тест с префиксом `test_<фамилия>_`.

## Что не успел / что бы доделал

- E2E-тесты UI (Playwright) вместо ручной проверки.
- Автообновление статистики в редакторе по таймеру.
- Переключатель языка интерфейса (RU/UZ/EN) — сейчас UI на русском.
- Авторизация пользователей сервиса (вне рамок задания — сервис локальный).

## Лицензия

MIT.
