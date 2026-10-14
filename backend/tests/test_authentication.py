from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app.db import SessionLocal
from backend.app.models import AuthSession, User
from backend.app.services.auth import set_user_password
from backend.app.services.import_service import ImportService

PASSWORD = "synthetic-test-password"


def csrf(client):
    response = client.get("/api/v1/auth/csrf")
    assert response.status_code == 200
    token = client.cookies.get("hopstats_csrf")
    assert token
    client.headers.update({"X-CSRF-Token": token})
    return token


def test_protected_routes_require_authentication(client):
    client.cookies.pop("hopstats_session", None)
    assert client.get("/api/v1/dashboard").status_code == 401
    assert client.get("/api/v1/inventory").status_code == 401
    assert client.get("/api/v1/locations").status_code == 401


def test_login_me_logout_and_cookie_security(client):
    client.cookies.clear()
    token = csrf(client)
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "local", "password": PASSWORD},
        headers={"X-CSRF-Token": token},
    )
    assert response.status_code == 200
    assert "password" not in response.text.lower()
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "hopstats_session=" not in response.text
    assert client.get("/api/v1/auth/me").json()["username"] == "local"

    assert client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": token}).status_code == 200
    assert client.get("/api/v1/auth/me").status_code == 401


def test_invalid_credentials_are_generic_and_rate_limited(client):
    client.cookies.clear()
    token = csrf(client)
    for username in ("local", "unknown", "unknown", "unknown", "unknown", "unknown", "unknown"):
        response = client.post(
            "/api/v1/auth/login",
            json={"username": username, "password": "wrong synthetic password"},
            headers={"X-CSRF-Token": token},
        )
        if username == "local":
            assert response.status_code == 401
        elif response.status_code == 429:
            assert "password" not in response.text.lower()
            break
    else:
        raise AssertionError("login rate limit did not trigger")


def test_csrf_is_required_for_login_and_password_reset_revokes_sessions(client):
    client.cookies.clear()
    token = csrf(client)
    client.headers.pop("X-CSRF-Token", None)
    missing_header = client.post(
        "/api/v1/auth/login",
        json={"username": "local", "password": PASSWORD},
    )
    assert missing_header.status_code == 403
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"username": "local", "password": PASSWORD},
            headers={"X-CSRF-Token": token},
        ).status_code
        == 200
    )

    with SessionLocal() as session:
        user = session.scalar(select(User).where(User.username == "local"))
        set_user_password(session, user, "synthetic-reset-password")
        session.commit()
    assert client.get("/api/v1/auth/me").status_code == 401


def test_session_expiry_and_only_hashes_are_persisted(client):
    client.cookies.clear()
    token = csrf(client)
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"username": "local", "password": PASSWORD},
            headers={"X-CSRF-Token": token},
        ).status_code
        == 200
    )
    raw_cookie = client.cookies.get("hopstats_session")
    assert raw_cookie
    with SessionLocal() as session:
        auth_session = session.scalar(select(AuthSession).order_by(AuthSession.id.desc()))
        assert auth_session.token_hash != raw_cookie
        auth_session.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        session.commit()
    assert client.get("/api/v1/auth/me").status_code == 401


def test_session_survives_a_new_application_client(client):
    from backend.app.main import app

    with TestClient(app) as restarted_client:
        restarted_client.cookies.update(client.cookies)
        assert restarted_client.get("/api/v1/auth/me").status_code == 200


def test_authenticated_identity_scopes_dashboard_data(client):
    with SessionLocal() as session:
        other = User(username="other")
        session.add(other)
        session.flush()
        set_user_password(session, other, "synthetic-other-password")
        other_id = other.id
        session.commit()
    ImportService().import_checkins(
        other_id,
        "other.csv",
        b"beer_name,brewery_name,created_at,checkin_id,bid,brewery_id\n"
        b"Other Beer,Other Brewery,2026-10-14T12:00:00Z,other-1,other-beer,other-brewery\n",
    )

    client.cookies.clear()
    token = csrf(client)
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"username": "other", "password": "synthetic-other-password"},
            headers={"X-CSRF-Token": token},
        ).status_code
        == 200
    )
    assert client.get("/api/v1/dashboard").json()["total_checkins"] == 1

    token = csrf(client)
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"username": "local", "password": PASSWORD},
            headers={"X-CSRF-Token": token},
        ).status_code
        == 200
    )
    assert client.get("/api/v1/dashboard").json()["total_checkins"] == 0
