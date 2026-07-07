import secrets

from fastapi import HTTPException, Request

from app.db import repo

COOKIE = "reels_session"
MAX_AGE = 60 * 60 * 24 * 30  # 30 дней


def issue_token() -> str:
    """Выдать НОВЫЙ токен доступа (заменяет прежний → активна одна сессия/устройство)."""
    token = secrets.token_urlsafe(32)
    repo.set_setting("session_token", token)
    return token


def clear_token():
    repo.set_setting("session_token", "")


def is_valid(request: Request) -> bool:
    token = request.cookies.get(COOKIE)
    saved = repo.get_setting("session_token")
    return bool(token) and bool(saved) and token == saved


def require_session(request: Request):
    """Зависимость для контент-роутов: пускаем только с валидной cookie устройства."""
    if not is_valid(request):
        raise HTTPException(status_code=401, detail="unauthorized")
