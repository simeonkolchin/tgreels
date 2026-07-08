import base64
import hashlib
import hmac
import os

_ITERS = 200_000


def hash_password(pw: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, _ITERS)
    return f"pbkdf2${_ITERS}${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"


def verify_password(pw: str, stored: str) -> bool:
    try:
        _algo, iters, salt_b, hash_b = stored.split("$")
        salt = base64.b64decode(salt_b)
        expected = base64.b64decode(hash_b)
        dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, int(iters))
        return hmac.compare_digest(dk, expected)
    except Exception:  # noqa: BLE001
        return False
