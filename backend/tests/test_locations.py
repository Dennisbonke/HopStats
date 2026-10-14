import csv
from io import StringIO
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, select, text

from backend.app.config import get_settings
from backend.app.db import SessionLocal
from backend.app.main import initialize_database
from backend.app.models import InventoryItem, Location, LocationAlias, LocationResolutionRule, User
from backend.app.services.import_service import ImportService
from backend.app.services.location_resolution import LocationResolver, normalize_location
from backend.app.services.locations import (
    LocationConfigurationError,
    LocationService,
    seed_location_config,
)


def local_user_id() -> int:
    with SessionLocal() as session:
        return session.scalar(select(User.id).where(User.username == "local"))


def stash_csv(*rows: dict[str, str]) -> bytes:
    fields = [
        "item_id",
        "beer_name",
        "brewery_name",
        "beer_type",
        "beer_abv",
        "beer_ibu",
        "created_at",
        "notes",
        "quantity",
        "container",
        "purchase_date",
        "bottled_date",
        "best_by_date",
        "best_by_date_iso",
        "purchase_location",
        "purchase_price",
        "photo",
    ]
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue().encode()


def stash_row(item_id: str, notes: str, quantity: str = "1") -> dict[str, str]:
    return {
        "item_id": item_id,
        "beer_name": f"Beer {item_id}",
        "brewery_name": "Brewery",
        "beer_type": "Pilsner",
        "beer_abv": "5.0",
        "beer_ibu": "25",
        "created_at": "2026-10-06T12:00:00+00:00",
        "notes": notes,
        "quantity": quantity,
        "container": "Bottle",
        "purchase_date": "2026-09-01",
        "bottled_date": "0000-00-00 00:00:00",
        "best_by_date_iso": "2100-01-01",
        "purchase_location": "Shop",
        "purchase_price": "4.50",
        "photo": "",
    }


def make_tree() -> tuple[int, int, int, int]:
    user_id = local_user_id()
    with SessionLocal() as session:
        service = LocationService(session)
        root = service.create_location(user_id, "Main Storage")
        cellar = service.create_location(user_id, "Cellar", root.id)
        shelf = service.create_location(user_id, "Shelf A", cellar.id)
        service.create_alias(user_id, cellar.id, "  CELLAR\u00a0  stash ")
        session.commit()
        return user_id, root.id, cellar.id, shelf.id


def test_normalization_and_alias_conflict(client):
    assert normalize_location("  Café\u00a0 stash ") == "café stash"
    user_id = local_user_id()
    with SessionLocal() as session:
        service = LocationService(session)
        first = service.create_location(user_id, "First")
        second = service.create_location(user_id, "Second")
        service.create_alias(user_id, first.id, "Back shelf")
        with pytest.raises(LocationConfigurationError):
            service.create_alias(user_id, second.id, " back   shelf ")
        with pytest.raises(LocationConfigurationError):
            service.create_rule(user_id, first.id, "   ", "line")
        session.commit()

    with SessionLocal() as session:
        with pytest.raises(LocationConfigurationError):
            seed_location_config(
                session,
                user_id,
                {"locations": [{"name": "Invalid", "rules": [{"pattern": "  "}]}]},
            )


def test_resolves_exact_alias_lines_rules_and_ambiguity(client):
    user_id, root_id, cellar_id, shelf_id = make_tree()
    with SessionLocal() as session:
        service = LocationService(session)
        balcony = service.create_location(user_id, "Balcony", root_id)
        service.create_rule(user_id, balcony.id, "Box:", "prefix", priority=4)
        conflict = service.create_location(user_id, "Cellar", None)
        session.commit()
        resolver = LocationResolver(session, user_id)
        assert resolver.resolve("cellar stash").location_id == cellar_id
        assert resolver.resolve("Header\nShelf A\nOther").location_id == shelf_id
        assert resolver.resolve("Box: summer stock").location_id == balcony.id
        assert resolver.resolve("Cellar").status == "ambiguous"
        assert resolver.resolve("unrelated tasting notes").status == "unresolved"
        assert conflict.id != cellar_id


def test_nested_counts_filtering_and_unresolved_records(client):
    user_id, root_id, cellar_id, shelf_id = make_tree()
    ImportService().import_inventory(
        user_id,
        "stash.csv",
        stash_csv(
            stash_row("item-1", "cellar stash", "2"),
            stash_row("item-2", "Shelf A", "3"),
            stash_row("item-3", "unrelated", "4"),
        ),
        confirmed=True,
    )
    locations = client.get("/api/v1/locations")
    assert locations.status_code == 200
    root = locations.json()["locations"][0]
    assert root["path"] == "Main Storage"
    assert root["record_count"] == 2
    assert root["total_units"] == 5
    assert root["children"][0]["path"] == "Main Storage → Cellar"
    assert locations.json()["unresolved"] == {"record_count": 1, "total_units": 4}

    parent = client.get(f"/api/v1/inventory?location_id={root_id}")
    assert parent.json()["total"] == 2
    unresolved = client.get("/api/v1/inventory?unresolved=true")
    assert unresolved.json()["total"] == 1
    assert client.get("/api/v1/locations/999").status_code == 404

    ImportService().import_inventory(
        user_id,
        "reduced.csv",
        stash_csv(stash_row("item-1", "cellar stash", "2")),
        True,
        allow_undated=True,
    )
    reduced = client.get(f"/api/v1/locations/{root_id}").json()
    assert reduced["record_count"] == 1
    assert reduced["total_units"] == 2


def test_cycle_prevention_repeatable_seed_and_explicit_assignment(client):
    user_id = local_user_id()
    config = {
        "locations": [
            {
                "name": "Example",
                "aliases": ["Example alias"],
                "children": [
                    {"name": "Shelf", "rules": [{"pattern": "Shelf:", "match_kind": "prefix"}]}
                ],
            }
        ]
    }
    with SessionLocal() as session:
        assert seed_location_config(session, user_id, config) == 2
        session.commit()
    with SessionLocal() as session:
        assert seed_location_config(session, user_id, config) == 0
        service = LocationService(session)
        example = session.scalar(select(Location).where(Location.name == "Example"))
        shelf = session.scalar(select(Location).where(Location.name == "Shelf"))
        with pytest.raises(LocationConfigurationError):
            service.move_location(user_id, example.id, shelf.id)
        session.commit()

    ImportService().import_inventory(
        user_id, "stash.csv", stash_csv(stash_row("item-1", "Example alias")), True
    )
    with SessionLocal() as session:
        item = session.scalar(select(InventoryItem).where(InventoryItem.source_item_id == "item-1"))
        shelf = session.scalar(select(Location).where(Location.name == "Shelf"))
        item.location_id = shelf.id
        item.location_assignment_kind = "explicit"
        session.commit()
    ImportService().import_inventory(
        user_id,
        "stash.csv",
        stash_csv(stash_row("item-1", "now unrelated")),
        True,
        allow_undated=True,
    )
    with SessionLocal() as session:
        item = session.scalar(select(InventoryItem).where(InventoryItem.source_item_id == "item-1"))
        assert item.location_id == shelf.id
        assert item.location_assignment_kind == "explicit"
        assert item.location_resolution_source == "manual"


def test_automatic_assignments_are_recomputed_and_cross_user_parents_are_rejected(client):
    user_id, _, cellar_id, _ = make_tree()
    ImportService().import_inventory(
        user_id, "stash.csv", stash_csv(stash_row("item-1", "cellar stash")), True
    )
    with SessionLocal() as session:
        item = session.scalar(select(InventoryItem).where(InventoryItem.source_item_id == "item-1"))
        assert item.location_id == cellar_id
        assert item.location_assignment_kind == "automatic"
        assert LocationService(session).reconcile(user_id) == 0
        session.commit()

    ImportService().import_inventory(
        user_id,
        "changed-notes.csv",
        stash_csv(stash_row("item-1", "unrelated prose")),
        True,
        allow_undated=True,
    )
    with SessionLocal() as session:
        item = session.scalar(select(InventoryItem).where(InventoryItem.source_item_id == "item-1"))
        assert item.location_id is None
        assert item.location_resolution_status == "unresolved"
        other = User(username="other")
        session.add(other)
        session.flush()
        foreign = LocationService(session).create_location(other.id, "Other Storage")
        with pytest.raises(LocationConfigurationError):
            LocationService(session).create_location(user_id, "Child", foreign.id)
        session.commit()


def test_configuration_reconciliation_removes_only_obsolete_managed_definitions(client):
    user_id = local_user_id()
    old_config = {
        "locations": [
            {
                "name": "Configured Storage",
                "aliases": ["Old alias"],
                "rules": [{"pattern": "Old box:", "match_kind": "prefix"}],
            }
        ]
    }
    with SessionLocal() as session:
        location_id = seed_location_config(session, user_id, old_config)
        assert location_id == 1
        location = session.scalar(select(Location).where(Location.name == "Configured Storage"))
        service = LocationService(session)
        service.create_alias(user_id, location.id, "Manual alias")
        service.create_rule(user_id, location.id, "Manual box:", "prefix")
        session.commit()

    ImportService().import_inventory(
        user_id,
        "configured.csv",
        stash_csv(
            stash_row("alias-item", "Old alias"),
            stash_row("rule-item", "Old box: summer stock"),
        ),
        True,
    )
    with SessionLocal() as session:
        items = session.scalars(select(InventoryItem).order_by(InventoryItem.source_item_id)).all()
        assert [item.location_id for item in items] == [1, 1]

    new_config = {
        "locations": [
            {
                "name": "Configured Storage",
                "aliases": ["New alias"],
                "rules": [{"pattern": "New box:", "match_kind": "prefix"}],
            }
        ]
    }
    with SessionLocal() as session:
        assert seed_location_config(session, user_id, new_config) == 0
        session.commit()
        assert (
            session.scalar(
                select(LocationAlias).where(LocationAlias.normalized_alias == "old alias")
            )
            is None
        )
        assert (
            session.scalar(
                select(LocationResolutionRule).where(LocationResolutionRule.pattern == "old box:")
            )
            is None
        )
        assert (
            session.scalar(
                select(LocationAlias).where(LocationAlias.normalized_alias == "manual alias")
            )
            is not None
        )
        assert (
            session.scalar(
                select(LocationResolutionRule).where(
                    LocationResolutionRule.pattern == "manual box:"
                )
            )
            is not None
        )
        assert LocationService(session).reconcile(user_id) == 2
        session.commit()

    with SessionLocal() as session:
        items = session.scalars(select(InventoryItem).order_by(InventoryItem.source_item_id)).all()
        assert all(item.location_id is None for item in items)
        resolver = LocationResolver(session, user_id)
        assert resolver.resolve("New alias").location_id == 1
        assert resolver.resolve("New box: summer stock").location_id == 1


def test_configuration_does_not_claim_or_overwrite_ui_managed_records(client):
    user_id = local_user_id()
    with SessionLocal() as session:
        service = LocationService(session)
        location = service.create_location(user_id, "Shared name", description="UI description")
        service.create_alias(user_id, location.id, "UI alias")
        session.commit()

    with SessionLocal() as session:
        seed_location_config(
            session,
            user_id,
            {
                "locations": [
                    {
                        "name": "Shared name",
                        "description": "JSON description",
                        "aliases": ["UI alias"],
                    }
                ]
            },
        )
        session.commit()
        location = session.scalar(select(Location).where(Location.name == "Shared name"))
        alias = session.scalar(select(LocationAlias).where(LocationAlias.alias == "UI alias"))
        assert location.description == "UI description"
        assert location.managed_by_config is False
        assert alias.managed_by_config is False


def test_legacy_location_can_be_explicitly_transferred_without_changing_ids(client):
    user_id = local_user_id()
    with SessionLocal() as session:
        service = LocationService(session)
        root = service.create_location(user_id, "Legacy root")
        child = service.create_location(user_id, "Legacy child", root.id)
        alias = service.create_alias(user_id, root.id, "Legacy alias")
        root.managed_by_config = None
        child.managed_by_config = None
        session.commit()
        root_id, child_id, alias_id = root.id, child.id, alias.id

    ImportService().import_inventory(
        user_id, "legacy.csv", stash_csv(stash_row("legacy-item", "Legacy alias")), True
    )
    response = client.post(
        f"/api/v1/locations/{root_id}/ownership",
        json={"confirm_configuration_removed": True},
    )
    assert response.status_code == 200
    assert response.json()["id"] == root_id

    with SessionLocal() as session:
        root = session.get(Location, root_id)
        child = session.get(Location, child_id)
        alias = session.get(LocationAlias, alias_id)
        item = session.scalar(
            select(InventoryItem).where(InventoryItem.source_item_id == "legacy-item")
        )
        assert root.managed_by_config is False
        assert child.managed_by_config is False
        assert alias.id == alias_id
        assert alias.managed_by_config is False
        assert item.location_id == root_id


def test_provenance_migration_preserves_populated_m5_location_ids(tmp_path):
    database = tmp_path / "populated-m5.sqlite3"
    database_url = f"sqlite:///{database}"
    alembic_config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    alembic_config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(alembic_config, "008_authentication")
    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            text("INSERT INTO users (id, username, created_at) VALUES (7, 'legacy', '2026-01-01')")
        )
        connection.execute(
            text(
                "INSERT INTO locations (id, user_id, parent_id, name) "
                "VALUES (41, 7, NULL, 'Legacy root')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO locations (id, user_id, parent_id, name) "
                "VALUES (42, 7, 41, 'Legacy child')"
            )
        )
    command.upgrade(alembic_config, "head")
    with engine.connect() as connection:
        rows = connection.execute(
            text(
                "SELECT id, parent_id, managed_by_config FROM locations "
                "WHERE user_id = 7 ORDER BY id"
            )
        ).all()
    assert [(row.id, row.parent_id, row.managed_by_config) for row in rows] == [
        (41, None, None),
        (42, 41, None),
    ]
    engine.dispose()


def test_transfer_requires_private_configuration_removal(client, tmp_path, monkeypatch):
    user_id = local_user_id()
    with SessionLocal() as session:
        location = LocationService(session).create_location(user_id, "Configured legacy")
        location.managed_by_config = None
        session.commit()
        location_id = location.id
    config_path = tmp_path / "active-locations.json"
    config_path.write_text('{"locations":[]}', encoding="utf-8")
    monkeypatch.setenv("HOPSTATS_LOCATION_CONFIG", str(config_path))
    get_settings.cache_clear()

    response = client.post(
        f"/api/v1/locations/{location_id}/ownership",
        json={"confirm_configuration_removed": True},
    )
    assert response.status_code == 409


def test_configuration_reload_removes_obsolete_managed_definitions_and_reconciles(
    client, tmp_path, monkeypatch
):
    user_id = local_user_id()
    config_path = tmp_path / "locations.json"
    config_path.write_text(
        '{"locations":[{"name":"Restart storage","aliases":["Old restart alias"],'
        '"rules":[{"pattern":"Old restart:","match_kind":"prefix"}]}]}',
        encoding="utf-8",
    )
    monkeypatch.setenv("HOPSTATS_LOCATION_CONFIG", str(config_path))
    get_settings.cache_clear()
    initialize_database()

    with SessionLocal() as session:
        location = session.scalar(select(Location).where(Location.name == "Restart storage"))
        service = LocationService(session)
        ui_alias = service.create_alias(user_id, location.id, "UI restart alias")
        ui_rule = service.create_rule(user_id, location.id, "UI restart:", "prefix")
        session.commit()
        ui_alias_id, ui_rule_id = ui_alias.id, ui_rule.id

    ImportService().import_inventory(
        user_id,
        "restart.csv",
        stash_csv(
            stash_row("old-alias-item", "Old restart alias"),
            stash_row("old-rule-item", "Old restart: summer"),
        ),
        True,
    )
    config_path.write_text(
        '{"locations":[{"name":"Restart storage","aliases":[],"rules":[]}]}',
        encoding="utf-8",
    )
    get_settings.cache_clear()
    initialize_database()

    with SessionLocal() as session:
        assert (
            session.scalar(
                select(LocationAlias).where(LocationAlias.normalized_alias == "old restart alias")
            )
            is None
        )
        assert (
            session.scalar(
                select(LocationResolutionRule).where(
                    LocationResolutionRule.pattern == "old restart:"
                )
            )
            is None
        )
        assert session.get(LocationAlias, ui_alias_id) is not None
        assert session.get(LocationResolutionRule, ui_rule_id) is not None
        items = session.scalars(select(InventoryItem).order_by(InventoryItem.source_item_id)).all()
        assert all(item.location_id is None for item in items)


def test_private_location_config_has_explicit_owner_and_isolated_restart(
    client, tmp_path, monkeypatch
):
    owner_id = local_user_id()
    config_path = tmp_path / "private-locations.json"
    config_path.write_text(
        '{"locations":[{"name":"Owner Storage","aliases":["Owner alias"],'
        '"rules":[{"pattern":"Owner:","match_kind":"prefix"}]}]}',
        encoding="utf-8",
    )
    monkeypatch.setenv("HOPSTATS_LOCATION_CONFIG", str(config_path))
    get_settings.cache_clear()
    initialize_database()
    initialize_database()

    with SessionLocal() as session:
        owner_location = session.scalar(
            select(Location).where(Location.user_id == owner_id, Location.name == "Owner Storage")
        )
        assert owner_location is not None

        other = User(username="other-location-owner")
        session.add(other)
        session.flush()
        other_id = other.id
        session.commit()

    monkeypatch.setenv("HOPSTATS_LOCATION_CONFIG_USER_ID", str(owner_id))
    get_settings.cache_clear()
    initialize_database()
    initialize_database()

    with SessionLocal() as session:
        owner_location = session.scalar(
            select(Location).where(Location.user_id == owner_id, Location.name == "Owner Storage")
        )
        assert owner_location is not None
        assert (
            session.scalar(
                select(Location).where(
                    Location.user_id == other_id, Location.name == "Owner Storage"
                )
            )
            is None
        )
        assert (
            session.scalar(
                select(LocationAlias).where(
                    LocationAlias.user_id == other_id,
                    LocationAlias.normalized_alias == "owner alias",
                )
            )
            is None
        )
        assert (
            session.scalar(
                select(LocationResolutionRule).where(
                    LocationResolutionRule.user_id == other_id,
                    LocationResolutionRule.pattern == "owner:",
                )
            )
            is None
        )

    monkeypatch.delenv("HOPSTATS_LOCATION_CONFIG_USER_ID")
    get_settings.cache_clear()
    with pytest.raises(LocationConfigurationError, match="ambiguous"):
        initialize_database()


def test_location_management_api_creates_moves_edits_and_rejects_cycles(client):
    root_response = client.post(
        "/api/v1/locations", json={"name": " Phone Storage ", "description": "At home"}
    )
    assert root_response.status_code == 201
    root = root_response.json()
    assert root["name"] == "Phone Storage"
    assert root["description"] == "At home"
    child_response = client.post(
        "/api/v1/locations",
        json={"name": "Shelf", "parent_id": root["id"]},
    )
    assert child_response.status_code == 201
    child = child_response.json()

    renamed = client.patch(
        f"/api/v1/locations/{child['id']}",
        json={"name": "Summer Shelf", "description": "Warm season stock"},
    )
    assert renamed.status_code == 200
    assert renamed.json()["path"] == "Phone Storage → Summer Shelf"
    assert renamed.json()["description"] == "Warm season stock"

    other_root = client.post("/api/v1/locations", json={"name": "Other"}).json()
    moved = client.patch(f"/api/v1/locations/{child['id']}", json={"parent_id": other_root["id"]})
    assert moved.status_code == 200
    assert moved.json()["path"] == "Other → Summer Shelf"
    cycle = client.patch(f"/api/v1/locations/{other_root['id']}", json={"parent_id": child["id"]})
    assert cycle.status_code == 409

    duplicate = client.post("/api/v1/locations", json={"name": "other"})
    assert duplicate.status_code == 409


def test_alias_api_reconciles_and_protects_configured_aliases(client):
    user_id = local_user_id()
    with SessionLocal() as session:
        location = LocationService(session).create_location(user_id, "Alias Storage")
        session.commit()
        location_id = location.id
    ImportService().import_inventory(
        user_id, "alias.csv", stash_csv(stash_row("alias-item", "new shelf")), True
    )

    created = client.post(
        f"/api/v1/locations/{location_id}/aliases", json={"alias": "  New\u00a0 shelf "}
    )
    assert created.status_code == 201
    alias = created.json()["alias"]
    assert alias["alias"] == "New shelf"
    assert created.json()["reconciliation"]["changed_records"] == 1
    item = client.get("/api/v1/inventory").json()["items"][0]
    assert item["location"]["id"] == location_id

    edited = client.patch(
        f"/api/v1/locations/{location_id}/aliases/{alias['id']}",
        json={"alias": "Edited shelf"},
    )
    assert edited.status_code == 200
    assert (
        client.delete(f"/api/v1/locations/{location_id}/aliases/{alias['id']}").status_code == 204
    )
    assert client.get("/api/v1/inventory").json()["items"][0]["location"] is None

    with SessionLocal() as session:
        seed_location_config(
            session,
            user_id,
            {"locations": [{"name": "Configured", "aliases": ["Private name"]}]},
        )
        session.commit()
    configured = client.get("/api/v1/locations").json()["locations"][-1]
    configured_alias = configured["alias_details"][0]
    assert configured["managed_by_config"] is True
    assert configured_alias["managed_by_config"] is True
    assert (
        client.patch(f"/api/v1/locations/{configured['id']}", json={"name": "Changed"}).status_code
        == 409
    )
    assert (
        client.delete(
            f"/api/v1/locations/{configured['id']}/aliases/{configured_alias['id']}"
        ).status_code
        == 409
    )


def test_location_deletion_is_safe_and_writes_require_authentication(client):
    user_id = local_user_id()
    with SessionLocal() as session:
        parent = LocationService(session).create_location(user_id, "Parent")
        child = LocationService(session).create_location(user_id, "Child", parent.id)
        session.commit()
        parent_id, child_id = parent.id, child.id
    assert client.delete(f"/api/v1/locations/{parent_id}").status_code == 409
    assert client.delete(f"/api/v1/locations/{child_id}").status_code == 204

    from fastapi.testclient import TestClient

    from backend.app.main import app

    with TestClient(app) as anonymous:
        csrf = anonymous.get("/api/v1/auth/csrf").cookies.get("hopstats_csrf")
        response = anonymous.post(
            "/api/v1/locations", json={"name": "Not allowed"}, headers={"X-CSRF-Token": csrf}
        )
    assert response.status_code == 401


def test_location_management_api_isolated_between_users(client):
    with SessionLocal() as session:
        other = User(username="location-other")
        session.add(other)
        session.flush()
        foreign = LocationService(session).create_location(other.id, "Private storage")
        session.commit()
        foreign_id = foreign.id

    assert client.get(f"/api/v1/locations/{foreign_id}").status_code == 404
    assert (
        client.patch(f"/api/v1/locations/{foreign_id}", json={"name": "Taken over"}).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/v1/locations/{foreign_id}/aliases", json={"alias": "No access"}
        ).status_code
        == 404
    )


def test_location_writes_require_csrf_header(client):
    response = client.post(
        "/api/v1/locations",
        json={"name": "Missing CSRF"},
        headers={"X-CSRF-Token": "invalid"},
    )
    assert response.status_code == 403


def test_location_mutation_rolls_back_if_reconciliation_fails(client, monkeypatch):
    def fail_reconcile(self, user_id):
        raise RuntimeError("synthetic reconciliation failure")

    monkeypatch.setattr(LocationService, "reconcile", fail_reconcile)
    with pytest.raises(RuntimeError, match="synthetic reconciliation failure"):
        client.post("/api/v1/locations", json={"name": "Rolled back"})

    with SessionLocal() as session:
        assert session.scalar(select(Location).where(Location.name == "Rolled back")) is None
