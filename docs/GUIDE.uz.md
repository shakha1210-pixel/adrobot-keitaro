# Foydalanuvchi qo'llanmasi

> Maqsad: Adrobot'ni ishga tushirish va kundalik vazifalarni bajarish — ichki arxitekturani bilish shart emas.

## 1. Adrobot nima?

Adrobot — Keitaro Admin API ustidagi veb-interfeys. U shablon bo'yicha kampaniya yaratish va mavjud oqimlardagi offerlarni tahrirlashga yordam beradi. Kampaniya va offer ma'lumotlari Keitaro'da qoladi; Adrobot'ning lokal bazasi operatsiyalar jurnalini saqlash uchun ishlatiladi.

## 2. Bir necha daqiqada ishga tushirish

### Windows (PowerShell)

```powershell
git clone https://github.com/shakha1210-pixel/adrobot-keitaro.git
cd adrobot-keitaro
.\scripts\dev.ps1
```

Birinchi ishga tushirishda skript virtual muhit yaratadi, kutubxonalarni o'rnatadi, `.env.example`dan `.env` yaratadi va migratsiyalarni qo'llaydi. `.env` faylida `KEITARO_API_KEY`ni to'ldiring, `CAMPAIGN_PREFIX`, `DEFAULT_DOMAIN`, `DEFAULT_GROUP` va `DEFAULT_SOURCE`ni tekshiring, so'ng skriptni qayta ishga tushiring.

### Linux / macOS

```bash
git clone https://github.com/shakha1210-pixel/adrobot-keitaro.git
cd adrobot-keitaro
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
# .env ni to'ldiring, keyin:
alembic upgrade head
uvicorn app.main:app --reload
```

Manzillar:
- Interfeys: http://127.0.0.1:8000
- API tekshiruvi: http://127.0.0.1:8000/docs
- Umumiy holat: http://127.0.0.1:8000/health

## 3. Kampaniya yaratish

1. **Yangi kampaniya** bo'limini oching.
2. `.env`dagi majburiy prefiks bilan boshlanadigan nom kiriting (masalan, `test_familiya_`).
3. Ikki harfli ISO davlat kodini tanlang.
4. Mavjud offerni qidiring va tanlang.
5. Formani yuboring va natijani kuting.

Xizmat ikkita oqim yaratadi: birinchisi tanlangan GEO'ni `REDIRECT_URL`ga yo'naltiradi, ikkinchisi catch-all bo'lib, trafikni tanlangan offerga 100% ulush bilan yuboradi. Muvaffaqiyat faqat yaratilgan konfiguratsiya qayta o'qilib tekshirilgandan keyin ko'rsatiladi.

**Muhim:** tarmoq xatosi natijani noaniq qoldirsa, kampaniya yaratishni darhol qayta bosmang. Avval Keitaro'da kampaniya paydo bo'lganini tekshiring: so'rov bajarilgan, lekin javob ilovaga yetib kelmagan bo'lishi mumkin.

## 4. Kampaniyani tahrirlash

1. **Kampaniya muharriri** bo'limiga o'ting.
2. Kampaniyani nomi, prefiksi yoki ID bo'yicha toping.
3. Kerakli oqimni oching.
4. Offer qo'shing yoki mavjud offerlardan birini o'chiring.
5. Ulushlarni tekshiring: jami 100% bo'lishi kerak.

Oqimdagi oxirgi offerni o'chirib bo'lmaydi — oqim bo'sh qolmasligi kerak. Offerlar ro'yxati o'zgarganda Adrobot oqimning boshqa konfiguratsiya maydonlarini saqlashga harakat qiladi.

## 5. Operatsiyalar tarixi

**Operatsiyalar tarixi** bo'limida qayd etilgan amallar, ularning natijasi va vaqti ko'rsatiladi. Bu ilovaning texnik jurnali; foydalanuvchilarni alohida identifikatsiya qiladigan audit tizimi emas — autentifikatsiya va operator identifikatsiyasi hozircha mavjud emas.

## 6. Muammo yuz bersa

| Holat | Nima qilish kerak |
|---|---|
| Kalit kiritilmagan | `.env`da `KEITARO_API_KEY`ni to'ldiring va serverni qayta ishga tushiring |
| Konfiguratsiya xatosi | Domen, guruh va manba nomlarini Keitaro bilan solishtiring |
| `/health/ready` 503 qaytardi | DB va Keitaro mavjudligini tekshiring |
| `keitaro_ambiguous` | Mutatsiyani ko'r-ko'rona takrorlamang; avval Keitaro'dagi natijani tekshiring |
| Offer topilmadi | Offer mavjudligi va API kalitida unga kirish huquqi borligini tekshiring |

Loglarni ko'rish, diagnostika buyruqlari va yordam so'rash namunasi: [Texnik yordam va loglar](OPERATIONS.uz.md).

## 7. Keyingi qadamlar

- [Professional texnik hujjatlar](PROFESSIONAL.uz.md)
- [O'zbek tilida arxitektura](ARCHITECTURE.uz.md)
- [Asosiy README va API ma'lumotnomasi](../README.uz.md)
