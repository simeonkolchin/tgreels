# Contributing to tgreels

Thanks for your interest in improving tgreels! Contributions of all sizes are welcome.

## Getting set up

See the [Getting Started guide](docs/getting-started.md) and the "Local Development" section of the [README](README.md). In short:

```bash
# backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# frontend
cd frontend
npm install
npm run dev
```

## Workflow

1. Fork the repo and create a branch off `main` (`feat/…`, `fix/…`).
2. Make your change. Keep it focused — one logical change per PR.
3. Make sure the frontend builds: `cd frontend && npm run build`.
4. Make sure the backend imports cleanly: `cd backend && python -m compileall app`.
5. Open a pull request with a clear description of what and why.

## Guidelines

- **Backend** is Python (FastAPI + Telethon). Keep functions small and side-effects explicit. Match the existing style.
- **Frontend** is React + TypeScript (Vite). Prefer typed props and small components.
- **Never commit secrets.** `.env`, `data/`, session files, and the Fernet key are gitignored — keep it that way.
- Only index and stream **your own** content. Do not add features aimed at re-hosting third-party or copyrighted media.

## Reporting bugs

Open an issue with steps to reproduce, expected vs. actual behavior, and relevant logs (`docker compose logs backend`). For security issues, see [SECURITY.md](SECURITY.md) instead.
