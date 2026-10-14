import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    database = tmp_path / "test.sqlite3"
    monkeypatch.setenv("HOPSTATS_DATABASE_URL", f"sqlite:///{database}")
    from backend.app.config import get_settings

    get_settings.cache_clear()
    import backend.app.db as db

    db.engine = db.make_engine(f"sqlite:///{database}")
    db.SessionLocal.configure(bind=db.engine)
    from backend.app.main import app, initialize_database
    from backend.app.models import User
    from backend.app.services.auth import set_user_password

    initialize_database()
    from backend.app.db import SessionLocal

    with SessionLocal() as session:
        user = session.query(User).filter_by(username="local").one()
        set_user_password(session, user, "synthetic-test-password")
        session.commit()
    with TestClient(app) as test_client:
        csrf = test_client.get("/api/v1/auth/csrf").cookies.get("hopstats_csrf")
        test_client.post(
            "/api/v1/auth/login",
            json={"username": "local", "password": "synthetic-test-password"},
            headers={"X-CSRF-Token": csrf},
        )
        test_client.headers.update({"X-CSRF-Token": csrf})
        yield test_client
    db.engine.dispose()
    get_settings.cache_clear()


def pytest_configure():
    os.environ.setdefault("HOPSTATS_DATABASE_URL", "sqlite:///:memory:")
