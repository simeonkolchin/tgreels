from fastapi import APIRouter, Request, Response
from pydantic import BaseModel
from telethon.errors import (
    ApiIdInvalidError,
    PhoneCodeInvalidError,
    PhoneNumberInvalidError,
    SessionPasswordNeededError,
)

from app.config import config
from app.db import repo
from app.session import COOKIE, MAX_AGE, clear_token, is_valid, issue_token
from app.telegram.client import build_login_client, reset_client

router = APIRouter()

# спец-логин для теста: не ходит в Telegram, переиспользует сессию из БД/.env
TEST_ID = 99019

# Состояние незавершённого логина (приложение однопользовательское).
_pending: dict = {}


class StartBody(BaseModel):
    api_id: int
    api_hash: str
    phone: str


class CodeBody(BaseModel):
    code: str


class PasswordBody(BaseModel):
    password: str


def _set_cookie(response: Response):
    token = issue_token()
    response.set_cookie(
        COOKIE, token, httponly=True, samesite="lax", max_age=MAX_AGE, path="/"
    )


@router.get("/api/auth/status")
async def status(request: Request):
    # доступ — по cookie УСТРОЙСТВА, а не по факту наличия Telegram-сессии
    return {"authorized": is_valid(request)}


@router.post("/api/auth/start")
async def start(body: StartBody):
    old = _pending.get("client")
    if old is not None:
        try:
            await old.disconnect()
        except Exception:  # noqa: BLE001
            pass
    _pending.clear()

    # ── тест-режим: 99019 → без Telegram, вход в один шаг «код» ──
    if body.api_id == TEST_ID:
        _pending.update(test=True)
        return {"ok": True, "step": "code"}

    client = build_login_client(body.api_id, body.api_hash.strip())
    try:
        await client.connect()
        sent = await client.send_code_request(body.phone.strip())
    except ApiIdInvalidError:
        await client.disconnect()
        return {"ok": False, "error": "Неверные API ID / API Hash"}
    except PhoneNumberInvalidError:
        await client.disconnect()
        return {"ok": False, "error": "Неверный номер телефона"}
    except Exception as e:  # noqa: BLE001
        await client.disconnect()
        return {"ok": False, "error": f"Ошибка: {e}"}

    _pending.update(
        client=client,
        phone=body.phone.strip(),
        hash=sent.phone_code_hash,
        api_id=body.api_id,
        api_hash=body.api_hash.strip(),
    )
    return {"ok": True, "step": "code"}


@router.post("/api/auth/code")
async def code(body: CodeBody, response: Response):
    if _pending.get("test"):
        return await _finish_test(response)

    client = _pending.get("client")
    if client is None:
        return {"ok": False, "error": "Сессия логина истекла, начните заново"}
    try:
        await client.sign_in(
            _pending["phone"], body.code.strip(), phone_code_hash=_pending["hash"]
        )
    except SessionPasswordNeededError:
        return {"ok": True, "step": "password"}
    except PhoneCodeInvalidError:
        return {"ok": False, "error": "Неверный код"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"Ошибка: {e}"}
    return await _finish(response)


@router.post("/api/auth/password")
async def password(body: PasswordBody, response: Response):
    client = _pending.get("client")
    if client is None:
        return {"ok": False, "error": "Сессия логина истекла, начните заново"}
    try:
        await client.sign_in(password=body.password)
    except Exception:  # noqa: BLE001
        return {"ok": False, "error": "Неверный пароль 2FA"}
    return await _finish(response)


@router.post("/api/auth/logout")
async def logout(response: Response):
    # выход только этого устройства (Telegram-сессию в БД не трогаем)
    clear_token()
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


async def _finish(response: Response):
    client = _pending["client"]
    session = client.session.save()
    repo.save_auth(
        _pending["api_id"], _pending["api_hash"], session, _pending.get("phone")
    )
    try:
        await client.disconnect()
    except Exception:  # noqa: BLE001
        pass
    _pending.clear()
    await reset_client()
    _set_cookie(response)
    return {"ok": True, "step": "done"}


async def _finish_test(response: Response):
    """Тест-вход: не логинимся в Telegram, переиспользуем существующую сессию.
    Если её нет в БД, но задана в .env (TG_SESSION) — подгружаем оттуда."""
    _pending.clear()
    if repo.get_auth() is None and config.api_id and config.tg_session:
        repo.save_auth(config.api_id, config.api_hash, config.tg_session, None)
        await reset_client()
    _set_cookie(response)
    return {"ok": True, "step": "done"}
