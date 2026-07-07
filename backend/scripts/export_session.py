"""Экспорт уже авторизованной файловой сессии в строку (StringSession)
для тест-режима — чтобы не переавторизовываться.

    docker compose run --rm backend python scripts/export_session.py
    # скопируй строку в backend/.env:  TG_SESSION=<строка>
    docker compose up -d backend
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from telethon.sessions import SQLiteSession, StringSession  # noqa: E402

from app.config import config  # noqa: E402


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else config.session_path
    sql = SQLiteSession(name)
    if sql.auth_key is None:
        print(f"Файловая сессия не найдена/не авторизована: {name}.session")
        return
    ss = StringSession()
    ss.set_dc(sql.dc_id, sql.server_address, sql.port)
    ss.auth_key = sql.auth_key
    print("\nTG_SESSION=" + ss.save() + "\n")


if __name__ == "__main__":
    main()
