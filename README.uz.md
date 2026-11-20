# Adrobot — Keitaro ustidan o'ram (wrapper)

[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.x-D71F00)](https://www.sqlalchemy.org/)
[![Ruff](https://img.shields.io/badge/Lint-Ruff-D7FF64?logo=ruff&logoColor=black)](https://docs.astral.sh/ruff/)
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
- [Keitaro integratsiyasi ishonchliligi](#keitaro-integratsiyasi-ishonchliligi)
- [Testlar va kod sifati](#testlar-va-kod-sifati)
- [Demo-rejim](#demo-rejim-haqiqiy-keitarosiz)
- [Loyiha tuzilmasi](#loyiha-tuzilmasi)
- [Muammolarni bartaraf etish](#muammolarni-bartaraf-etish)
- [Xavfsizlik](#xavfsizlik)
- [Ma'lum cheklovlar](#malum-cheklovlar)
- [AI agentlardan foydalanish](#ai-agentlardan-foydalanish)

## Nimalarni biladi

**Kampaniya yaratuvchi** (UI'dagi `Yangi kampaniya`):

- nom tekshiruvi — majburiy `test_<familiya>_` prefiksi backendda tekshiriladi;
- geо-kod — ISO-3166 bo'yicha 2 harf (113 kodlik ma'lumotnoma), katta harfga o'giriladi;
- offer Keitaro'da mavjudligi tekshiriladi (yo'q bo'lsa `404`);
- kampaniya domen, guruh va manba bilan yaratiladi (nomlari `.env`dan ID'ga aylantiriladi);
- 1-oqim (1-pozitsiya): «davlat = geо» filtri → `REDIRECT_URL` (Google)ga redirect;
- 2-oqim (2-pozitsiya): catch-all → tanlangan offer, ulushi 100%;
- oqimlar qadamida xato bo'lsa, yaratilgan kampaniya avtomatik qaytariladi (arxivlanadi);
- har bir operatsiya `operation_log` audit jadvaliga yoziladi.

**Kampaniya muharriri** (UI'dagi `Kampaniya muharriri`):

- kampaniyalarni prefiks/nom/ID bo'yicha qidirish;
- oqim kartalari: filtrlar, vazifa, holat;
- offer qo'shish — ulushlar avtomatik qayta hisoblanadi, **yig'indi doim = 100%**;
- offer o'chirish — ulushlar qayta taqsimlanadi; oxirgi offerni o'chirib bo'lmaydi (`409`);
- har bir offer bo'yicha statistika (klik, unik, bot, konversiya, CR) bevosita `POST /report/build`dan;
- offerlarni tahrirlaganda **oqimning boshqa konfiguratsiyasi yo'qolmaydi**: PUT oqimning asl ko'rinishidan quriladi (triggers, comments, filter_or, chance, action_options, landings saqlanadi) — regressiya testi bilan qoplangan.

**Interfeys** — premium pixel-terminal mavzu (boot-ekran, CRT-effektlar, sanash animatsiyalari), **ikki til: rus va o'zbek** (sarlavhadagi `RU | UZ` almashtirgichi, tanlov brauzerda eslab qolinadi, mamlakat nomlari va barcha xabarlar — ikkala tilda).

## Tez boshlash

```bash
git clone <repo URL>
cd adrobot-keitaro

# Windows (PowerShell)
python -m venv .venv
.\.venv\Scripts\activate
# Linux / macOS
# python3 -m venv .venv && source .venv/bin/activate

pip install -r requirements-dev.txt   # runtime + testlar + ruff

cp .env.example .env        # Windows: copy .env.example .env
# .env ni tahrirlang: KEITARO_API_KEY va CAMPAIGN_PREFIX

alembic upgrade head        # migratsiyalarni qo'llash
uvicorn app.main:app --reload
```

<http://127.0.0.1:8000> — interfeys, <http://127.0.0.1:8000/docs> — Swagger.

> **Windows'da bitta buyruq:** `.\scripts\dev.ps1` — venv yaratadi, kutubxonalarni o'rnatadi, migratsiyani qo'llaydi va serverni ishga tushiradi. Commitdan oldin to'liq tekshiruv: `.\scripts\check.ps1`.

## O'rnatish va ishga tushirish

Talablar: **Python 3.11+**, Keitaro'ga kirish va API kaliti (admindagi `Profil → API kalitlar`).

| Qadam | Buyruq |
|---|---|
| 1. Klonlash | `git clone <repo URL> && cd adrobot-keitaro` |
| 2. Muhit | `python -m venv .venv` → aktivatsiya (yuqoriga qarang) |
| 3. Kutubxonalar | `pip install -r requirements-dev.txt` (yoki faqat runtime: `requirements.txt`) |
| 4. Konfiguratsiya | `cp .env.example .env`, so'ng `KEITARO_API_KEY`, `CAMPAIGN_PREFIX`ni yozing |
| 5. Migratsiyalar | `alembic upgrade head` |
| 6. Ishga tushirish | `uvicorn app.main:app --reload` |

API kalitsiz xizmat ishlaydi, lekin Keitaro operatsiyalari ishlamaydi — UI'da «kalit berilmagan» holati, `/health/ready` esa `503` qaytaradi.

## Migratsiyalar

Baza standart bo'yicha SQLite (`adrobot.db`), xohlasangiz `DATABASE_URL` orqali PostgreSQL. Sxema Alembic bilan boshqariladi:

```bash
alembic upgrade head                          # barcha migratsiyalarni qo'llash
alembic downgrade -1                          # oxirgisini qaytarish
alembic revision --autogenerate -m "tavsif"   # modellar bo'yicha yangi migratsiya
alembic current                               # joriy reviziya
```

Toza bazada `alembic upgrade head` CI'da tekshiriladi (`migrations` job).

## Konfiguratsiya

Barcha parametrlar `.env`da (shablon — [.env.example](.env.example)):

| O'zgaruvchi | Standart | Vazifa |
|---|---|---|
| `KEITARO_BASE_URL` | `https://tlgk.host` | treker manzili (`/admin_api/v1`siz) |
| `KEITARO_API_KEY` | — | Admin API kaliti |
| `KEITARO_TIMEOUT` | `15` | Keitaro'ga so'rov timeouti, s |
| `KEITARO_RETRIES` | `2` | **idempotent** operatsiyalarda 5xx/tarmoq xatosida retry |
| `CAMPAIGN_PREFIX` | `test_familiya_` | kampaniya nomining majburiy prefiksi |
| `CAMPAIGN_TYPE` | `position` | oqim rotatsiyasi (`position`/`weight`) |
| `DEFAULT_DOMAIN` | `kylovoa.com` | kampaniya domeni (Keitaro'dagi nomi) |
| `DEFAULT_GROUP` | `FORTESTS` | kampaniya guruhi (Keitaro'dagi nomi) |
| `DEFAULT_SOURCE` | `FORTESTS` | trafik manbasi (Keitaro'dagi nomi) |
| `REDIRECT_URL` | `https://google.com` | geо-oqimning manzili |
| `COUNTRY_FILTER_NAME` | `country` | Admin API'dagi mamlakat filtri nomi (haqiqiy Keitaro'da tekshirilgan) |
| `COUNTRY_FILTER_MODE` | `accept` | mamlakat filtri rejimi (`accept`/`reject`) |
| `REPORT_INTERVAL` | `7_days_ago` | statistika davri (`today`, `all_time`, …) |
| `REPORT_TIMEZONE` | `UTC` | hisobot vaqt zonasi |
| `DATABASE_URL` | `sqlite:///./adrobot.db` | baza (SQLite/PostgreSQL) |
| `OFFERS_CACHE_TTL` | `30` | offerlar ro'yxati keshi, s |

## Xizmat API'si

| Metod | Yo'l | Vazifa |
|---|---|---|
| GET | `/health` | umumiy holat (doim 200: `keitaro`, `db`) |
| GET | `/health/live` | liveness — jarayon tirikmi (200) |
| GET | `/health/ready` | readiness — DB va Keitaro bo'yicha 200/503 |
| GET | `/api/meta` | prefiks, domen/guruh/manba, Keitaro URL |
| GET | `/api/offers?q=` | offerlar autocomplete (nom yoki ID bo'yicha) |
| POST | `/api/campaigns` | kampaniya yaratish `{name, geo, offer_id}` |
| GET | `/api/campaigns?prefix=1&q=` | kampaniyalar ro'yxati (standart — prefiksli) |
| GET | `/api/campaigns/{id}` | kampaniya + oqimlar + offerlar + statistika |
| POST | `/api/campaigns/{id}/streams/{sid}/offers` | offer qo'shish `{offer_id}` |
| DELETE | `/api/campaigns/{id}/streams/{sid}/offers/{oid}` | offer o'chirish |
| GET | `/api/operations?limit=50` | operatsiyalar tarixi (audit) |

Har bir javobda `X-Request-ID` sarlavhasi (loglar bilan bog'lash uchun). Yagona xato formati:

```json
{"error": {"code": "conflict", "message": "Oxirgi offerni o'chirib bo'lmaydi: oqim bo'shab qoladi."}}
```

Kodlar: `validation` (422), `not_found` (404), `conflict` (409), `keitaro_unavailable` (502, Keitaro ochilmayapti), `keitaro_error` (502, integratsiya xatosi), `keitaro_ambiguous` (502, operatsiya natijasi noma'lum — pastga qarang), `internal` (500).

Kampaniya yaratish misoli:

```bash
curl -X POST http://127.0.0.1:8000/api/campaigns \
  -H "Content-Type: application/json" \
  -d '{"name": "test_familiya_campaign1", "geo": "UZ", "offer_id": 12}'
```

## Keitaro integratsiyasi ishonchliligi

Keitaro — tashqi tizim: timeout berishi, 5xx qaytarishi yoki so'rovni tasdiqsiz «yutib yuborishi» mumkin. Strategiya:

- **Mutatsiyalar ko'r-ko'rona takrorlanmaydi.** `POST /campaigns` va `POST /streams` aynan bir marta bajariladi: Keitaro idempotency-kalitlarni qo'llab-quvvatlamaydi, timeout esa «yaratilmadi» degani emas. Timeout/5xx bo'lsa `keitaro_ambiguous` qaytadi va admin bilan solishtirish so'raladi; qisman xato bo'lsa yaratilgan kampaniya qaytariladi (arxivlanadi).
- **O'qishlar takrorlanadi.** GET (va idempotent PUT/DELETE hamda read-only `POST /report/build`) tarmoq xatolari va 5xx/429 da `KEITARO_RETRIES` marta retry qilinadi.
- **Konfiguratsiya saqlanadi.** Oqim PUT'i GET'dan olingan asl ko'rinishdan quriladi — faqat offer bog'lanishlari o'zgaradi.
- **Xatolar sizib chiqmaydi.** Keitaro'ning ichki xabarlari faqat logga yoziladi; mijozga xavfsiz matn qaytadi.
- **Hisobot yiqilsa muharrir ishlashda davom etadi** — statistika nollarga tushadi, logga ogohlantirish yoziladi.

## Testlar va kod sifati

```bash
pytest                        # 51 ta test
pytest -v                     # batafsil
pytest tests/test_keitaro_client.py -v   # retry siyosati va noaniq natijalar
ruff check .                  # linter
ruff format --check .         # formatter
node --check static/app.js    # frontend sintaksisi
.\scripts\check.ps1           # hammasi birdaniga (Windows)
```

Qamrov: yaratish (happy path, validatsiya, rollback, noaniq natija), muharrir (ulushlar, ziddiyatlar, **oqimning boshqa konfiguratsiyasini saqlash**, statistika degradatsiyasi), Keitaro mijozi (idempotent retry, mutatsiyalarda retry yo'q, 4xx/401, timeoutlar), health (live/ready), audit (shu jumladan DB yiqilishi → xavfsiz 500), korrelyatsion ID'lar, ichki xatolarning sizib chiqmasligi. Keitaro [respx](https://pypi.org/project/respx/) bilan moklanadi — testlar haqiqiy trekerga tegmaydi.

Kod sifati: [Ruff](https://docs.astral.sh/ruff/) (lint + format), sozlamalar [pyproject.toml](pyproject.toml)da; ixtiyoriy pre-commit (`.pre-commit-config.yaml`); GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)): ruff, pytest Python 3.11–3.13'da, toza bazada migratsiyalar, frontend tekshiruvi.

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
│   ├── main.py              # FastAPI, lifespan, middleware (X-Request-ID), statika
│   ├── config.py            # pydantic-settings (.env)
│   ├── db.py                # engine, SessionLocal, Base
│   ├── models.py            # ORM: OperationLog (audit)
│   ├── schemas.py           # API Pydantic sxemalari
│   ├── errors.py            # domen xatolari + xavfsiz handlerlar
│   ├── countries.py         # ISO-3166 geо-kodlar (113)
│   ├── keitaro/
│   │   ├── client.py        # HTTP-mijoz: timeoutlar, xavfsiz retry, DTO
│   │   └── models.py        # Keitaro javoblari DTO'lari (+ yo'qotishsiz PUT uchun raw)
│   ├── services/            # reference, offers, report, audit,
│   │                        # campaign_creator, campaign_editor, views
│   └── routers/             # meta (health), offers, campaigns, operations
├── alembic/                 # migratsiyalar (alembic upgrade head)
├── static/                  # UI: index.html, styles.css, premium.css, fx.js, app.js
├── tests/                   # pytest + respx (51 test)
├── scripts/
│   ├── dev.ps1              # Windows'da tez ishga tushirish
│   ├── check.ps1            # lint + testlar + frontend
│   └── mock_keitaro.py      # Keitaro demo-emulyatori
├── docs/                    # ARCHITECTURE.uz.md / .ru.md
├── .github/workflows/ci.yml # CI: lint, testlar, migratsiyalar, frontend
├── pyproject.toml           # ruff + pytest sozlamalari
├── requirements.txt         # runtime-kutubxonalar
├── requirements-dev.txt     # + pytest, respx, ruff
├── .env.example
└── README.md / README.uz.md
```

## Muammolarni bartaraf etish

| Belgisi | Sabab va yechim |
|---|---|
| `422 validation: Nom prefiks bilan boshlanishi kerak…` | nom prefikssiz — `.env`dagi `CAMPAIGN_PREFIX`ni tekshiring |
| `502 keitaro_error` (umumiy matn bilan) | Keitaro xato qaytardi: aniq sabab xizmat logida; admin panelidagi kalitni tekshiring |
| `502 keitaro_ambiguous` | operatsiya tasdiqsiz bajarilgan bo'lishi mumkin: admin panelida kampaniyani tekshiring va ko'r-ko'rona takrorlamang |
| `/health/ready` → `503` | Keitaro yoki DB ochilmayapti; `/health` aynan nimani ko'rsatadi |
| UI: «Konfiguratsiya mavjud emas» | Keitaro'da domen/guruh/manba topilmadi — `.env`dagi `DEFAULT_*`ni admin nomlari bilan solishtiring |
| `alembic`da `ModuleNotFoundError` | venv'ni aktivlashtiring yoki `python -m alembic` ishlating |

## Xavfsizlik

- `.env` commit qilinmaydi (`.gitignore`); repoda faqat `.env.example`.
- API kaliti faqat Keitaro so'rovlarining `Api-Key` sarlavhasida uzatiladi — loglarga va javoblarga tushmaydi.
- CORS yoqilmagan — ilova faqat same-origin so'rovlarga xizmat qiladi (frontend FastAPI'ning o'zi tomonidan beriladi). Alohida frontend-domen uchun CORS'ni aniq va faqat kerakli origin uchun sozlang.
- Keitaro'ning ichki xato matnlari va traceback'lar API javoblariga chiqmaydi (test bilan tekshiriladi); batafsil ma'lumot — loglarda.
- Tashqi URL'lar faqat `.env`dan olinadi (Keitaro, redirect), foydalanuvchi kiritgan URL ishlatilmaydi — SSRF yuzasi yo'q.
- Ochiq cheklovlar: xizmat lokal/bir foydalanuvchili (avtorizatsiya yo'q), SQLite — shifrlashsiz; ommaviy deploydan oldin authN va TLS'li reverse-proxy qo'shing.

## Ma'lum cheklovlar

- Keitaro maydonlarining aniq nomlari (mamlakat filtri uchun `country`/`accept`, ofer oqimi uchun `schema: "landings"`, `POST /campaigns`da `domain_id`) **haqiqiy trekerda tekshirilgan**; boshqa Keitaro versiyasi uchun — tuzatish bitta joyda (`app/services/campaign_creator.py` va `.env`dagi `COUNTRY_FILTER_*`).
- Oqim PUT'i — ko'rinishni to'liq almashtirish (Admin API v1 shunday ishlaydi); maydonlar saqlanishi asl payload yuborish bilan ta'minlanadi, lekin xatti-harakat hujjat va mok-serverda tekshirilgan — sizning Keitaro o'rnatmangizda emas.
- Interfeys — rus va o'zbek tillarida (sarlavhadagi almashtirgich); **backend xato xabarlari hozircha rus tilida** (mijoz xabarlari lokallashtirilgan, server xabarlari yo'q).
- Muharrirda statistika tugma orqali yangilanadi (taymerli avto-yangilanish yo'q).

## AI agentlardan foydalanish

- **Loyihalash** — xizmat arxitekturasi (qatlamlar, stsenariylar, reja) [docs/ARCHITECTURE.uz.md](docs/ARCHITECTURE.uz.md)da tasvirlangan va kodlashdan oldin AI agent bilan kelishilgan.
- **Kod** — backend, frontend, testlar va hujjatlar AI agentlar (DeepSeek Harness / Cursor) tomonidan tayyor API kontrakti asosida generatsiya qilindi; Keitaro kontrakti rasmiy Admin API v1 hujjati bilan solishtirildi.
- **Tekshiruv** — barcha testlar, migratsiyalar, linter va smoke-stsenariylar (yaratish → statistika → offer qo'shish/o'chirish → rollback) qo'lda o'tkazildi; haqiqiy Keitaro'da `test_<familiya>_` prefiksi bilan qo'lda smoke-test bajarildi.

## Litsenziya

MIT — [LICENSE](LICENSE)ga qarang.
