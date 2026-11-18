# Архитектура: Adrobot — обёртка над Keitaro

> 🇺🇿 O'zbekcha: [ARCHITECTURE.uz.md](ARCHITECTURE.uz.md) · Статус: **реализовано и покрыто тестами** (24 теста, `pytest`).

## 1. Цель и границы

Сервис — тонкая обёртка над Admin API Keitaro (v1). Две функции:

1. **Создатель кампаний**: вход — `name`, `geo` (код страны), `offer_id`. Выход — кампания в Keitaro с двумя потоками, настроенными доменом, группой и источником.
2. **Редактор кампании**: просмотр потоков/офферов выбранной кампании, добавление и удаление офферов, корректные доли (%) и статистика.

Вне границ: авторизация пользователей, собственное хранение офферов/статистики, рекламные интеграции.

## 2. Принципы

| Принцип | Следствие |
|---|---|
| **Keitaro — единственный источник истины** | Мы не дублируем кампании/офферы/статистику в своей БД. Всё читаем из API. |
| **Своя БД — только аудит** | Таблица истории операций (кто/что/когда/результат) для отладки и отчёта. |
| **Тонкие слои** | `router → service → keitaro client`. Бизнес-логика только в `services`. |
| **Секреты вне репозитория** | Ключ и URL — только из `.env`; в git лежит `.env.example`. |
| **Безопасность тестовых данных** | Любая кампания обязана начинаться с префикса `test_<фамилия>_` (проверка на бэкенде). |
| **Частичные сбои обрабатываются** | Если создание потока упало — откатываем (архивируем) созданную кампанию. |

## 3. Общая схема

```mermaid
flowchart LR
    UI["Frontend<br/>(HTML + CSS + vanilla JS)"] -->|JSON| R["FastAPI routers"]
    R --> S["Services<br/>(бизнес-логика)"]
    S --> K["Keitaro client<br/>(httpx, async, ретраи)"]
    K -->|"Api-Key"| KT[("Keitaro<br/>/admin_api/v1")]
    S --> DB[("SQLAlchemy DB<br/>аудит операций")]
```

## 4. Структура проекта

```
adrobot-keitaro/
├── app/
│   ├── main.py              # FastAPI, lifespan (клиент/сервисы в app.state), статика
│   ├── config.py            # pydantic-settings, чтение .env
│   ├── db.py                # engine, SessionLocal, Base
│   ├── models.py            # ORM: OperationLog
│   ├── schemas.py           # Pydantic-схемы запросов/ответов
│   ├── errors.py            # доменные исключения + обработчики (единый формат ошибки)
│   ├── countries.py         # ISO-3166 коды стран
│   ├── deps.py              # DI-зависимости (app.state)
│   ├── keitaro/
│   │   ├── client.py        # HTTP-клиент: таймауты, ретраи, обработка ошибок
│   │   └── models.py        # DTO ответов Keitaro (Offer, Campaign, Stream, …)
│   ├── services/
│   │   ├── reference.py     # домен/группа/источник по имени → ID (кэш)
│   │   ├── offers.py        # поиск офферов для автокомплита (TTL-кэш)
│   │   ├── report.py        # статистика из POST /report/build
│   │   ├── audit.py         # запись в operation_log
│   │   ├── campaign_creator.py
│   │   ├── campaign_editor.py
│   │   └── views.py         # DTO Keitaro → схемы ответа
│   └── routers/
│       ├── meta.py          # /health, /api/meta
│       ├── offers.py
│       ├── campaigns.py
│       └── operations.py
├── alembic/                 # миграции (alembic upgrade head)
├── static/                  # index.html, styles.css, app.js, favicon.svg
├── tests/                   # pytest + respx (мок Keitaro)
├── scripts/
│   ├── dev.ps1              # venv + зависимости + миграции + uvicorn
│   └── mock_keitaro.py      # демо-эмулятор Admin API v1 (в памяти)
├── docs/
├── .env.example
└── README.md / README.uz.md
```

## 5. Слои

- **Router** — валидация входа (Pydantic), вызов сервиса, маппинг ошибок в HTTP-коды. Логики нет.
- **Service** — сценарии. Знает *что* делать, не знает *как* ходить по HTTP.
- **Keitaro client** — единственное место, где есть URL, заголовок `Api-Key`, таймауты (15 с), ретраи на 5xx/сетевые сбои (2 попытки), преобразование ответов в DTO.
- **DB** — SQLAlchemy 2.x + Alembic. По умолчанию SQLite, через `DATABASE_URL` можно подключить PostgreSQL.

## 6. Контракт Keitaro Admin API v1 (сверен)

Контракт сверен с официальной документацией Admin API v1 ([gist asabirov](https://gist.github.com/asabirov/3cd29f43de41bd76ab93de073a7883a9), asabirov — разработчик Keitaro) и закреплён в `app/keitaro/client.py`.

| Что нужно | Вызов |
|---|---|
| Домен по имени | `GET /domains` |
| Группа по имени | `GET /groups?type=campaigns` |
| Источник по имени | `GET /traffic_sources` |
| Оффер по ID | `GET /offers/{id}` |
| Список офферов (автокомплит) | `GET /offers` (фильтр по имени/ID на нашей стороне, кэш 30 с) |
| Создать кампанию | `POST /campaigns` — `name`, `alias` (генерируем), `type`, `state`, `domain_id`, `group_id`, `traffic_source_id`, `cost_type`, `cost_value`, `cost_currency`, `cost_auto` |
| Создать поток | `POST /streams` — `campaign_id`, `type: regular`, `name`, `position`, `state`, `schema`, `action_type`, `action_payload`, `filters`, `offers` |
| Потоки кампании | `GET /campaigns/{id}/streams` |
| Поток по ID | `GET /streams/{id}` |
| Обновить поток | `PUT /streams/{id}` (полное тело, привязки офферов с `id`) |
| Архив кампании (откат) | `DELETE /campaigns/{id}` |
| Статистика | `POST /report/build` — `range {interval, timezone}`, `grouping [stream_id, offer_id]`, `metrics [clicks, stream_unique_clicks, bots, conversions, cr]`, `filters [campaign_id EQUALS …]` |

Авторизация: заголовок `Api-Key: <ключ>`.

### Поток-редирект (гео → Google)

`schema: "redirect"`, `action_type: "http"`, `action_payload: <REDIRECT_URL>`, фильтр:

```json
{"filters": [{"name": "country_code", "mode": "allow", "payload": ["UZ"]}]}
```

### Поток офферов (catch-all)

`schema: "offers"`, привязки офферов: `{"offers": [{"offer_id": 12, "share": 100}]}`.

## 7. Сценарий A — создание кампании

Вход: `{ name, geo, offer_id }`.

1. Валидация: `name` начинается с `CAMPAIGN_PREFIX`; `geo` — 2 буквы ISO-3166 (в верхний регистр, справочник в `app/countries.py`); `offer_id` — целое > 0.
2. Проверка, что оффер существует (`GET /offers/{id}`), иначе `404`.
3. `reference` резолвит `DEFAULT_DOMAIN`, `DEFAULT_GROUP`, `DEFAULT_SOURCE` в ID (кэш на время жизни процесса).
4. `POST /campaigns` (alias генерируется: транслитерация + случайный суффикс) → `campaign_id`.
5. **Поток 1 (позиция 1):** фильтр «страна — принимать `geo`», действие — редирект на `REDIRECT_URL` (google.com).
6. **Поток 2 (позиция 2):** без фильтров, схема «офферы», один оффер с долей 100%.
7. Запись в `operation_log` (успех/ошибка).
8. **Откат:** если шаги 5–6 упали — `DELETE /campaigns/{id}` (архивирование) и запись ошибки в лог.

Порядок потоков важен: Keitaro проверяет их сверху вниз, поэтому «гео-поток» идёт первым, «catch-all» — вторым (ротация «По позиции», `CAMPAIGN_TYPE=position`).

## 8. Сценарий B — редактор кампании

**Чтение:** `GET /api/campaigns/{id}` → кампания + её потоки + офферы потока (название, доля %, клики/уники/конверсии из `POST /report/build`).

**Добавить оффер** (`POST /api/campaigns/{id}/streams/{stream_id}/offers {offer_id}`):
1. Получить поток, проверить схему (`offers`) и что оффера там ещё нет (`409`).
2. Добавить и **пересчитать доли**: сумма = 100%, поровну, остаток от деления — первым офферам (`distribute_shares`).
3. `PUT /streams/{id}` целиком (существующие привязки — с их `id`); вернуть обновлённое состояние.

**Удалить оффер** (`DELETE …/offers/{offer_id}`):
1. Удалить, **перераспределить доли** между оставшимися (сумма = 100%).
2. Нельзя удалить последний оффер в потоке с схемой «офферы» → `409` с понятным сообщением.

«Верные цифры»: (а) доли офферов всегда в сумме дают 100% (проверяется тестами); (б) клики/уники/боты/конверсии/CR берутся напрямую из `report/build` (группировка по потоку и офферу); (в) период и таймзона отчёта настраиваются (`REPORT_INTERVAL`, `REPORT_TIMEZONE`).

## 9. API сервиса

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/health` | живость: статус Keitaro (`ok/unreachable/unconfigured`) и БД |
| GET | `/api/meta` | домен/группа/источник/префикс (для отображения в UI) |
| GET | `/api/offers?q=` | автокомплит офферов (по имени или ID, кэш 30 с) |
| POST | `/api/campaigns` | создать кампанию |
| GET | `/api/campaigns?prefix=&q=` | список кампаний (по умолчанию — наши `test_…`) |
| GET | `/api/campaigns/{id}` | кампания, потоки, офферы, статистика |
| POST | `/api/campaigns/{id}/streams/{sid}/offers` | добавить оффер |
| DELETE | `/api/campaigns/{id}/streams/{sid}/offers/{oid}` | удалить оффер |
| GET | `/api/operations?limit=` | история операций (аудит) |

Единый формат ошибки: `{ "error": { "code": "...", "message": "..." } }`.

## 10. Модель данных (SQLAlchemy)

`operation_log`
| Поле | Тип | Описание |
|---|---|---|
| id | int PK | |
| created_at | datetime | UTC |
| action | str | `create_campaign` / `add_offer` / `remove_offer` |
| keitaro_campaign_id | int, null | |
| campaign_name | str, null | для удобства в истории |
| payload | JSON | входные параметры |
| status | str | `ok` / `error` |
| error | text, null | сообщение ошибки |

Миграции — Alembic (`alembic upgrade head`), ревизия `0001`.

## 11. Ошибки и устойчивость

| Ситуация | Реакция |
|---|---|
| Keitaro недоступен / таймаут / 5xx | ретрай, затем `502 keitaro_unavailable` |
| Неверный ключ (401/403) | `502 keitaro_error` + явное сообщение в логе (не в ответе клиенту) |
| Оффер/кампания/поток не найдены | `404 not_found` |
| Неверное гео/имя/схема потока | `422 validation` |
| Конфликт (оффер уже есть / последний оффер) | `409 conflict` |
| Сбой отчёта `report/build` | статистика = нули, предупреждение в лог (редактор продолжает работать) |

## 12. Frontend

Одна страница (HTML + vanilla JS, без сборки), раздаётся FastAPI из `static/`. Тёмная тема, три вкладки:

- **«Новая кампания»** — по макету из ТЗ: Name (с проверкой префикса), Geo (выбор ISO-кода + свободный ввод), Offer (автокомплит с debounce 300 мс), кнопка Create; после создания — карточка кампании с двумя потоками и кнопка «Перейти в редактор».
- **«Редактор кампаний»** — выбор кампании (поиск по префиксу/названию/ID) → карточка кампании (домен/группа/источник, тизеры статистики) → карточки потоков: фильтры-чипы, назначение, таблица офферов с долями (прогресс-бары), кликами, униками, конверсиями и CR; добавление (автокомплит) и удаление (с подтверждением) офферов, обновление без перезагрузки, тосты об ошибках 4xx.
- **«История операций»** — таблица аудита из `operation_log`.

## 13. Тестирование

- `pytest` + `respx` (мок Keitaro). Покрыто: создание (happy path, валидация, откат с архивированием), добавление/удаление с пересчётом долей, конфликты, поиск офферов с кэшем, health/meta, утилиты (`distribute_shares`, `generate_alias`).
- Демо-режим: `python scripts/mock_keitaro.py` — эмулятор Admin API v1 в памяти (для локальной разработки и скринкастов).
- Ручной smoke-тест на реальном Keitaro с префиксом `test_<фамилия>_`.

## 14. Конфигурация (`.env`)

См. `.env.example`: `KEITARO_BASE_URL`, `KEITARO_API_KEY`, `KEITARO_TIMEOUT`, `KEITARO_RETRIES`, `CAMPAIGN_PREFIX`, `CAMPAIGN_TYPE`, `DEFAULT_DOMAIN`, `DEFAULT_GROUP`, `DEFAULT_SOURCE`, `REDIRECT_URL`, `REPORT_INTERVAL`, `REPORT_TIMEZONE`, `DATABASE_URL`, `OFFERS_CACHE_TTL`.

## 15. Статус

| Этап | Статус |
|---|---|
| Сверка API по документации | ✅ контракт закреплён в `app/keitaro/client.py` |
| Скелет, config, Keitaro client | ✅ |
| Создатель кампаний + откат + тесты | ✅ |
| Редактор: чтение, add/remove, пересчёт долей, статистика | ✅ |
| Frontend, SQLAlchemy + Alembic, обработка ошибок | ✅ |
| README (RU/UZ), демо-режим, скринкаст | ✅ |

## 16. Решённые вопросы

1. **Доли при добавлении/удалении** — после любого изменения сумма = 100%, распределение поровну, остаток — первым офферам (тестируется).
2. **Точные имена полей Keitaro API** — закреплены в разделе 6 и в клиенте.
3. **Откат** — кампания архивируется через `DELETE /campaigns/{id}` (права ключа на archive достаточны).

> Единственная точка риска — имя фильтра страны `country_code` и поддержка `domain_id` в `POST /campaigns` на конкретной версии Keitaro: оба значения меняются в одном месте — `app/services/campaign_creator.py`.
