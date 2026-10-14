import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import User
from ..schemas.auth import LoginRequest, LoginResponse, UserResponse
from ..services.auth import (
    add_audit_event,
    clear_login_failures,
    create_session,
    find_active_session,
    find_user,
    login_attempt_count,
    normalize_username,
    record_login_failure,
    utc_now,
    verify_password,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
SESSION_COOKIE = "hopstats_session"
CSRF_COOKIE = "hopstats_csrf"
CSRF_HEADER = "X-CSRF-Token"


def cookie_options() -> dict[str, object]:
    settings = get_settings()
    return {
        "secure": settings.cookie_secure,
        "httponly": True,
        "samesite": settings.cookie_samesite,
        "path": "/",
    }


def csrf_cookie_options() -> dict[str, object]:
    options = cookie_options()
    options["httponly"] = False
    return options


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def user_response(user: User) -> UserResponse:
    return UserResponse.model_validate(user)


def get_current_user(request: Request, session: Annotated[Session, Depends(get_db)]) -> User:
    auth_session = find_active_session(session, request.cookies.get(SESSION_COOKIE))
    if auth_session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Cookie"},
        )
    user = session.get(User, auth_session.user_id)
    if user is None:
        auth_session.revoked_at = utc_now()
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required"
        )
    return user


def _origin_is_trusted(request: Request) -> bool:
    origin = request.headers.get("origin")
    if not origin:
        return True
    settings = get_settings()
    configured = {
        value.strip().rstrip("/") for value in settings.allowed_origins.split(",") if value.strip()
    }
    if configured:
        return origin.rstrip("/") in configured
    return origin.rstrip("/") == f"{request.url.scheme}://{request.headers.get('host')}".rstrip("/")


def require_csrf(request: Request) -> None:
    if not _origin_is_trusted(request):
        raise HTTPException(status_code=403, detail="CSRF validation failed")
    cookie_token = request.cookies.get(CSRF_COOKIE)
    header_token = request.headers.get(CSRF_HEADER)
    if (
        not cookie_token
        or not header_token
        or not secrets.compare_digest(cookie_token, header_token)
    ):
        raise HTTPException(status_code=403, detail="CSRF validation failed")


@router.get("/csrf")
def csrf_token(response: Response, request: Request) -> dict[str, str]:
    if not request.cookies.get(CSRF_COOKIE):
        response.set_cookie(CSRF_COOKIE, secrets.token_urlsafe(32), **csrf_cookie_options())
    return {"status": "ok"}


@router.post("/login", response_model=LoginResponse, dependencies=[Depends(require_csrf)])
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    session: Annotated[Session, Depends(get_db)],
):
    try:
        username = normalize_username(payload.username)
    except ValueError:
        username = payload.username.strip().casefold()[:100]
    ip = client_ip(request)
    settings = get_settings()
    attempts = login_attempt_count(session, username, ip)
    if attempts >= settings.login_rate_limit_attempts:
        add_audit_event(session, "login_rate_limited", username=username, client_ip=ip)
        session.commit()
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.")

    user = find_user(session, username=username)
    valid = verify_password(payload.password, user.password_hash if user else None)
    if user is None or not valid:
        record_login_failure(session, username, ip)
        add_audit_event(
            session,
            "login_failed",
            username=username,
            user_id=user.id if user else None,
            client_ip=ip,
        )
        session.commit()
        raise HTTPException(status_code=401, detail="Invalid username or password")

    clear_login_failures(session, username, ip)
    raw_token = create_session(session, user.id)
    add_audit_event(
        session, "login_succeeded", username=user.username, user_id=user.id, client_ip=ip
    )
    session.commit()
    response.set_cookie(
        SESSION_COOKIE, raw_token, max_age=settings.session_max_age_seconds, **cookie_options()
    )
    return LoginResponse(user=user_response(user))


@router.post("/logout", dependencies=[Depends(get_current_user), Depends(require_csrf)])
def logout(request: Request, response: Response, session: Annotated[Session, Depends(get_db)]):
    raw_token = request.cookies.get(SESSION_COOKIE)
    auth_session = find_active_session(session, raw_token)
    if auth_session:
        auth_session.revoked_at = utc_now()
        add_audit_event(
            session, "logout", user_id=auth_session.user_id, client_ip=client_ip(request)
        )
        session.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"status": "ok"}


@router.get("/me", response_model=UserResponse)
def me(user: Annotated[User, Depends(get_current_user)]) -> UserResponse:
    return user_response(user)
