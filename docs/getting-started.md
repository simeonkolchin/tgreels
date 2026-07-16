# Getting Started

This guide takes you from a fresh clone to a running tgreels feed.

## Prerequisites

- Docker + Docker Compose (recommended), **or** Python 3.11+ and Node 18+ for local dev.
- A Telegram account.
- Telegram API credentials — create an app at <https://my.telegram.org> → **API development tools** and note your `api_id` and `api_hash`.

## 1. Clone & configure

```bash
git clone https://github.com/simeonkolchin/tgreels.git
cd tgreels
cp backend/.env.example backend/.env
```

Editing `backend/.env` is optional — `API_ID` / `API_HASH` can also be typed into the web login page. The other settings (`INDEX_INTERVAL_HOURS`, `VERTICAL_ONLY`, `INCLUDE_GROUPS`, …) control how the indexer behaves.

## 2. Run with Docker

```bash
docker compose build
docker compose up -d
```

- `backend` — FastAPI: serves the feed, streams video/photos over `Range`, and runs the indexer in-process.
- `frontend` — nginx serving the built React app and reverse-proxying the API.

Open **<http://localhost:5080>**.

## 3. Log in with Telegram

On first visit you'll be taken to the auth page:

1. Enter `api_id`, `api_hash`, and your phone number.
2. Enter the login code Telegram sends you.
3. If you have 2FA, enter your password.
4. Choose an app username + password (this is the account you'll use to log back in).

Your Telegram session is then saved **encrypted** in the database. On subsequent logins you use your app username/password, and a one-time code is delivered to your Telegram Saved Messages to confirm.

## 4. Let it index

The background loop authorizes, warms the entity cache, and indexes the channels you're subscribed to. The first pass fetches history (bounded by `MAX_HISTORY_PER_CHANNEL`); later passes run every `INDEX_INTERVAL_HOURS` and pick up only new clips.

Watch progress:

```bash
docker compose logs -f backend
```

Once clips appear, open the feed and start swiping.

## Manual re-index

You can trigger an indexing pass on demand:

```bash
docker compose run --rm backend python scripts/reindex.py
```

## Local development (no Docker)

```bash
# Terminal 1 — backend on :8000
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Terminal 2 — frontend on :5173 (proxies API to :8000)
cd frontend
npm install
npm run dev
```

## Troubleshooting

- **Feed is empty** — indexing may still be running, or none of your channels have vertical videos. Check `docker compose logs -f backend`, and try `VERTICAL_ONLY=false`.
- **502 / stream errors** — `fileReference` may have expired mid-request; the backend re-resolves on retry. Persistent errors usually mean the session was de-authorized — log in again.
- **FLOOD_WAIT in logs** — Telegram throttling. Telethon waits it out automatically (`flood_sleep_threshold=120`); large first-time indexing can take a while.
