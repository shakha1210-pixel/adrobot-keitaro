# Adrobot — Keitaro ustidan o'ram

> 🇷🇺 По-русски: [README.md](README.md) · Arxitektura: [docs/ARCHITECTURE.uz.md](docs/ARCHITECTURE.uz.md)

**FastAPI + SQLAlchemy**'da Keitaro trekerining Admin API'si ustidagi veb-xizmat:

1. **Kampaniya yaratuvchi** — nom, geo, offer ID → ikki oqimli kampaniya (geo → Google, qolganlar → offer), domen, guruh va manba sozlangan.
2. **Kampaniya muharriri** — offer qo'shish va o'chirish, to'g'ri ulush va statistika.

> 🚧 Holat: loyihalash tugagan, amalga oshirish arxitektura rejasi bo'yicha.

## Talablar
- Python 3.11+
- Keitaro'ga kirish va API kaliti (Profil → API kalitlar)

## Ishga tushirish

```bash
git clone <repo URL>
cd adrobot-keitaro

python -m venv .venv
# Windows: .venv\Scripts\activate     Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env        # Windows: copy .env.example .env
# .env ga KEITARO_API_KEY va CAMPAIGN_PREFIX (test_<familiya>_) yozing

alembic upgrade head        # migratsiyalar
uvicorn app.main:app --reload
```

http://127.0.0.1:8000 (UI) yoki http://127.0.0.1:8000/docs (Swagger) ni oching.

## Testlar
```bash
pytest
```

## Xavfsizlik
- `.env` `.gitignore`da; **kalit va parollarni repoga commit qilmaymiz**.
- Barcha kampaniyalar `test_<familiya>_` prefiksi bilan yaratiladi.

## AI agentlardan foydalanish
Topshirishdan oldin to'ldiriladi (agent nima qildi, qo'lda nimani tekshirdim).

## Nima ulgurmadim / nimani yakunlardim
Topshirishdan oldin to'ldiriladi.
