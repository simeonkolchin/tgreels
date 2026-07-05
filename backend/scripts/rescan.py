"""Полный пере-скан истории каналов: сбрасывает курсоры и заново проходит всю
историю. Нужен, чтобы задним числом подхватить фото (или новые поля) по уже
проиндексированным каналам. Данные не удаляются (INSERT OR IGNORE).

    docker compose stop worker
    docker compose run --rm worker python scripts/rescan.py
    docker compose start worker
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import repo  # noqa: E402
from app.parser.indexer import index_all  # noqa: E402
from app.telegram.client import ensure_authorized  # noqa: E402


async def main():
    if not await ensure_authorized():
        print("Сессия не авторизована — сначала: python scripts/login.py")
        return
    repo.reset_cursors()
    print("[rescan] курсоры сброшены, перечитываю всю историю…")
    await index_all()


if __name__ == "__main__":
    asyncio.run(main())
