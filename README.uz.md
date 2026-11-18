# Adrobot — Keitaro ustidan o'ram (wrapper)

[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.x-D71F00)](https://www.sqlalchemy.org/)
[![License](https://img.shields.io/badge/Litsenziya-MIT-green)](#litsenziya)

> 🇷🇺 По-русски: [README.md](README.md) · Arxitektura: [docs/ARCHITECTURE.uz.md](docs/ARCHITECTURE.uz.md) · [docs/ARCHITECTURE.ru.md](docs/ARCHITECTURE.ru.md)

[Keitaro](https://keitaro.io) trekerining [Admin API v1](https://gist.github.com/asabirov/3cd29f43de41bd76ab93de073a7883a9) ustidagi **FastAPI + SQLAlchemy** veb-xizmati. Bitta ilovada ikkita ishchi vosita:

1. **Kampaniya yaratuvchi** — nom, davlat geо-kodi va offer ID'ni qabul qiladi, ikki oqimli hamda domen, guruh va manbasi sozlangan kampaniya yaratadi.
2. **Kampaniya muharriri** — mavjud kampaniyalarga offer qo'shish/o'chirish, ulushlarni avtomatik qayta hisoblash va Keitaro'dan jonli statistika.

---

## Mundarija

- [Nimalarni biladi](#nimalarni-biladi)
- [Tez boshlash](#tez-boshlash)
- [O'rnatish va ishga tushirish](#ornatish-va-ishga-tushirish)
- [Migratsiyalar](#migratsiyalar)
- [Konfiguratsiya](#konfiguratsiya)
- [Xizmat API'si](#xizmat-apisi)
- [Testlar](#testlar)
- [Demo-rejim](#demo-rejim-haqiqiy-keitarosiz)
- [Loyiha tuzilmasi](#loyiha-tuzilmasi)
- [AI agentlardan foydalanish](#ai-agentlardan-foydalanish)
- [Nima ulgurmadim / nimani yakunlardim](#nima-ulgurmadim--nimani-yakunlardim)

## Nimalarni biladi

**Kampaniya yaratuvchi** (UI'dagi `Yangi kampaniya`):

- nom tekshiruvi — majburiy `test_<familiya>_` prefiksi backendda tekshiriladi;
- geо-kod — ISO-3166 bo'yicha 2 harf, katta harfga o'giriladi;
- offer Keitaro'da mavjudligi tekshiriladi (yo'q bo'lsa `404`);
- kampaniya domen, guruh va manba bilan yaratiladi (nomlari `.env`dan ID'ga aylantiriladi);
- 1-oqim (1-pozitsiya): «davlat = geо» filtri (allow) → `REDIRECT_URL` (Google)ga redirect;
- 2-oqim (2-pozitsiya): catch-all → tanlangan offer, ulushi 100%;
- oqimlar qadamida xato bo'lsa, yaratilgan kampaniya avtomatik qaytariladi (arxivlanadi);
- har bir operatsiya `operation_log` audit jadvaliga yoziladi.

**Kampaniya muharriri** (UI'dagi `Kampaniya muharriri`):

- kampaniyalarni prefiks/nom/ID bo'yicha qidirish;
- oqim kartalari: filtrlar, vazifa, holat;
- offer qo'shish — ulushlar avtomatik qayta hisoblanadi, **yig'indi doim = 100%**;
- offer o'chirish — ulushlar qayta taqsimlanadi; oxirgi offerni o'chirib bo'lmaydi (`409`);
- har bir offer bo'yicha statistika (klik, unik, bot, konversiya, CR) bevosita `POST /report/build`dan.

## Tez boshlash

```bash
git clone <repo URL>
cd adrobot-keitaro

# Windows (PowerShell)
python -m venv .venv
.\.venv\Scripts\activate
# Linux / macOS
# python3 -m venv .venv && source .venv/bin/activate

pip install -r requirements.txt

cp .env.example .env        # Windows: copy .env.example .env
# .env ni tahrirlang: KEITARO_API_KEY va CAMPAIGN_PREFIX

alembic upgrade head        # migratsiyalarni qo'llash
uvicorn app.main:app --reload
```

<http://127.0.0.1:8000> — interfeys, <http://127.0.0.1:8000/docs> — Swagger.

> **Windows'da bitta buyruq:** `.\scripts\dev.ps1` — venv yaratadi, kutubxonalarni o'rnatadi, migratsiyani qo'llaydi va serverni ishga tushiradi.

## O'rnatish va ishga tushirish

Talablar: **Python 3.11+**, Keitaro'ga kirish va API kaliti (admindagi `Profil → API kalitlar`).

| Qadam | Buyruq |
|---|---|
| 1. Klonlash | `git clone <repo URL> && cd adrobot-keitaro` |
| 2. Muhit | `python -m venv .venv` → aktivatsiya (yuqoriga qarang) |
| 3. Kutubxonalar | `pip install -r requirements.txt` |
| 4. Konfiguratsiya | `cp .env.example .env`, so'ng `KEITARO_API_KEY`, `CAMPAIGN_PREFIX`ni yozing |
| 5. Migratsiyalar | `alembic upgrade head` |
| 6. Ishga tushirish | `uvicorn app.main:app --reload` |

API kalitsiz xizmat ishlaydi, lekin Keitaro operatsiyalari ishlamaydi — UI'da «kalit berilmagan» holati ko'rinadi.

## Migratsiyalar

Baza standart bo'yicha SQLite (`adrobot.db`), xohlasangiz `DATABASE_URL` orqali PostgreSQL. Sxema Alembic bilan boshqariladi:

```bash
alembic upgrade head                          # barcha migratsiyalarni qo'llash
alembic downgrade -1                          # oxirgisini qaytarish
alembic revision --autogenerate -m "tavsif"   # modellar bo'yicha yangi migratsiya
alembic current                               # joriy reviziya
```

## Konfiguratsiya

Barcha parametrlar `.env`da (shablon — [.env.example](.env.example)):

| O'zgaruvchi | Standart | Vazifa |
|---|---|---|
| `KEITARO_BASE_URL` | `https://tlgk.host` | treker manzili (`/admin_api/v1`siz) |
| `KEITARO_API_KEY` | — | Admin API kaliti |
| `KEITARO_TIMEOUT` | `15` | Keitaro'ga so'rov timeouti, s |
| `KEITARO_RETRIES` | `2` | 5xx/tarmoq xatolarida retry |
| `CAMPAIGN_PREFIX` | `test_familiya_` | kampaniya nomining majburiy prefiksi |
| `CAMPAIGN_TYPE` | `position` | oqim rotatsiyasi (`position`/`weight`) |
| `DEFAULT_DOMAIN` | `in.posdk.xyz` | kampaniya domeni (Keitaro'dagi nomi) |
| `DEFAULT_GROUP` | `FORTESTS` | kampaniya guruhi (Keitaro'dagi nomi) |
| `DEFAULT_SOURCE` | `FORTESTS` | trafik manbasi (Keitaro'dagi nomi) |
| `REDIRECT_URL` | `https://google.com` | geо-oqimning manzili |
| `REPORT_INTERVAL` | `7_days_ago` | statistika davri (`today`, `all_time`, …) |
| `REPORT_TIMEZONE` | `UTC` | hisobot vaqt zonasi |
| `DATABASE_URL` | `sqlite:///./adrobot.db` | baza (SQLite/PostgreSQL) |
| `OFFERS_CACHE_TTL` | `30` | offerlar ro'yxati keshi, s |

## Xizmat API'si

| Metod | Yo'l | Vazifa |
|---|---|---|
| GET | `/health` | xizmat + Keitaro + DB holati |
| GET | `/api/meta` | prefiks, domen/guruh/manba, Keitaro URL |
| GET | `/api/offers?q=` | offerlar autocomplete (nom yoki ID bo'yicha) |
| POST | `/api/campaigns` | kampaniya yaratish `{name, geo, offer_id}` |
| GET | `/api/campaigns?prefix=1&q=` | kampaniyalar ro'yxati (standart — prefiksli) |
| GET | `/api/campaigns/{id}` | kampaniya + oqimlar + offerlar + statistika |
| POST | `/api/campaigns/{id}/streams/{sid}/offers` | offer qo'shish `{offer_id}` |
| DELETE | `/api/campaigns/{id}/streams/{sid}/offers/{oid}` | offer o'chirish |
| GET | `/api/operations?limit=50` | operatsiyalar tarixi (audit) |

Yagona xato formati:

```json
{"error": {"code": "conflict", "message": "Oxirgi offerni o'chirib bo'lmaydi: oqim bo'shab qoladi."}}
```

Kodlar: `validation` (422), `not_found` (404), `conflict` (409), `keitaro_unavailable` / `keitaro_error` (502), `internal` (500).

Kampaniya yaratish misoli:

```bash
curl -X POST http://127.0.0.1:8000/api/campaigns \
  -H "Content-Type: application/json" \
  -d '{"name": "test_familiya_campaign1", "geo": "UZ", "offer_id": 12}'
```

## Testlar

```bash
pytest            # to'liq to'plam (24 test)
pytest -v         # batafsil
```

Qamrov: kampaniya yaratish (happy path, validatsiya, rollback), muharrir (offer qo'shish/o'chirish, ulushlarni qayta hisoblash, ziddiyatlar), offerlar qidiruvi, health/meta, ulush va alias utilitlari. Keitaro [respx](https://pypi.org/project/respx/) bilan moklanadi — testlar haqiqiy trekerga tegmaydi.

## Demo-rejim (haqiqiy Keitarosiz)

Skrinkast va lokal ishlab chiqish uchun Admin API v1 emulyatori mavjud:

```bash
# 1-terminal
python scripts/mock_keitaro.py      # http://127.0.0.1:8999

# .env
# KEITARO_BASE_URL=http://127.0.0.1:8999
# KEITARO_API_KEY=demo

# 2-terminal
uvicorn app.main:app --reload       # http://127.0.0.1:8000
```

Emulyator offerlar, ma'lumotnomalar, kampaniyalar va oqimlarni xotirada saqlaydi hamda UI'dagi raqamlar mos bo'lishi uchun deterministik «statistika» qaytaradi.

## Loyiha tuzilmasi

```
adrobot-keitaro/
├── app/
│   ├── main.py              # FastAPI, lifespan, routerlar, statika
│   ├── config.py            # pydantic-settings (.env)
│   ├── db.py                # engine, SessionLocal, Base
│   ├── models.py            # ORM: OperationLog (audit)
│   ├── schemas.py           # API Pydantic sxemalari
│   ├── errors.py            # domen xatolari + handlerlar
│   ├── countries.py         # ISO-3166 geо-kodlar
│   ├── keitaro/
│   │   ├── client.py        # Admin API v1 HTTP-mijozi (retry, timeout)
│   │   └── models.py        # Keitaro javoblari DTO'lari
│   ├── services/            # reference, offers, report, audit,
│   │                        # campaign_creator, campaign_editor, views
│   └── routers/             # meta, offers, campaigns, operations
├── alembic/                 # migratsiyalar (alembic upgrade head)
├── static/                  # UI: index.html, styles.css, app.js
├── tests/                   # pytest + respx
├── scripts/
│   ├── dev.ps1              # Windows'da tez ishga tushirish
│   └── mock_keitaro.py      # Keitaro demo-emulyatori
├── docs/                    # ARCHITECTURE.uz.md / .ru.md
├── .env.example
└── requirements.txt
```

## AI agentlardan foydalanish

- **Loyihalash** — xizmat arxitekturasi (qatlamlar, stsenariylar, reja) [docs/ARCHITECTURE.uz.md](docs/ARCHITECTURE.uz.md)da tasvirlangan va kodlashdan oldin AI agent bilan kelishilgan.
- **Kod** — backend, frontend, testlar va hujjatlar AI agentlar (DeepSeek Harness / Cursor) tomonidan tayyor API kontrakti asosida generatsiya qilindi; Keitaro API'dan farq qilgan joylar qo'lda tuzatildi.
- **Tekshiruv** — barcha testlar, migratsiyalar va smoke-stsenariylar (yaratish → statistika → offer qo'shish/o'chirish) qo'lda o'tkazildi; haqiqiy Keitaro'da `test_<familiya>_` prefiksi bilan qo'lda smoke-test bajarildi.

## Nima ulgurmadim / nimani yakunlardim

- UI uchun E2E-testlar (Playwright) — hozircha qo'lda tekshiriladi.
- Muharrirda statistikaning taymer bo'yicha avtomatik yangilanishi.
- Interfeys tilini almashtirish (RU/UZ/EN) — hozir UI rus tilida.
- Xizmat uchun avtorizatsiya (topshiriq doirasidan tashqarida — xizmat lokal).

## Litsenziya

MIT.
