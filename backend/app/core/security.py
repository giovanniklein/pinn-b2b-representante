from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from jose import jwt
from passlib.context import CryptContext

from .config import get_settings


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
settings = get_settings()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a bcrypt hash."""

    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt."""

    return pwd_context.hash(password)


def _create_token(
    subject: str,
    representante_id: str,
    token_type: str,
    *,
    expires_delta: Optional[timedelta] = None,
    extra_claims: Optional[Dict[str, Any]] = None,
) -> str:
    """Create a signed JWT token for representante users.

    O token sempre inclui o ID do usuário (sub), o representante_id e o
    tipo de usuário (tipo_usuario="representante") para garantir o
    isolamento multi-tenant ao longo de toda a API.
    """

    if expires_delta is None:
        if token_type == "access":
            expires_delta = timedelta(minutes=settings.access_token_expire_minutes)
        else:
            expires_delta = timedelta(minutes=settings.refresh_token_expire_minutes)

    now = datetime.now(timezone.utc)
    expire = now + expires_delta

    payload: Dict[str, Any] = {
        "sub": subject,
        "representante_id": representante_id,
        "tipo_usuario": "representante",
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }

    if extra_claims:
        payload.update(extra_claims)

    encoded_jwt = jwt.encode(
        payload,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )
    return encoded_jwt


def create_access_token(
    subject: str,
    representante_id: str,
    *,
    expires_delta: Optional[timedelta] = None,
    extra_claims: Optional[Dict[str, Any]] = None,
) -> str:
    """Create an access token with shorter expiration."""

    return _create_token(
        subject=subject,
        representante_id=representante_id,
        token_type="access",
        expires_delta=expires_delta,
        extra_claims=extra_claims,
    )


def create_refresh_token(
    subject: str,
    representante_id: str,
    *,
    expires_delta: Optional[timedelta] = None,
    extra_claims: Optional[Dict[str, Any]] = None,
) -> str:
    """Create a refresh token with longer expiration."""

    return _create_token(
        subject=subject,
        representante_id=representante_id,
        token_type="refresh",
        expires_delta=expires_delta,
        extra_claims=extra_claims,
    )


def decode_token(token: str) -> Dict[str, Any]:
    """Decode a JWT token and return its payload.

    Validation errors should be handled by the caller (e.g. raising HTTP 401).
    """

    return jwt.decode(
        token,
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm],
        options={"verify_aud": False},
    )
