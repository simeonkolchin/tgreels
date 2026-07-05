from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import channel, feed, photo, stream, thumb
from app.telegram.client import ensure_authorized, get_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    # API только раздаёт (feed/thumb/stream). Индексацией занимается воркер
    # (отдельный контейнер). Здесь проверяем свою стрим-сессию и прогреваем
    # entity-кэш: access_hash каналов сессия-специфичны, для стрима нужно, чтобы
    # эта сессия знала каналы (резолв по channel_id через get_input_entity).
    if await ensure_authorized():
        print("[app] стрим-сессия авторизована")
        try:
            client = await get_client()
            dialogs = await client.get_dialogs()
            print(f"[app] entity-кэш прогрет: {len(dialogs)} диалогов")
        except Exception as e:  # noqa: BLE001
            print(f"[app] не удалось прогреть диалоги: {e}")
    else:
        print(
            "\n[!] Стрим-сессия API не авторизована. Останови и залогинь:\n"
            "    docker compose run --rm backend python scripts/login.py\n"
        )
    yield


app = FastAPI(title="Vertical Videos (Telegram → Reels)", lifespan=lifespan)

# В деве фронт крутится на другом порту (Vite) — разрешаем CORS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(feed.router)
app.include_router(stream.router)
app.include_router(thumb.router)
app.include_router(channel.router)
app.include_router(photo.router)


@app.get("/health")
async def health():
    return {"ok": True}
