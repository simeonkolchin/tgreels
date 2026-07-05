"""Интерактивная авторизация userbot-сессии.

Запуск (локально):   python scripts/login.py
Запуск (в докере):   docker compose run --rm backend python scripts/login.py

Спросит телефон, код из Telegram и (если включена) 2FA-пароль.
Сессия сохранится в SESSION_PATH (см. .env) и переживёт рестарты.
"""
import asyncio
import sys
from pathlib import Path

# чтобы работал импорт `app.*` при запуске как скрипт
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import config  # noqa: E402
from app.telegram.client import build_client  # noqa: E402


async def main():
    if not config.api_id or not config.api_hash:
        print("Заполни API_ID / API_HASH в .env")
        return

    client = build_client()
    # client.start() сам спросит телефон/код/пароль в консоли
    await client.start()

    me = await client.get_me()
    print(f"\n✅ Готово! Вошли как: {me.first_name} (@{me.username})")
    print(f"Сессия сохранена: {config.session_path}.session")
    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
