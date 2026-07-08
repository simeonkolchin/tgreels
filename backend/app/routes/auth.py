import random
import re
import time

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
from app.passwords import hash_password, verify_password
from app.session import COOKIE, MAX_AGE, clear_token, is_valid, issue_token
from app.telegram.client import (
    build_client_with_session,
    build_login_client,
    reset_client,
)

router = APIRouter()

# спец-логин для теста: не ходит в Telegram, переиспользует сессию из БД/.env
TEST_ID = 99019

# Состояние незавершённого логина/регистрации (приложение однопользовательское в моменте).
_pending: dict = {}

_UNAME_RE = re.compile(r"[a-z0-9_]{3,20}")


class StartBody(BaseModel):
    api_id: int
    api_hash: str
    phone: str


class CodeBody(BaseModel):
    code: str


class PasswordBody(BaseModel):
    password: str


class RegisterBody(BaseModel):
    username: str
    password: str


class LoginBody(BaseModel):
    username: str
    password: str


def _set_cookie(response: Response):
    token = issue_token()
    response.set_cookie(
        COOKIE, token, httponly=True, samesite="lax", max_age=MAX_AGE, path="/"
    )


@router.get("/api/auth/status")
async def status(request: Request):
    return {"authorized": is_valid(request)}


# ── Регистрация: сначала Telegram-авторизация ───────────────

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
        mode="register",
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
    return await _to_account()


@router.post("/api/auth/password")
async def password(body: PasswordBody):
    client = _pending.get("client")
    if client is None:
        return {"ok": False, "error": "Сессия логина истекла, начните заново"}
    try:
        await client.sign_in(password=body.password)
    except Exception:  # noqa: BLE001
        return {"ok": False, "error": "Неверный пароль 2FA"}
    return await _to_account()


async def _to_account():
    """Telegram-авторизация прошла → сохраняем готовую сессию и ведём на шаг
    выбора логина/пароля приложения. Логин Telegram префиллим, если есть."""
    client = _pending["client"]
    session = client.session.save()
    tg_username = None
    try:
        me = await client.get_me()
        tg_username = me.username
    except Exception:  # noqa: BLE001
        pass
    _pending["session_ready"] = session
    _pending["tg_username"] = tg_username
    try:
        await client.disconnect()
    except Exception:  # noqa: BLE001
        pass
    _pending.pop("client", None)
    return {"ok": True, "step": "account", "username": tg_username}


@router.get("/api/auth/username-available")
async def username_available(u: str):
    uname = u.strip().lower()
    ok = bool(_UNAME_RE.fullmatch(uname)) and not repo.username_exists(uname)
    return {"available": ok}


@router.post("/api/auth/register")
async def register(body: RegisterBody, response: Response):
    session = _pending.get("session_ready")
    if not session:
        return {"ok": False, "error": "Сессия регистрации истекла, начните заново"}
    uname = body.username.strip().lower()
    if not _UNAME_RE.fullmatch(uname):
        return {"ok": False, "error": "Логин: 3–20 символов, латиница/цифры/_"}
    if repo.username_exists(uname):
        return {"ok": False, "error": "Такой логин уже занят"}
    if len(body.password) < 4:
        return {"ok": False, "error": "Пароль минимум 4 символа"}

    repo.create_user(
        uname,
        hash_password(body.password),
        _pending["api_id"],
        _pending["api_hash"],
        session,
        _pending.get("tg_username"),
    )
    # активная сессия приложения = этот пользователь
    repo.save_auth(_pending["api_id"], _pending["api_hash"], session, _pending.get("phone"))
    _pending.clear()
    await reset_client()
    _set_cookie(response)
    return {"ok": True, "step": "done"}


# ── Вход: логин/пароль → код в «Избранное» → подтверждение ──

@router.post("/api/auth/login")
async def login(body: LoginBody):
    user = repo.get_user_by_username(body.username.strip().lower())
    if user is None or not verify_password(body.password, user["password_hash"]):
        return {"ok": False, "error": "Неверный логин или пароль"}

    creds = repo.get_user_auth(user)
    code_str = "".join(random.choice("0123456789") for _ in range(5))
    client = None
    try:
        client = build_client_with_session(creds["api_id"], creds["api_hash"], creds["session"])
        await client.connect()
        if not await client.is_user_authorized():
            await client.disconnect()
            return {"ok": False, "error": "Telegram-сессия недействительна — зарегистрируйтесь заново"}
        await client.send_message(
            "me",
            f"🔐 Код входа в reels: {code_str}\n\nНикому не сообщайте этот код.",
        )
        await client.disconnect()
    except Exception:  # noqa: BLE001
        if client is not None:
            try:
                await client.disconnect()
            except Exception:  # noqa: BLE001
                pass
        return {"ok": False, "error": "Не удалось отправить код в Telegram"}

    _pending.clear()
    _pending.update(mode="login", user_id=user["id"], login_code=code_str, expires=time.time() + 300)
    return {"ok": True, "step": "login-code"}


@router.post("/api/auth/login-code")
async def login_code(body: CodeBody, response: Response):
    if _pending.get("mode") != "login":
        return {"ok": False, "error": "Начните вход заново"}
    if time.time() > _pending.get("expires", 0):
        _pending.clear()
        return {"ok": False, "error": "Код истёк — войдите заново"}
    if body.code.strip() != _pending.get("login_code"):
        return {"ok": False, "error": "Неверный код"}

    user = repo.get_user_by_id(_pending["user_id"])
    if user is None:
        return {"ok": False, "error": "Пользователь не найден"}
    creds = repo.get_user_auth(user)
    repo.save_auth(creds["api_id"], creds["api_hash"], creds["session"], None)
    _pending.clear()
    await reset_client()
    _set_cookie(response)
    return {"ok": True, "step": "done"}


@router.post("/api/auth/logout")
async def logout(response: Response):
    clear_token()
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


async def _finish_test(response: Response):
    """Тест-вход: не логинимся в Telegram, переиспользуем существующую сессию."""
    _pending.clear()
    if repo.get_auth() is None and config.api_id and config.tg_session:
        repo.save_auth(config.api_id, config.api_hash, config.tg_session, None)
        await reset_client()
    _set_cookie(response)
    return {"ok": True, "step": "done"}
