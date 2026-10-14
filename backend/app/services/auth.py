import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import AuthAuditEvent, AuthLoginAttempt, AuthSession, User

password_hasher = PasswordHasher()
# This is generated at process start and is used only to keep unknown-user login
# timing close to known-user login timing. It is never a usable application password.
dummy_password_hash = password_hasher.hash(secrets.token_urlsafe(32))


def utc_now() -> datetime:
    return datetime.now(UTC)


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, encoded_hash: str | None) -> bool:
    candidate = encoded_hash or dummy_password_hash
    try:
        valid = password_hasher.verify(candidate, password)
        if valid and encoded_hash and password_hasher.check_needs_rehash(encoded_hash):
            return True
        return valid and encoded_hash is not None
    except (InvalidHashError, VerificationError, VerifyMismatchError):
        return False


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(session: Session, user_id: int) -> str:
    raw_token = secrets.token_urlsafe(32)
    now = utc_now()
    session.add(
        AuthSession(
            user_id=user_id,
            token_hash=token_hash(raw_token),
            created_at=now,
            last_seen_at=now,
            expires_at=now + timedelta(seconds=get_settings().session_max_age_seconds),
        )
    )
    return raw_token


def find_active_session(session: Session, raw_token: str | None) -> AuthSession | None:
    if not raw_token:
        return None
    auth_session = session.scalar(
        select(AuthSession).where(
            AuthSession.token_hash == token_hash(raw_token),
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > utc_now(),
        )
    )
    return auth_session


def revoke_user_sessions(session: Session, user_id: int) -> int:
    now = utc_now()
    sessions = session.scalars(
        select(AuthSession).where(
            AuthSession.user_id == user_id,
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > now,
        )
    ).all()
    for auth_session in sessions:
        auth_session.revoked_at = now
    return len(sessions)


def revoke_all_sessions(session: Session, user_id: int) -> int:
    return revoke_user_sessions(session, user_id)


def add_audit_event(
    session: Session,
    event: str,
    *,
    username: str | None = None,
    user_id: int | None = None,
    client_ip: str | None = None,
) -> None:
    session.add(
        AuthAuditEvent(
            event=event,
            username=username,
            user_id=user_id,
            client_ip=client_ip,
            created_at=utc_now(),
        )
    )


def login_attempt_count(session: Session, username: str, client_ip: str) -> int:
    since = utc_now() - timedelta(seconds=get_settings().login_rate_limit_window_seconds)
    return int(
        session.scalar(
            select(func.count(AuthLoginAttempt.id)).where(
                AuthLoginAttempt.username == username,
                AuthLoginAttempt.client_ip == client_ip,
                AuthLoginAttempt.failed_at >= since,
            )
        )
        or 0
    )


def record_login_failure(session: Session, username: str, client_ip: str) -> None:
    session.add(AuthLoginAttempt(username=username, client_ip=client_ip, failed_at=utc_now()))
    cutoff = utc_now() - timedelta(
        seconds=max(get_settings().login_rate_limit_window_seconds * 2, 3600)
    )
    session.execute(delete(AuthLoginAttempt).where(AuthLoginAttempt.failed_at < cutoff))


def clear_login_failures(session: Session, username: str, client_ip: str) -> None:
    session.execute(
        delete(AuthLoginAttempt).where(
            AuthLoginAttempt.username == username,
            AuthLoginAttempt.client_ip == client_ip,
        )
    )


def set_user_password(session: Session, user: User, password: str) -> int:
    user.password_hash = hash_password(password)
    user.password_changed_at = utc_now()
    revoked = revoke_user_sessions(session, user.id)
    add_audit_event(session, "password_changed", username=user.username, user_id=user.id)
    return revoked
