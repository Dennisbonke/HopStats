import csv
from datetime import UTC, datetime
from io import StringIO

from sqlalchemy import select

from backend.app.db import SessionLocal
from backend.app.models import Beer, Checkin, ImportRun, InventoryItem, User
from backend.app.services.import_service import ImportService


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


def stash_row(
    item_id: str,
    name: str = "Pilsner",
    quantity: str = "1",
    bottled_date: str = "0000-00-00 00:00:00",
) -> dict[str, str]:
    return {
        "item_id": item_id,
        "beer_name": name,
        "brewery_name": "Hop Works",
        "beer_type": "Pilsner",
        "beer_abv": "5.0",
        "beer_ibu": "25",
        "created_at": "2026-10-06T12:00:00+00:00",
        "notes": "cellar shelf A",
        "quantity": quantity,
        "container": "Bottle",
        "purchase_date": "2026-09-01",
        "bottled_date": bottled_date,
        "best_by_date_iso": "2100-01-01",
        "purchase_location": "Brew Shop",
        "purchase_price": "4.50",
        "photo": "https://image.example/beer.jpg",
    }


def local_user_id() -> int:
    with SessionLocal() as session:
        return session.scalar(select(User.id).where(User.username == "local"))


def checkin_payload(checkin_id: str, bid: str) -> bytes:
    fields = {
        "beer_name": "Pilsner",
        "brewery_name": "Hop Works",
        "beer_type": "Pilsner",
        "beer_abv": "5.0",
        "beer_ibu": "25",
        "created_at": "2026-09-29T20:00:00-07:00",
        "timezone_offset": "-420",
        "checkin_id": checkin_id,
        "bid": bid,
        "brewery_id": "brew-1",
    }
    headers = [
        "beer_name",
        "brewery_name",
        "beer_type",
        "beer_abv",
        "beer_ibu",
        "created_at",
        "timezone_offset",
        "checkin_id",
        "bid",
        "brewery_id",
    ]
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=headers)
    writer.writeheader()
    writer.writerow(fields)
    return output.getvalue().encode()


def test_inventory_snapshot_is_idempotent_and_authoritative(client):
    service = ImportService()
    user_id = local_user_id()
    payload = stash_csv(stash_row("item-1", quantity="2"), stash_row("item-2"))
    first = service.import_inventory(user_id, "stash.csv", payload, confirmed=True)
    assert (
        first.inserted_count,
        first.updated_count,
        first.unchanged_count,
        first.removed_count,
    ) == (2, 0, 0, 0)
    second = service.import_inventory(user_id, "stash.csv", payload, confirmed=True)
    assert (
        second.inserted_count,
        second.updated_count,
        second.unchanged_count,
        second.removed_count,
    ) == (0, 0, 2, 0)
    changed = service.import_inventory(
        user_id,
        "stash.csv",
        stash_csv(stash_row("item-1", quantity="4")),
        confirmed=True,
        allow_undated=True,
    )
    assert (
        changed.inserted_count,
        changed.updated_count,
        changed.unchanged_count,
        changed.removed_count,
    ) == (0, 1, 0, 1)
    with SessionLocal() as session:
        item = session.scalar(select(InventoryItem).where(InventoryItem.source_item_id == "item-1"))
        assert item.quantity == 4
        assert item.photo_url == "https://image.example/beer.jpg"
        assert item.best_before_suspicious is True
        assert item.notes == "cellar shelf A"
        assert item.purchase_location == "Brew Shop"
        assert session.query(InventoryItem).count() == 1
        assert session.query(Beer).filter_by(source_system="untappd_stash").count() == 1


def test_inventory_import_order_reconciles_without_reupload(client):
    service = ImportService()
    user_id = local_user_id()
    initial = service.import_inventory(user_id, "stash.csv", stash_csv(stash_row("item-1")), True)
    assert initial.status == "completed"
    with SessionLocal() as session:
        item = session.scalar(select(InventoryItem).where(InventoryItem.source_item_id == "item-1"))
        provisional_id = item.beer_id
        assert item.match_status == "unmatched"

    service.import_checkins(user_id, "checkins.csv", checkin_payload("check-1", "bid-1"))
    with SessionLocal() as session:
        item = session.scalar(select(InventoryItem).where(InventoryItem.source_item_id == "item-1"))
        assert item.beer_id == provisional_id
        assert item.match_status == "exact"
        assert item.matched_checkin_beer_id is not None


def test_invalid_snapshot_and_missing_confirmation_preserve_previous_inventory(client):
    service = ImportService()
    user_id = local_user_id()
    service.import_inventory(user_id, "valid.csv", stash_csv(stash_row("item-1")), True)
    invalid = service.import_inventory(
        user_id, "invalid.csv", stash_csv(stash_row("item-2", quantity="not-a-number")), True
    )
    unconfirmed = service.import_inventory(user_id, "unconfirmed.csv", stash_csv(), False)
    assert invalid.status == "failed"
    assert unconfirmed.status == "failed"
    with SessionLocal() as session:
        assert session.query(InventoryItem).count() == 1
        assert session.scalar(select(InventoryItem.source_item_id)) == "item-1"
        failed = session.scalars(select(ImportRun).where(ImportRun.status == "failed")).all()
        assert len(failed) == 2


def test_older_snapshot_requires_explicit_override(client):
    service = ImportService()
    user_id = local_user_id()
    service.import_inventory(
        user_id,
        "new.csv",
        stash_csv(stash_row("new-item")),
        True,
        source_exported_at=datetime(2026, 10, 6, tzinfo=UTC),
    )
    older = service.import_inventory(
        user_id,
        "old.csv",
        stash_csv(stash_row("old-item")),
        True,
        source_exported_at=datetime(2026, 10, 1, tzinfo=UTC),
    )
    assert older.status == "failed"
    assert older.error_code == "older_snapshot"
    with SessionLocal() as session:
        assert session.scalar(select(InventoryItem.source_item_id)) == "new-item"


def test_undated_replacement_requires_acknowledgement_but_identical_reimport_is_safe(client):
    service = ImportService()
    user_id = local_user_id()
    payload = stash_csv(stash_row("current-item"))
    first = service.import_inventory(user_id, "stash.csv", payload, True)
    identical = service.import_inventory(user_id, "stash.csv", payload, True)
    rejected = service.import_inventory(
        user_id, "undated-new.csv", stash_csv(stash_row("new-item")), True
    )
    replaced = service.import_inventory(
        user_id,
        "undated-new.csv",
        stash_csv(stash_row("new-item")),
        True,
        allow_undated=True,
    )
    assert first.status == "completed"
    assert identical.status == "completed"
    assert rejected.error_code == "undated_snapshot"
    assert replaced.status == "completed"
    with SessionLocal() as session:
        assert session.scalar(select(InventoryItem.source_item_id)) == "new-item"


def test_ambiguous_match_is_not_auto_merged(client):
    service = ImportService()
    user_id = local_user_id()
    first = checkin_payload("check-1", "bid-1")
    second = first.replace(b"check-1,bid-1", b"check-2,bid-2")
    service.import_checkins(user_id, "one.csv", first)
    service.import_checkins(user_id, "two.csv", second)
    service.import_inventory(user_id, "stash.csv", stash_csv(stash_row("item-1")), True)
    with SessionLocal() as session:
        item = session.scalar(select(InventoryItem).where(InventoryItem.source_item_id == "item-1"))
        assert item.match_status == "ambiguous"
        assert item.matched_checkin_beer_id is None


def test_distinct_release_dates_keep_distinct_provisional_beer_identities(client):
    service = ImportService()
    user_id = local_user_id()
    service.import_inventory(
        user_id,
        "releases.csv",
        stash_csv(
            stash_row("item-1", bottled_date="2025-01-01"),
            stash_row("item-2", bottled_date="2026-01-01"),
        ),
        True,
    )
    with SessionLocal() as session:
        items = session.scalars(select(InventoryItem).order_by(InventoryItem.source_item_id)).all()
        assert items[0].beer_id != items[1].beer_id
        assert session.query(Beer).filter_by(source_system="untappd_stash").count() == 2


def test_changed_release_metadata_reconciles_without_duplicate_key(client):
    service = ImportService()
    user_id = local_user_id()
    service.import_inventory(
        user_id,
        "corrected.csv",
        stash_csv(stash_row("item-1", bottled_date="2025-01-01")),
        True,
    )
    with SessionLocal() as session:
        original = session.scalar(
            select(InventoryItem).where(InventoryItem.source_item_id == "item-1")
        )
        original_beer_id = original.beer_id

    service.import_inventory(
        user_id,
        "corrected.csv",
        stash_csv(stash_row("item-1", bottled_date="2026-01-01")),
        True,
        allow_undated=True,
    )
    with SessionLocal() as session:
        item = session.scalar(select(InventoryItem).where(InventoryItem.source_item_id == "item-1"))
        beer = session.get(Beer, item.beer_id)
        assert item.beer_id == original_beer_id
        assert beer.provisional_key is not None
        assert "2026-01-01" in beer.provisional_key
        assert session.query(Beer).filter_by(source_system="untappd_stash").count() == 1


def test_changed_shared_release_splits_then_reuses_corrected_identity(client):
    service = ImportService()
    user_id = local_user_id()
    service.import_inventory(
        user_id,
        "shared.csv",
        stash_csv(
            stash_row("item-1", bottled_date="2025-01-01"),
            stash_row("item-2", bottled_date="2025-01-01"),
        ),
        True,
    )
    service.import_inventory(
        user_id,
        "shared.csv",
        stash_csv(
            stash_row("item-1", bottled_date="2026-01-01"),
            stash_row("item-2", bottled_date="2025-01-01"),
        ),
        True,
        allow_undated=True,
    )
    with SessionLocal() as session:
        items = session.scalars(select(InventoryItem).order_by(InventoryItem.source_item_id)).all()
        assert items[0].beer_id != items[1].beer_id
        corrected_id = items[0].beer_id
        assert session.query(Beer).filter_by(source_system="untappd_stash").count() == 2

    # Reimporting the corrected release does not create a third identity.
    service.import_inventory(
        user_id,
        "shared.csv",
        stash_csv(
            stash_row("item-1", bottled_date="2026-01-01"),
            stash_row("item-2", bottled_date="2025-01-01"),
        ),
        True,
        allow_undated=True,
    )
    with SessionLocal() as session:
        item = session.scalar(select(InventoryItem).where(InventoryItem.source_item_id == "item-1"))
        assert item.beer_id == corrected_id
        assert session.query(Beer).filter_by(source_system="untappd_stash").count() == 2

    # Reimporting the same rows reuses both release identities.
    service.import_inventory(
        user_id,
        "releases.csv",
        stash_csv(
            stash_row("item-1", bottled_date="2025-01-01"),
            stash_row("item-2", bottled_date="2026-01-01"),
        ),
        True,
    )
    with SessionLocal() as session:
        assert session.query(Beer).filter_by(source_system="untappd_stash").count() == 2


def test_match_candidates_are_user_scoped(client):
    service = ImportService()
    with SessionLocal() as session:
        other = User(username="other")
        session.add(other)
        session.commit()
        other_id = other.id
    service.import_checkins(other_id, "other.csv", checkin_payload("check-1", "bid-1"))
    service.import_inventory(local_user_id(), "stash.csv", stash_csv(stash_row("item-1")), True)
    with SessionLocal() as session:
        item = session.scalar(select(InventoryItem).where(InventoryItem.source_item_id == "item-1"))
        assert item.match_status == "unmatched"
        assert session.query(Checkin).filter_by(user_id=other_id).count() == 1
