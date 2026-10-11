import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, OperationalError

from backend.app.db import SessionLocal, get_db
from backend.app.models import (
    Beer,
    InventoryItem,
    InventorySource,
    Location,
    LocationAlias,
    LocationResolutionRule,
    User,
)


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


def test_top_level_locations_are_unique(client):
    with SessionLocal() as session:
        user = session.query(User).filter_by(username="local").one()
        session.add(Location(user_id=user.id, name="Cellar"))
        session.commit()
        session.add(Location(user_id=user.id, name="Cellar"))
        with pytest.raises(IntegrityError):
            session.commit()


def test_inventory_source_and_location_must_belong_to_item_user(client):
    with SessionLocal() as session:
        owner = session.query(User).filter_by(username="local").one()
        other = User(username="other")
        session.add(other)
        session.flush()
        source = InventorySource(user_id=owner.id, source_system="test", name="owner")
        other_source = InventorySource(user_id=other.id, source_system="test", name="other")
        location = Location(user_id=owner.id, name="Owner cellar")
        beer = Beer(name="Test beer")
        session.add_all([source, other_source, location, beer])
        session.commit()
        session.add(
            InventoryItem(
                user_id=owner.id,
                inventory_source_id=source.id,
                source_item_id="valid-item",
                beer_id=beer.id,
                location_id=location.id,
                quantity=1,
                match_status="unmatched",
            )
        )
        session.commit()
        session.add(
            InventoryItem(
                user_id=other.id,
                inventory_source_id=source.id,
                source_item_id="source-mismatch",
                beer_id=beer.id,
                quantity=1,
                match_status="unmatched",
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()
        session.add(
            InventoryItem(
                user_id=other.id,
                inventory_source_id=other_source.id,
                source_item_id="location-mismatch",
                beer_id=beer.id,
                location_id=location.id,
                quantity=1,
                match_status="unmatched",
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()


def test_location_references_must_belong_to_same_user(client):
    with SessionLocal() as session:
        owner = session.query(User).filter_by(username="local").one()
        other = User(username="location-other")
        session.add(other)
        session.flush()
        owner_location = Location(user_id=owner.id, name="Owner location")
        session.add(owner_location)
        session.commit()

        session.add(Location(user_id=owner.id, parent_id=owner_location.id, name="Valid child"))
        session.add(
            LocationAlias(
                user_id=owner.id,
                location_id=owner_location.id,
                alias="valid alias",
                normalized_alias="valid alias",
            )
        )
        session.add(
            LocationResolutionRule(
                user_id=owner.id,
                location_id=owner_location.id,
                pattern="valid rule",
                match_kind="exact",
                priority=0,
            )
        )
        session.commit()

        session.add(Location(user_id=other.id, parent_id=owner_location.id, name="Invalid child"))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

        session.add(
            LocationAlias(
                user_id=other.id,
                location_id=owner_location.id,
                alias="invalid alias",
                normalized_alias="invalid alias",
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

        session.add(
            LocationResolutionRule(
                user_id=other.id,
                location_id=owner_location.id,
                pattern="invalid rule",
                match_kind="exact",
                priority=0,
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()


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
