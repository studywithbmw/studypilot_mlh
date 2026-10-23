"""Supabase login verification. Supabase is used for sign-in only; the token's
``sub`` is the user id that scopes every row and every vector in this backend."""
from dataclasses import dataclass

import logging

import jwt
from fastapi import Header
from jwt import PyJWKClient, PyJWKClientConnectionError, PyJWKClientError

from .config import settings
from .errors import ServiceUnavailableError, UnauthorizedError

log = logging.getLogger("studypilot.auth")
_jwks_client: PyJWKClient | None = None
_BAD_TOKEN = "Invalid or expired authentication token."


@dataclass(frozen=True)
class AuthUser:
    user_id: str
    email: str | None = None
    name: str | None = None
    avatar_url: str | None = None


def _user_from_claims(claims: dict) -> AuthUser:
    meta = claims.get("user_metadata") or {}
    return AuthUser(
        user_id=str(claims.get("sub", "")),
        email=claims.get("email"),
        name=meta.get("full_name") or meta.get("name"),
        avatar_url=meta.get("avatar_url") or meta.get("picture"),
    )


def authenticate_token(token: str) -> AuthUser:
    """Verify a raw Supabase access token (HTTP header or WebSocket first message)."""
    global _jwks_client
    if not settings.supabase_url:
        raise ServiceUnavailableError("SUPABASE_URL is not set in backend/.env.")

    token = (token or "").strip()
    if not token:
        raise UnauthorizedError(_BAD_TOKEN)

    issuer = f"{settings.supabase_url}/auth/v1"
    try:
        header = jwt.get_unverified_header(token)
        if header.get("alg") == "HS256":
            if not settings.supabase_jwt_secret:
                raise UnauthorizedError(_BAD_TOKEN)
            claims = jwt.decode(
                token, settings.supabase_jwt_secret, algorithms=["HS256"],
                audience="authenticated", issuer=issuer,
            )
        else:
            if _jwks_client is None:
                _jwks_client = PyJWKClient(f"{issuer}/.well-known/jwks.json", cache_keys=True, timeout=5)
            key = _jwks_client.get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token, key.key, algorithms=["ES256", "RS256", "EdDSA"],
                audience="authenticated", issuer=issuer,
            )
    except PyJWKClientConnectionError:
        raise ServiceUnavailableError("Could not reach Supabase to verify your session.") from None
    except jwt.InvalidIssuerError:
        try:
            got = jwt.decode(token, options={"verify_signature": False}).get("iss")
        except jwt.PyJWTError:
            got = "?"
        log.error("Login token was issued by %s but SUPABASE_URL is %s. Use the same project as the frontend's VITE_SUPABASE_URL.", got, settings.supabase_url)
        raise UnauthorizedError("Your login is from a different Supabase project than the backend is configured for.") from None
    except (jwt.PyJWTError, PyJWKClientError) as exc:
        log.warning("Rejected token: %s", type(exc).__name__)
        raise UnauthorizedError(_BAD_TOKEN) from None

    user = _user_from_claims(claims)
    if not user.user_id:
        raise UnauthorizedError(_BAD_TOKEN)
    return user


def current_user(authorization: str = Header(default="")) -> AuthUser:
    """FastAPI dependency (sync, so FastAPI runs it in its thread pool)."""
    scheme, _, token = authorization.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise UnauthorizedError("Please sign in.")
    return authenticate_token(token)
