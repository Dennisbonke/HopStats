from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from backend.app.db import SessionLocal, get_db
from backend.app.models import User


def test_health(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_migration_and_default_user_are_idempotent(client):
    from backend.app.main import initialize_database

    initialize_database()
    with SessionLocal() as session:
        assert session.query(User).filter_by(username="local").count() == 1


def test_foreign_keys_are_enabled(client):
    with SessionLocal() as session:
        assert session.execute(text("PRAGMA foreign_keys")).scalar() == 1


def test_unavailable_database_returns_503(client, tmp_path):
    from backend.app.main import app

    class BrokenSession:
        def execute(self, _query):
            raise OperationalError("SELECT 1", {}, OSError("database unavailable"))

    def broken_db():
        yield BrokenSession()

    app.dependency_overrides[get_db] = broken_db
    response = client.get("/api/v1/health")
    assert response.status_code == 503
    app.dependency_overrides.clear()
