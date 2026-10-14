import csv
from io import StringIO

import pytest
from sqlalchemy import select

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
