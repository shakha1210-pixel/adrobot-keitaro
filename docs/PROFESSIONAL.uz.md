# Professional texnik qo'llanma

Adrobot'ni ishlab chiquvchi, code review qiluvchi va qo'llab-quvvatlovchi muhandislar uchun.

## 1. Texnik profil

- Python 3.11+, FastAPI, Pydantic Settings.
- Keitaro Admin API v1 uchun asinxron HTTP-mijoz.
- SQLAlchemy 2.x va Alembic; standart SQLite, `DATABASE_URL` orqali PostgreSQL.
- FastAPI static files orqali beriladigan Vanilla JavaScript interfeys.
- pytest + respx, Ruff, GitHub Actions.

## 2. Mas'uliyat chegaralari

Kampaniya, oqim va offerlar uchun asosiy ma'lumot manbai — Keitaro. Adrobot'ning lokal bazasi biznes obyektlar nusxasini emas, operatsiyalar jurnalini (`operation_log`) saqlaydi. Ilovada foydalanuvchi autentifikatsiyasi va rollar bo'yicha ruxsatlar yo'q; joriy model lokal yoki nazorat qilinadigan foydalanishga mo'ljallangan.

## 3. Arxitektura qatlamlari

- **Routers** — HTTP kontrakti va marshrutlar: meta/health, offers, campaigns, operations.
- **Services** — kampaniya yaratish/tahrirlash, offer qidirish, ma'lumotnomalarni ID'ga aylantirish, hisobot va audit.
- **Keitaro client** — transport qatlami: timeout, xatolarni tasniflash, xavfsiz retry siyosati.
- **DTO / schemas** — tashqi API javoblarini normallashtirish va kiruvchi so'rovlarni tekshirish.
- **Persistence** — operatsiyalar jurnali uchun SQLAlchemy modeli va Alembic migratsiyalari.
- **Static UI** — rus va o'zbek tillaridagi interfeys.

Batafsil sxemalar va ketma-ketliklar: [ARCHITECTURE.uz.md](ARCHITECTURE.uz.md).

## 4. Kampaniya yaratish ssenariysi

1. Nom, ISO geo-kod va offer ID'ni tekshirish.
2. Tanlangan offer mavjudligini tekshirish.
3. Domen, guruh va manba nomlarini Keitaro ID'lariga aylantirish.
4. Kampaniya yaratish.
5. Country filter va redirect action bilan GEO oqimini yaratish.
6. Tanlangan offer bilan catch-all oqimini yaratish.
7. Kampaniya/oqimlarni qayta o'qib, haqiqiy konfiguratsiyani tekshirish.
8. Natijani operatsiyalar jurnaliga yozish.

Qisman xatoda ID ma'lum bo'lgan kampaniya kompensatsion amal bilan arxivlanadi. POST noaniq yakunlansa va kampaniya ID noma'lum bo'lsa, xizmat so'rovni ko'r-ko'rona takrorlamaydi: operator Keitaro holatini tekshirishi kerak.

## 5. Tahrirlash ssenariysi

Muharrir oqimning asl ko'rinishini saqlagan holda offer bog'lanishlarini o'zgartiradi. Ulushlar jami 100% bo'lishi uchun qayta hisoblanadi; oxirgi offerni o'chirish taqiqlangan. Haqiqiy Keitaro'da offer oqimi `schema: "landings"`dan foydalanadi; eski `offers` ko'rinishi bilan moslik adapter qatlamida boshqariladi.

## 6. Retry va xatolar siyosati

- GET va boshqa xavfsiz/idempotent amallar tarmoq xatosi, 5xx va 429 holatlarida takrorlanishi mumkin.
- Yaratadigan POST so'rovlari avtomatik takrorlanmaydi: tashqi API idempotency key bermaydi, timeout esa amal bajarilmaganini isbotlamaydi.
- Tashqi xatoning ichki tafsilotlari ommaviy HTTP javobiga chiqmasligi kerak.
- Hisobot statistikasi muharrirning asosiy ssenariysidan alohida degradatsiyalanishi mumkin.

Qo'shimcha: [asosiy README](../README.uz.md)dagi Keitaro integratsiyasi ishonchliligi bo'limi.

## 7. Konfiguratsiya va migratsiyalar

Barcha parametrlar Pydantic Settings orqali `.env` / environment variables'dan olinadi. Namuna: [../.env.example](../.env.example).

```bash
alembic upgrade head
alembic current
alembic downgrade -1
```

Standart baza — SQLite. PostgreSQL uchun `DATABASE_URL`ga to'g'ri SQLAlchemy URL kiriting va kerakli driver muhitda o'rnatilganini tekshiring.

## 8. HTTP kontrakti

| Metod | Endpoint | Vazifa |
|---|---|---|
| GET | `/health`, `/health/live`, `/health/ready` | holat va tayyorlik |
| GET | `/api/meta` | UI parametrlari va konfiguratsiya holati |
| GET | `/api/offers?q=` | offer qidirish |
| POST | `/api/campaigns` | kampaniya yaratish |
| GET | `/api/campaigns?prefix=1&q=` | kampaniyalar ro'yxati |
| GET | `/api/campaigns/{id}` | kampaniya, oqimlar, offerlar, statistika |
| POST | `/api/campaigns/{id}/streams/{sid}/offers` | offer qo'shish |
| DELETE | `/api/campaigns/{id}/streams/{sid}/offers/{oid}` | offer o'chirish |
| GET | `/api/operations?limit=50` | operatsiyalar jurnali |

Har bir javobda `X-Request-ID` mavjud. Xato formati — kod va xavfsiz xabarni o'z ichiga olgan `error` obyekti. Asosiy kodlar: validation, not_found, conflict, keitaro_unavailable, keitaro_error, keitaro_ambiguous, internal.

## 9. Sifat va testlash

Joriy to'plamda 58 ta test funksiyasi bor. Tekshiruvlar:

```bash
ruff check .
ruff format --check .
pytest -v
node --check static/app.js
alembic upgrade head
```

Windows shortcut: `.\scripts\check.ps1`. Keitaro integratsiyasi testlari respx'dan foydalanadi va haqiqiy trekerga so'rov yubormasligi kerak. CI lint, Python 3.11–3.13 da testlar, toza DB'da migratsiyalar va frontend sintaksisini tekshiradi.

## 10. Xavfsizlik va ekspluatatsiya cheklovlari

- `.env`ni commit qilmang; API key'ni log yoki issue'ga kiritmang.
- Ilovada ichki autentifikatsiya yo'q; uni bevosita ommaviy internetga chiqarmang.
- Tashqi deploy uchun authentication/authorization, TLS reverse proxy, secret storage, tarmoq cheklovlari va monitoring qo'shing.
- Ilova loglarni stdout/stderr'ga chiqaradi; aylantirish va uzoq muddat saqlash ishga tushirish muhiti zimmasida.
- Foydalanuvchi auth modeli bo'lmagani uchun operatsiyalar jurnali operator shaxsini ko'rsatmaydi.

## 11. Tegishli hujjatlar

- [Arxitektura](ARCHITECTURE.uz.md)
- [Diagnostika, loglar va yordam](OPERATIONS.uz.md)
- [Foydalanuvchi qo'llanmasi](GUIDE.uz.md)
- [README va ishga tushirish](../README.uz.md)
