from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app.db import SessionLocal
from backend.app.models import AuthAuditEvent, AuthLoginAttempt, AuthSession, User
from backend.app.services.auth import set_user_password
from backend.app.services.import_service import ImportService
from backend.app.services.locations import LocationService

PASSWORD = "synthetic-test-password"
CHECKIN_CSV = (
    b"beer_name,brewery_name,created_at,checkin_id,bid,brewery_id\n"
    b"Other Beer,Other Brewery,2026-10-14T12:00:00Z,other-1,other-beer,other-brewery\n"
)
INVENTORY_CSV = (
    b"item_id,beer_name,brewery_name,beer_type,beer_abv,beer_ibu,quantity\n"
    b"other-item,Other Stash,Other Brewery,Lager,5,20,2\n"
)


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
        CHECKIN_CSV,
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


def test_renaming_populated_user_preserves_id_data_and_sessions(client):
    from backend.app.cli import rename_user_command

    user_id = 1
    ImportService().import_checkins(user_id, "existing.csv", CHECKIN_CSV)
    ImportService().import_inventory(user_id, "existing-stash.csv", INVENTORY_CSV, confirmed=True)
    with SessionLocal() as session:
        LocationService(session).create_location(user_id, "Existing Storage")
        user = session.get(User, user_id)
        assert user is not None
        original_password_hash = user.password_hash
        original_session_hashes = set(
            session.scalars(
                select(AuthSession.token_hash).where(AuthSession.user_id == user_id)
            ).all()
        )
        session.commit()

    rename_user_command(user_id, "Owner_1")

    current_user = client.get("/api/v1/auth/me").json()
    assert current_user["id"] == user_id
    assert current_user["username"] == "owner_1"
    assert client.get("/api/v1/dashboard").json()["total_checkins"] == 1
    assert client.get("/api/v1/inventory").json()["total"] == 1

    with SessionLocal() as session:
        user = session.get(User, user_id)
        assert user is not None
        assert user.password_hash == original_password_hash
        assert (
            set(
                session.scalars(
                    select(AuthSession.token_hash).where(AuthSession.user_id == user_id)
                ).all()
            )
            == original_session_hashes
        )
        assert (
            session.scalar(select(AuthSession.revoked_at).where(AuthSession.user_id == user_id))
            is None
        )
        assert session.scalar(select(User.id).where(User.username == "owner_1")) == user_id
        assert session.scalar(select(User.id).where(User.username == "local")) is None

    client.cookies.clear()
    token = csrf(client)
    old_login = client.post(
        "/api/v1/auth/login",
        json={"username": "local", "password": PASSWORD},
        headers={"X-CSRF-Token": token},
    )
    assert old_login.status_code == 401
    new_login = client.post(
        "/api/v1/auth/login",
        json={"username": "owner_1", "password": PASSWORD},
        headers={"X-CSRF-Token": token},
    )
    assert new_login.status_code == 200
    assert new_login.json()["user"]["id"] == user_id


def test_privately_created_users_are_isolated_across_all_read_apis(client, monkeypatch):
    from backend.app.cli import create_user_command

    monkeypatch.setattr("backend.app.cli.password_prompt", lambda: "synthetic-second-password")
    create_user_command("second")
    with SessionLocal() as session:
        other = session.scalar(select(User).where(User.username == "second"))
        assert other is not None
        LocationService(session).create_location(other.id, "Second Storage")
        other_id = other.id
        session.commit()
    service = ImportService()
    service.import_checkins(other_id, "other-checkins.csv", CHECKIN_CSV)
    service.import_inventory(other_id, "other-inventory.csv", INVENTORY_CSV, confirmed=True)

    client.cookies.clear()
    token = csrf(client)
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"username": "second", "password": "synthetic-second-password"},
            headers={"X-CSRF-Token": token},
        ).status_code
        == 200
    )
    assert client.get("/api/v1/dashboard").json()["total_checkins"] == 1
    assert client.get("/api/v1/inventory").json()["total"] == 1
    assert client.get("/api/v1/locations").json()["locations"][0]["name"] == "Second Storage"
    assert len(client.get("/api/v1/imports").json()) == 2

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
    assert client.get("/api/v1/inventory").json()["total"] == 0
    assert client.get("/api/v1/locations").json()["locations"] == []
    assert client.get("/api/v1/imports").json() == []


def test_startup_does_not_create_an_implicit_account(client, monkeypatch):
    from backend.app.cli import create_user_command
    from backend.app.main import initialize_database

    with SessionLocal() as session:
        session.query(AuthSession).delete()
        session.query(AuthAuditEvent).delete()
        session.query(AuthLoginAttempt).delete()
        session.query(User).delete()
        session.commit()
    initialize_database()
    with SessionLocal() as session:
        assert session.scalar(select(User.id)) is None

    monkeypatch.setattr("backend.app.cli.password_prompt", lambda: "synthetic-bootstrap-password")
    create_user_command(" First.Owner ", require_empty=True)
    with SessionLocal() as session:
        user = session.scalar(select(User))
        assert user is not None
        assert user.id == 1
        assert user.username == "first.owner"
        assert user.password_hash


def test_user_cli_validates_rename_and_requires_explicit_targets(client, monkeypatch):
    from backend.app.cli import create_user_command, parser, rename_user_command

    with pytest.raises(SystemExit):
        parser().parse_args(["set-password"])
    monkeypatch.setattr("backend.app.cli.password_prompt", lambda: "synthetic-second-password")
    create_user_command("second")
    with pytest.raises(SystemExit, match="already in use"):
        rename_user_command(1, "second")
    with pytest.raises(SystemExit, match="username must contain"):
        rename_user_command(1, "Bad Name")
