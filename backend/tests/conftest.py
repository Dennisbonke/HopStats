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

    initialize_database()
    with TestClient(app) as test_client:
        yield test_client
    db.engine.dispose()
    get_settings.cache_clear()


def pytest_configure():
    os.environ.setdefault("HOPSTATS_DATABASE_URL", "sqlite:///:memory:")
