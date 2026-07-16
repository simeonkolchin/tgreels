# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability, please **do not** open a public issue.
Instead, report it privately:

- Open a [GitHub Security Advisory](https://github.com/simeonkolchin/tgreels/security/advisories/new), or
- Contact the maintainer directly via [github.com/simeonkolchin](https://github.com/simeonkolchin).

Please include a description of the issue, steps to reproduce, and the potential impact. You can expect an initial response within a few days.

## How tgreels handles secrets

- **Telegram sessions are stored encrypted.** The session string and API credentials are encrypted with [Fernet](https://cryptography.io/en/latest/fernet/); the key is generated on first start, written with `0600` permissions to `SECRET_KEY_FILE`, and never committed.
- **App passwords are hashed** with PBKDF2-HMAC-SHA256 (200k iterations, per-user salt). Plaintext passwords are never stored.
- **Login requires a one-time code** delivered to your own Telegram Saved Messages, so possession of a password alone is not enough.
- **Secrets never enter git.** `.env`, `data/` (database, sessions, key), and log files are all gitignored. `backend/.env.example` ships placeholders only.
- **Least privilege:** all feed/stream/channel routes require a valid device session cookie; only the auth routes are public.

## Scope

This project relays media from **your own** Telegram account. Never point it at accounts or content you do not own — doing so may violate copyright and the Telegram Terms of Service.
