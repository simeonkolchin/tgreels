<div align="center">

# 🎬 tgreels

**A vertical-video "reels" feed where the storage backend is Telegram — nothing is hosted on your disk.**

[![Live](https://img.shields.io/badge/live-tgreels.ru-ff2e63?logo=telegram&logoColor=white)](https://tgreels.ru)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](#)
[![React](https://img.shields.io/badge/React-18-20232A?logo=react&logoColor=61DAFB)](#)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)](#)
[![Telethon](https://img.shields.io/badge/Telethon-userbot-2CA5E0?logo=telegram&logoColor=white)](#)
[![Docker](https://img.shields.io/badge/Docker-compose-2496ED?logo=docker&logoColor=white)](#-quick-start-docker)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Status](https://img.shields.io/badge/status-live-success)

### 🌐 Live at **[tgreels.ru](https://tgreels.ru)**

[Quick Start](#-quick-start-docker) · [How It Works](#️-how-it-works) · [Features](#-features) · [Configuration](#️-configuration) · [Docs](docs/getting-started.md)

</div>

---

## 🚀 What is tgreels?

**tgreels** is an Instagram-Reels-style vertical video feed — but the videos **are never stored on the server**. They live in *your* Telegram channels, and the backend acts as a thin relay: it re-resolves the Telegram message on demand and streams the file to the browser in chunks over HTTP `Range`. Nothing hits disk. The database only holds `message_id`, lightweight metadata, and a tiny poster thumbnail.

You log in once with your own Telegram account (a userbot session), the indexer walks the channels you're subscribed to and records every vertical video message, and the feed serves them back in a deterministic shuffled order — an endless, stable scroll per session.

> 💡 **Design principle — Telegram is the CDN.** The server owns no media, only pointers. Storage, bandwidth, and durability are Telegram's problem; the app stays tiny.

## ✨ Features

|  |  |
|---|---|
| 📱 **Swipe feed** | Vertical videos in native orientation, autoplay, infinite scroll |
| 🔊 **Smart sound** | Restores audio on swipe (works around mobile autoplay muting) |
| 📺 **Channels** | Tap a channel to open its page, pull-to-refresh |
| ⛶ **Fullscreen** | Fullscreen button, video shown in its native aspect ratio |
| 🌊 **Streamed, never stored** | HTTP `Range` streaming straight from Telegram — zero media on disk |
| 🔀 **Deterministic shuffle** | Seeded feed order → stable, resumable, "endless" scroll per session |
| 🔐 **Telegram-based auth** | Register/login through your own Telegram account; a one-time code is sent to your Saved Messages |
| 🖼️ **Instant posters** | Thumbnails cached as BLOBs in SQLite → no round-trip to Telegram to show a poster |

## 🏗️ How It Works

```mermaid
flowchart LR
    U[Browser<br/>React reels UI] -->|Range request| N[nginx]
    N --> API[FastAPI backend]
    API -->|/api/feed| DB[(SQLite<br/>ids + meta + thumbs)]
    API -->|/stream/:id<br/>re-resolve fileReference| TG[(Telegram<br/>your channels)]
    IDX[In-process indexer] -->|Telethon userbot| TG
    IDX --> DB
```

1. You authorize **your** Telegram session (userbot) once via the web login page. `api_id` / `api_hash` and the session string are stored **encrypted** in the DB (Fernet key auto-generated on first start).
2. The indexer scans the **channels you're subscribed to** and stores the ids of all video messages (with a vertical filter, duration, dimensions, and a poster). The first pass fetches history; later passes fetch only what's new.
3. A background loop re-indexes every `INDEX_INTERVAL_HOURS` (default 12).
4. The frontend calls `/api/feed`; the server returns clips in a **deterministic seeded shuffle** (a stable infinite feed per session).
5. `<video>` hits `/stream/:id` with a `Range` header → the backend re-resolves the message (fresh `fileReference`) and streams the requested bytes from Telegram.

## ⚡ Quick Start (Docker)

**1. Telegram API keys** — go to <https://my.telegram.org> → *API development tools*, create an app, grab `api_id` and `api_hash`.

**2. Environment**

```bash
git clone https://github.com/simeonkolchin/tgreels.git
cd tgreels
cp backend/.env.example backend/.env   # optional: API_ID / API_HASH can also be entered on the login page
```

**3. Run**

```bash
docker compose build
docker compose up -d
```

Open **<http://localhost:5080>** and complete the Telegram login on the auth page (phone → code → 2FA if enabled). The indexer runs in-process and fills the DB in the background.

```bash
docker compose logs -f backend    # feed / streaming / indexing progress
```

## 🧑‍💻 Local Development (no Docker)

```bash
# backend  → :8000
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# frontend → :5173 (proxies /api, /stream, /thumb to :8000)
cd frontend
npm install
npm run dev
```

## ⚙️ Configuration

All backend config is via `backend/.env` (see [`backend/.env.example`](backend/.env.example)).

| Variable | Default | Meaning |
|---|---|---|
| `API_ID` / `API_HASH` | — | Keys from my.telegram.org (also enterable on the login page) |
| `SESSION_PATH` | `./data/session/userbot` | Telethon session path (local runs) |
| `DB_PATH` | `./data/videos.db` | SQLite database path |
| `SECRET_KEY_FILE` | `./data/secret.key` | Fernet key for encrypting stored sessions (auto-generated) |
| `PORT` | `8000` | Backend port |
| `INDEX_INTERVAL_HOURS` | `12` | How often to re-scan channels for new videos |
| `MAX_HISTORY_PER_CHANNEL` | `0` | Message cap on the first pass (`0` = full history) |
| `VERTICAL_ONLY` | `false` | Only take vertical clips (`h ≥ w`) |
| `INCLUDE_GROUPS` | `false` | Include megagroup supergroups, not just broadcast channels |
| `TG_PROXY` | — | Telethon proxy, e.g. `socks5://user:pass@host:port` |

## 🔧 Technical Notes

- **`fileReference` expires** (hours). The document is re-resolved on every request via `get_messages`, and the result is cached for 60s — the player fires many `Range` requests per clip, so we avoid hammering Telegram.
- **Alignment:** Telegram requires offsets that are multiples of 4096; we round down and trim the first chunk. `request_size` = 1 MB (also a multiple of 4096) to cut round-trips.
- **FLOOD_WAIT:** the client runs with `flood_sleep_threshold=120` so Telethon rides out moderate throttles; the indexer pauses between channels.
- **Posters** are fetched at index time and stored as BLOBs in SQLite → instant poster with no Telegram call.

## 🛡️ Security

See [SECURITY.md](SECURITY.md). In short: Telegram sessions are stored **encrypted** (Fernet), secrets live only in `.env` / the DB (both gitignored), app passwords are PBKDF2-hashed, and login requires a one-time code delivered to your own Telegram Saved Messages.

## 📚 Documentation

- [Getting Started](docs/getting-started.md)

## ⚖️ On content

This is designed for **your own** vertical videos from **your own** channels. Re-hosting third-party or copyrighted content violates copyright and Telegram's ToS.

## 🗺️ Roadmap

- [ ] Likes & comments
- [ ] Recommendation feed
- [ ] PWA / installable app

## 🧑‍💻 Contributing

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## 📄 License

MIT © [Simeon Kolchin](https://github.com/simeonkolchin)
