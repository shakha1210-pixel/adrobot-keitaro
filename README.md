# Adrobot — обёртка над Keitaro

[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.x-D71F00)](https://www.sqlalchemy.org/)
[![Ruff](https://img.shields.io/badge/Lint-Ruff-D7FF64?logo=ruff&logoColor=black)](https://docs.astral.sh/ruff/)
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
- [Надёжность интеграции с Keitaro](#надёжность-интеграции-с-keitaro)
- [Тесты и качество кода](#тесты-и-качество-кода)
- [Демо-режим](#демо-режим-без-реального-keitaro)
- [Структура проекта](#структура-проекта)
- [Устранение неполадок](#устранение-неполадок)
- [Безопасность](#безопасность)
- [Известные ограничения](#известные-ограничения)
- [Использование ИИ-агентов](#использование-ии-агентов)

## Что умеет

**Создатель кампаний** (`Новая кампания` в UI):

- валидация названия — обязательный префикс `test_<фамилия>_` проверяется на бэкенде;
- гео-код страны — 2 буквы ISO-3166 (справочник из 113 кодов), нормализуется в верхний регистр;
- проверка существования оффера в Keitaro (иначе `404`);
- кампания создаётся с доменом, группой и источником (резолвятся по имени из `.env`);
- поток №1 (позиция 1): фильтр «страна = гео» → редирект на `REDIRECT_URL` (Google);
- поток №2 (позиция 2): catch-all → выбранный оффер с долей 100%;
- при сбое на шаге потоков созданная кампания автоматически откатывается (архивируется);
- каждая операция пишется в таблицу аудита `operation_log`.

**Редактор кампаний** (`Редактор кампаний` в UI):

- поиск кампаний по префиксу/названию/ID;
- карточки потоков: фильтры, назначение, состояние;
- добавление оффера — доли автоматически пересчитываются, **сумма всегда = 100%**;
- удаление оффера — доли перераспределяются; последний оффер удалить нельзя (`409`);
- статистика по каждому офферу (клики, уники, боты, конверсии, CR) напрямую из `POST /report/build`;
- при правке офферов **остальная конфигурация потока не теряется**: PUT строится от исходного представления потока (triggers, comments, filter_or, chance, action_options, landings сохраняются) — покрыто регрессионным тестом.

**Интерфейс** — premium pixel-terminal тема (boot-экран, CRT-эффекты, анимации счётчиков), **два языка: русский и узбекский** (переключатель `RU | UZ` в шапке, выбор запоминается в браузере, названия стран и все сообщения — на обоих языках).

## Быстрый старт

```bash
git clone <URL репозитория>
cd adrobot-keitaro

# Windows (PowerShell)
python -m venv .venv
.\.venv\Scripts\activate
# Linux / macOS
# python3 -m venv .venv && source .venv/bin/activate

pip install -r requirements-dev.txt   # рантайм + тесты + ruff

cp .env.example .env        # Windows: copy .env.example .env
# отредактируйте .env: KEITARO_API_KEY и CAMPAIGN_PREFIX

alembic upgrade head        # применить миграции
uvicorn app.main:app --reload
```

Откройте <http://127.0.0.1:8000> — интерфейс, <http://127.0.0.1:8000/docs> — Swagger.

> **Windows одной командой:** `.\scripts\dev.ps1` — создаёт venv, ставит зависимости, применяет миграции и запускает сервер. Полная проверка перед коммитом: `.\scripts\check.ps1`.

## Установка и запуск

Требования: **Python 3.11+**, доступ к Keitaro и API-ключ (`Профиль → API ключи` в админке).

| Шаг | Команда |
|---|---|
| 1. Клонировать | `git clone <URL репозитория> && cd adrobot-keitaro` |
| 2. Окружение | `python -m venv .venv` → активация (см. выше) |
| 3. Зависимости | `pip install -r requirements-dev.txt` (или `requirements.txt` — только рантайм) |
| 4. Конфигурация | `cp .env.example .env` и заполнить `KEITARO_API_KEY`, `CAMPAIGN_PREFIX` |
| 5. Миграции | `alembic upgrade head` |
| 6. Запуск | `uvicorn app.main:app --reload` |

Без API-ключа сервис запустится, но операции с Keitaro будут недоступны — в UI появится статус «ключ не задан», а `/health/ready` вернёт `503`.

## Миграции

База данных по умолчанию — SQLite (`adrobot.db`), при желании — PostgreSQL через `DATABASE_URL`. Схема управляется Alembic:

```bash
alembic upgrade head                          # применить все миграции
alembic downgrade -1                          # откатить последнюю
alembic revision --autogenerate -m "описание" # новая миграция по моделям
alembic current                               # текущая ревизия
```

`alembic upgrade head` на чистой базе проверяется в CI (job `migrations`).

## Конфигурация

Все параметры — в `.env` (шаблон — [.env.example](.env.example)):

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `KEITARO_BASE_URL` | `https://tlgk.host` | адрес трекера (без `/admin_api/v1`) |
| `KEITARO_API_KEY` | — | ключ Admin API |
| `KEITARO_TIMEOUT` | `15` | таймаут запроса к Keitaro, с |
| `KEITARO_RETRIES` | `2` | ретраи **идемпотентных** операций при 5xx/сетевых ошибках |
| `CAMPAIGN_PREFIX` | `test_familiya_` | обязательный префикс названия кампании |
| `CAMPAIGN_TYPE` | `position` | ротация потоков (`position`/`weight`) |
| `DEFAULT_DOMAIN` | `kylovoa.com` | домен кампании (имя в Keitaro) |
| `DEFAULT_GROUP` | `FORTESTS` | группа кампании (имя в Keitaro) |
| `DEFAULT_SOURCE` | `FORTESTS` | источник трафика (имя в Keitaro) |
| `REDIRECT_URL` | `https://google.com` | назначение гео-потока |
| `COUNTRY_FILTER_NAME` | `country` | имя фильтра страны в Admin API (проверено на реальном Keitaro) |
| `COUNTRY_FILTER_MODE` | `accept` | режим фильтра страны (`accept`/`reject`) |
| `REPORT_INTERVAL` | `7_days_ago` | период статистики (`today`, `all_time`, …) |
| `REPORT_TIMEZONE` | `UTC` | таймзона отчёта |
| `DATABASE_URL` | `sqlite:///./adrobot.db` | БД (SQLite/PostgreSQL) |
| `OFFERS_CACHE_TTL` | `30` | кэш списка офферов, с |

## API сервиса

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/health` | сводный статус (всегда 200: `keitaro`, `db`) |
| GET | `/health/live` | liveness — жив ли процесс (200) |
| GET | `/health/ready` | readiness — 200/503 по БД и Keitaro |
| GET | `/api/meta` | префикс, домен/группа/источник, URL Keitaro |
| GET | `/api/offers?q=` | автокомплит офферов (по имени или ID) |
| POST | `/api/campaigns` | создать кампанию `{name, geo, offer_id}` |
| GET | `/api/campaigns?prefix=1&q=` | список кампаний (по умолчанию — с префиксом) |
| GET | `/api/campaigns/{id}` | кампания + потоки + офферы + статистика |
| POST | `/api/campaigns/{id}/streams/{sid}/offers` | добавить оффер `{offer_id}` |
| DELETE | `/api/campaigns/{id}/streams/{sid}/offers/{oid}` | удалить оффер |
| GET | `/api/operations?limit=50` | история операций (аудит) |

Каждый ответ несёт заголовок `X-Request-ID` (корреляция с логами). Единый формат ошибки:

```json
{"error": {"code": "conflict", "message": "Нельзя удалить последний оффер в потоке: поток останется пустым."}}
```

Коды: `validation` (422), `not_found` (404), `conflict` (409), `keitaro_unavailable` (502, Keitaro недоступен), `keitaro_error` (502, интеграция вернула ошибку), `keitaro_ambiguous` (502, исход операции неизвестен — см. ниже), `internal` (500).

Пример создания кампании:

```bash
curl -X POST http://127.0.0.1:8000/api/campaigns \
  -H "Content-Type: application/json" \
  -d '{"name": "test_familiya_campaign1", "geo": "UZ", "offer_id": 12}'
```

## Надёжность интеграции с Keitaro

Keitaro — внешняя система, которая может таймаутить, отдавать 5xx или «съедать» запрос без подтверждения. Стратегия:

- **Мутации не повторяются вслепую.** `POST /campaigns` и `POST /streams` выполняются ровно один раз: Keitaro не поддерживает idempotency-ключи, а таймаут не означает «не создано». При таймауте/5xx возвращается `keitaro_ambiguous` с просьбой свериться с админкой; при частичном сбое создания уже созданная кампания откатывается (архивируется).
- **Чтения повторяются.** GET (и идемпотентные PUT/DELETE, а также read-only `POST /report/build`) ретраятся `KEITARO_RETRIES` раз при сетевых сбоях и 5xx/429.
- **Конфигурация сохраняется.** PUT потока строится от исходного представления, полученного из GET, — меняются только привязки офферов.
- **Ошибки не утекают.** Внутренние сообщения Keitaro пишутся только в лог; клиенту возвращается безопасный текст.
- **Сбой отчёта не роняет редактор** — статистика деградирует до нулей с предупреждением в логе.

## Тесты и качество кода

```bash
pytest                        # 51 тест
pytest -v                     # подробно
pytest tests/test_keitaro_client.py -v   # политика повторов и неоднозначные исходы
ruff check .                  # линтер
ruff format --check .         # форматтер
node --check static/app.js    # синтаксис фронтенда
.\scripts\check.ps1           # всё сразу (Windows)
```

Покрытие: создание (happy path, валидация, откат, неоднозначный исход), редактор (доли, конфликты, **сохранение чужой конфигурации потока**, деградация статистики), клиент Keitaro (ретраи идемпотентных, отсутствие ретраев мутаций, 4xx/401, таймауты), health (live/ready), аудит (в т.ч. сбой БД → безопасный 500), корреляционные ID, отсутствие утечки внутренних ошибок. Keitaro мокается через [respx](https://pypi.org/project/respx/) — тесты не трогают реальный трекер.

Качество кода: [Ruff](https://docs.astral.sh/ruff/) (lint + format), конфигурация в [pyproject.toml](pyproject.toml); опционально pre-commit (`.pre-commit-config.yaml`); GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)): ruff, pytest на Python 3.11–3.13, миграции на чистой базе, проверка фронтенда.

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
│   ├── main.py              # FastAPI, lifespan, middleware (X-Request-ID), статика
│   ├── config.py            # pydantic-settings (.env)
│   ├── db.py                # engine, SessionLocal, Base
│   ├── models.py            # ORM: OperationLog (аудит)
│   ├── schemas.py           # Pydantic-схемы API
│   ├── errors.py            # доменные ошибки + безопасные обработчики
│   ├── countries.py         # ISO-3166 гео-коды (113)
│   ├── keitaro/
│   │   ├── client.py        # HTTP-клиент: таймауты, безопасные ретраи, DTO
│   │   └── models.py        # DTO ответов Keitaro (+ raw для PUT без потерь)
│   ├── services/            # reference, offers, report, audit,
│   │                        # campaign_creator, campaign_editor, views
│   └── routers/             # meta (health), offers, campaigns, operations
├── alembic/                 # миграции (alembic upgrade head)
├── static/                  # UI: index.html, styles.css, premium.css, fx.js, app.js
├── tests/                   # pytest + respx (51 тест)
├── scripts/
│   ├── dev.ps1              # быстрый запуск на Windows
│   ├── check.ps1            # lint + tests + frontend
│   └── mock_keitaro.py      # демо-эмулятор Keitaro
├── docs/                    # ARCHITECTURE.ru.md / .uz.md
├── .github/workflows/ci.yml # CI: lint, tests, migrations, frontend
├── pyproject.toml           # ruff + pytest конфигурация
├── requirements.txt         # рантайм-зависимости
├── requirements-dev.txt     # + pytest, respx, ruff
├── .env.example
└── README.md / README.uz.md
```

## Устранение неполадок

| Симптом | Причина и решение |
|---|---|
| `422 validation: Название должно начинаться с префикса…` | имя кампании не с префикса — проверьте `CAMPAIGN_PREFIX` в `.env` |
| `502 keitaro_error` с общим текстом | Keitaro вернул ошибку (4xx/5xx): смотрите лог сервиса — там точная причина; проверьте ключ в админке |
| `502 keitaro_ambiguous` | операция могла выполниться без подтверждения: проверьте кампанию в админке Keitaro и не повторяйте вслепую |
| `503` от `/health/ready` | недоступны Keitaro или БД; `/health` покажет, что именно |
| UI: «Конфигурация недоступна» | не найден домен/группа/источник в Keitaro — сверьте `DEFAULT_*` в `.env` с именами в админке |
| `ModuleNotFoundError` при `alembic` | активируйте venv или используйте `python -m alembic` |

## Безопасность

- `.env` не коммитится (`.gitignore`); в репозитории только `.env.example`.
- API-ключ передаётся только в заголовке `Api-Key` запросов к Keitaro и никогда не логируется и не попадает в ответы.
- CORS не включён — приложение обслуживает только same-origin запросы (фронтенд раздаётся самим FastAPI). Для отдельного фронтенд-домена настройте CORS явно и только под нужный origin.
- Внутренние тексты ошибок Keitaro и трейсбеки не попадают в ответы API (проверяется тестом); подробности — в логах.
- Внешние URL принимаются только из `.env` (Keitaro, редирект), пользовательский ввод URL не используется — SSRF-поверхность отсутствует.
- Открытые ограничения: сервис локальный/однопользовательский (нет авторизации), SQLite — без шифрования; перед публичным деплоем добавьте authN и reverse-proxy с TLS.

## Известные ограничения

- Точные имена полей Keitaro (`country`/`accept` для фильтра страны, `schema: "landings"` для офферного потока, `domain_id` в `POST /campaigns`) **проверены на реальном трекере**; для другой версии Keitaro — правка в одном месте (`app/services/campaign_creator.py` и `COUNTRY_FILTER_*` в `.env`).
- PUT потока — полная замена представления (так работает Admin API v1); сохранность полей обеспечивается отправкой исходного payload, но поведение проверено на документации и мок-сервере, а не на вашей инсталляции Keitaro.
- Интерфейс — на русском и узбекском (переключатель в шапке); **сообщения об ошибках от бэкенда пока на русском** (клиентские сообщения локализованы, серверные — нет).
- Статистика в редакторе обновляется по кнопке (авто-обновления по таймеру нет).

## Использование ИИ-агентов

- **Проектирование** — архитектура сервиса (слои, сценарии, план) описана в [docs/ARCHITECTURE.ru.md](docs/ARCHITECTURE.ru.md) и согласована с ИИ-агентом до начала кодинга.
- **Код** — бэкенд, фронтенд, тесты и документация генерировались ИИ-агентами (DeepSeek Harness / Cursor) по готовому контракту API; контракт Keitaro сверен с официальной документацией Admin API v1.
- **Проверка** — все тесты, миграции, линтер и smoke-сценарии (создание → статистика → добавление/удаление офферов → откат) прогонялись вручную; на реальном Keitaro проверен ручной smoke-тест с префиксом `test_<фамилия>_`.

## Лицензия

MIT — см. [LICENSE](LICENSE).
