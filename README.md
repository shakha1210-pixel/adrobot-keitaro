# Adrobot — обёртка над Keitaro

> 🇺🇿 O'zbekcha: [README.uz.md](README.uz.md) · Архитектура: [docs/ARCHITECTURE.ru.md](docs/ARCHITECTURE.ru.md)

Веб-сервис на **FastAPI + SQLAlchemy** поверх Admin API трекера Keitaro:

1. **Создатель кампаний** — название, гео, ID оффера → кампания с двумя потоками (гео → Google, остальные → оффер), с настроенными доменом, группой и источником.
2. **Редактор кампании** — добавление и удаление офферов, верные доли и статистика.

> 🚧 Статус: проектирование завершено, реализация — по плану из архитектуры.

## Требования
- Python 3.11+
- Доступ к Keitaro и API-ключ (Профиль → API ключи)

## Запуск

```bash
git clone <URL репозитория>
cd adrobot-keitaro

python -m venv .venv
# Windows: .venv\Scripts\activate     Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env        # Windows: copy .env.example .env
# впишите KEITARO_API_KEY и CAMPAIGN_PREFIX (test_<фамилия>_) в .env

alembic upgrade head        # миграции
uvicorn app.main:app --reload
```

Откройте http://127.0.0.1:8000 (UI) или http://127.0.0.1:8000/docs (Swagger).

## Тесты
```bash
pytest
```

## Безопасность
- `.env` в `.gitignore`; **ключи и пароли в репозиторий не коммитим**.
- Все кампании создаются с префиксом `test_<фамилия>_`.

## Использование ИИ-агентов
Заполняется перед сдачей (что делал агент, что проверял вручную).

## Что не успел / что бы доделал
Заполняется перед сдачей.
