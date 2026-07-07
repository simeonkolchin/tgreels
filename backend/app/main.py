import asyncio
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import config
from app.routes import auth, channel, feed, me, photo, stream, thumb
from app.session import require_session
from app.telegram.client import ensure_authorized, get_client

_index_task: asyncio.Task | None = None


async def _index_loop():
    """In-process индексация: первичная (если пусто) + периодическая раз в N часов.
    Пока нет авторизации — тихо ждёт (логин прогонит стартовую индексацию сам)."""
    interval = max(1, config.index_interval_hours) * 3600
    from app.parser.indexer import index_all

    while True:
        try:
            if await ensure_authorized():
                # прогреть entity-кэш (access_hash каналов сессия-специфичны)
                try:
                    client = await get_client()
                    if client is not None:
                        await client.get_dialogs()
                except Exception:  # noqa: BLE001
                    pass
                await index_all()
        except Exception as e:  # noqa: BLE001
            print(f"[app] индексация упала: {e}")
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _index_task
    if await ensure_authorized():
        print("[app] сессия авторизована")
    else:
        print("[app] нет авторизации — открой страницу и войди")
    _index_task = asyncio.create_task(_index_loop())
    yield
    if _index_task:
        _index_task.cancel()


app = FastAPI(title="Reels (Telegram)", lifespan=lifespan)

# В деве фронт крутится на другом порту (Vite) — разрешаем CORS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# auth — открыт; остальное только с валидной cookie устройства
app.include_router(auth.router)
_guard = [Depends(require_session)]
app.include_router(feed.router, dependencies=_guard)
app.include_router(stream.router, dependencies=_guard)
app.include_router(thumb.router, dependencies=_guard)
app.include_router(channel.router, dependencies=_guard)
app.include_router(photo.router, dependencies=_guard)
app.include_router(me.router, dependencies=_guard)


@app.get("/health")
async def health():
    return {"ok": True}
