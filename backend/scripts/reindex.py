"""Ручной запуск индексации (разово).

    docker compose run --rm backend python scripts/reindex.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.parser.indexer import index_all  # noqa: E402
from app.telegram.client import ensure_authorized  # noqa: E402


async def main():
    if not await ensure_authorized():
        print("Сессия не авторизована — сначала: python scripts/login.py")
        return
    await index_all()


if __name__ == "__main__":
    asyncio.run(main())
