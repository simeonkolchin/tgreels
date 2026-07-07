from pathlib import Path

from cryptography.fernet import Fernet

from app.config import config

_fernet: Fernet | None = None


def _load_key() -> bytes:
    p = Path(config.secret_key_file)
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.exists():
        return p.read_bytes()
    key = Fernet.generate_key()
    p.write_bytes(key)
    try:
        p.chmod(0o600)
    except OSError:
        pass
    return key


def _f() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_load_key())
    return _fernet


def encrypt(text: str) -> str:
    return _f().encrypt(text.encode()).decode()


def decrypt(token: str) -> str:
    return _f().decrypt(token.encode()).decode()
