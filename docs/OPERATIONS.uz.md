# Texnik yordam, loglar va diagnostika

Adrobot'ning lokal nusxasi bilan ishlaydigan dasturchi yoki operator uchun amaliy qo'llanma.

## 1. Loglar qayerda?

Uvicorn odatiy usulda ishga tushirilganda loglar server ishlayotgan terminalga chiqadi. Standart format:

```text
2026-11-21 12:00:00 INFO    app.module: xabar
```

Standart daraja — INFO. Ilova alohida log fayli yoki fayllarni aylantirish (rotation) mexanizmini sozlamaydi. Uzoq muddatli tarix kerak bo'lsa, stdout/stderr oqimini OS, Docker yoki deploy platformasi orqali saqlashni sozlang.

### Windows PowerShell: chiqishni faylga yozish

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload 2>&1 |
  Tee-Object -FilePath .\adrobot-console.log
```

### Linux / macOS: chiqishni faylga yozish

```bash
uvicorn app.main:app --reload 2>&1 | tee -a adrobot-console.log
```

Loglarni ulashishdan oldin tekshiring: ularda ichki URL, kampaniya nomlari yoki diagnostika ma'lumotlari bo'lishi mumkin. API kalitlari, parollar va `.env` faylini yubormang.

## 2. Xizmat holatini tekshirish

Alohida terminalda:

```bash
curl -i http://127.0.0.1:8000/health
curl -i http://127.0.0.1:8000/health/live
curl -i http://127.0.0.1:8000/health/ready
```

- `/health` — bog'liqliklarning umumiy holati.
- `/health/live` — jarayon javob beryaptimi.
- `/health/ready` — ilova DB va Keitaro bilan ishlashga tayyormi; muammo bo'lsa 503 qaytarishi mumkin.

API konfiguratsiyasi: `http://127.0.0.1:8000/api/meta`. Swagger: `http://127.0.0.1:8000/docs`.

## 3. HTTP xatosini log bilan bog'lash: X-Request-ID

Har bir HTTP javobida `X-Request-ID` sarlavhasi bor. Mijoz shu sarlavhani yuborsa, ilova undan foydalanadi; aks holda qisqa ID yaratadi.

```bash
curl -i http://127.0.0.1:8000/health
```

Javob sarlavhalaridan `X-Request-ID`ni topib, yordam so'raganda yuboring. O'zingiz ID berishingiz ham mumkin:

```bash
curl -i -H "X-Request-ID: support-check-001" \
  http://127.0.0.1:8000/health
```

Eslatma: hozirgi log formati request ID'ni avtomatik ravishda har bir log qatoriga qo'shmaydi. Sarlavha so'rov va javobni mijoz tomonda bog'lashga yordam beradi, ammo to'liq distributed tracing emas.

## 4. Ko'p uchraydigan muammolar

| Belgisi | Tekshiruv |
|---|---|
| Server ishga tushmaydi | Virtual muhit faolligi, kutubxonalar o'rnatilgani, 8000-port bo'shligi |
| `/health/ready` → 503 | `DATABASE_URL`, DB mavjudligi, `KEITARO_BASE_URL` va API kalitini tekshiring |
| `keitaro_unavailable` | DNS/tarmoq, TLS, treker URL'i, timeout |
| `keitaro_error` | Server terminalidagi status va diagnostik xabarni ko'ring; API kalit huquqlarini tekshiring |
| `keitaro_ambiguous` | Operatsiyani takrorlashdan oldin Keitaro'ni qo'lda tekshiring |
| Domen/guruh/manba topilmaydi | `DEFAULT_DOMAIN`, `DEFAULT_GROUP`, `DEFAULT_SOURCE`ni Keitaro'dagi nomlar bilan solishtiring |
| Migratsiya xatosi | `alembic current`, `DATABASE_URL` va Alembic chiqishini tekshiring |

## 5. Natijasi noaniq operatsiyada xavfsiz tartib

1. To'xtang — POST so'rovini avtomatik qayta yubormang.
2. Xato matni, vaqt va HTTP request ID'ni saqlang.
3. Keitaro'ni ochib, kampaniya yoki oqim yaratilganini tekshiring.
4. Kampaniya qisman yaratilgan bo'lsa, uning haqiqiy oqimlari va holatini ko'ring.
5. Tekshiruvdan keyingina amalni takrorlash yoki konfiguratsiyani tuzatish haqida qaror qiling.

## 6. Loyihani topshirishdan oldingi lokal tekshiruv

Windows:

```powershell
.\scripts\check.ps1
```

Barcha platformalarda:

```bash
ruff check .
ruff format --check .
pytest -v
node --check static/app.js
alembic upgrade head
```

Joriy test to'plamida 58 ta test funksiyasi mavjud. Pytest'ning haqiqiy natijasi muhitda yoki CI'da ishga tushirib tasdiqlanishi kerak.

## 7. Yordam so'rash uchun kerakli ma'lumotlar

Quyidagilarni tayyorlang:
- OS va Python versiyasi;
- ishga tushirish usuli (PowerShell, shell, Docker/boshqa);
- xato vaqti hamda uni takrorlash qadamlari;
- endpoint va HTTP status;
- mavjud bo'lsa `X-Request-ID`;
- xato atrofidagi maxfiy ma'lumotlardan tozalangan log parchasi;
- `/health` va `/health/ready` natijalari.

API kaliti, parol, to'liq `.env`, shaxsiy ma'lumot yoki tozalanmagan maxfiy qiymatlarni yubormang.

## 8. Keyingi tekshiruv

Keitaro API tuzilmasiga oid muammo bo'lsa, haqiqiy payload'ni trekeringizdagi Admin API versiyasi bilan solishtiring. Arxitektura qarorlari [arxitektura hujjatida](ARCHITECTURE.uz.md), ilova parametrlari esa [professional qo'llanmada](PROFESSIONAL.uz.md) berilgan.
