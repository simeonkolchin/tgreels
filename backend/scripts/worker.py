"""Парсер-воркер: отдельный процесс/контейнер.

Крутится независимо от API: индексирует каналы, пишет в общую БД и каждые
INDEX_INTERVAL_HOURS часов повторяет проход. При падении контейнер поднимает
его заново (restart: unless-stopped в docker-compose).

Использует СВОЮ Telethon-сессию (SESSION_PATH воркера) — сессию нельзя шарить
между процессами. Логин делается отдельно (см. README).
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import config  # noqa: E402
from app.db import repo  # noqa: E402
from app.parser.indexer import index_all  # noqa: E402
from app.telegram.client import ensure_authorized  # noqa: E402

INTERVAL = config.index_interval_hours * 3600


async def main():
    print(f"[worker] старт. интервал переиндексации: {config.index_interval_hours} ч")

    # Если БД уже наполнена (ручной первый прогон перед стартом) — не дублируем
    # проход сразу, ждём интервал. На пустой БД индексируем немедленно.
    if repo.count_videos() > 0:
        print(f"[worker] в БД уже {repo.count_videos()} видео — первый авто-проход через интервал")
        await asyncio.sleep(INTERVAL)

    while True:
        try:
            if await ensure_authorized():
                await index_all()
            else:
                print(
                    "[worker] сессия не авторизована. Залогинь воркера:\n"
                    "  docker compose run --rm worker python scripts/login.py"
                )
        except Exception as e:  # noqa: BLE001
            print(f"[worker] проход упал: {e}")

        print(f"[worker] сплю {config.index_interval_hours} ч до следующего прохода…")
        await asyncio.sleep(INTERVAL)


if __name__ == "__main__":
    asyncio.run(main())
