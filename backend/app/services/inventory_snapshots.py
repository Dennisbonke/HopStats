from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Beer, InventoryItem, InventorySource
from ..schemas.imports import NormalizedInventoryItem
from .beer_matching import match_inventory_beer
from .catalog import CatalogService, metadata_json

SOURCE_SYSTEM = "untappd_stash"
SOURCE_NAME = "Untappd stash"


class InventorySnapshotError(ValueError):
    pass


class SnapshotConfirmationRequired(InventorySnapshotError):
    pass


def upsert_inventory_snapshot(
    session: Session,
    user_id: int,
    records: Sequence[NormalizedInventoryItem],
    confirmed: bool,
) -> tuple[int, int, int, int]:
    if not confirmed:
        raise SnapshotConfirmationRequired(
            "inventory imports replace the complete Untappd stash snapshot; "
            "confirmation is required"
        )
    source = session.scalar(
        select(InventorySource).where(
            InventorySource.user_id == user_id,
            InventorySource.source_system == SOURCE_SYSTEM,
            InventorySource.name == SOURCE_NAME,
        )
    )
    if source is None:
        source = InventorySource(
            user_id=user_id,
            source_system=SOURCE_SYSTEM,
            name=SOURCE_NAME,
            is_authoritative=True,
            created_at=datetime.now(UTC),
        )
        session.add(source)
        session.flush()
    elif not source.is_authoritative:
        source.is_authoritative = True

    existing_items = {
        item.source_item_id: item
        for item in session.scalars(
            select(InventoryItem).where(InventoryItem.inventory_source_id == source.id)
        ).all()
    }
    seen: set[str] = set()
    inserted = updated = unchanged = 0
    catalog = CatalogService(session)
    for record in records:
        if record.source_item_id in seen:
            raise InventorySnapshotError(f"duplicate item_id {record.source_item_id}")
        seen.add(record.source_item_id)
        beer = catalog.beer(record.beer)
        match_status, matched = match_inventory_beer(session, beer, user_id)
        values = {
            "user_id": user_id,
            "inventory_source_id": source.id,
            "source_item_id": record.source_item_id,
            "beer_id": beer.id,
            "quantity": record.quantity,
            "container": record.container,
            "notes": record.notes,
            "purchase_date": record.purchase_date,
            "bottled_date": record.bottled_date,
            "best_before": record.best_before,
            "raw_best_before": record.raw_best_before,
            "purchase_location": record.purchase_location,
            "purchase_price": record.purchase_price,
            "created_at_source": record.created_at_source,
            "source_payload_json": metadata_json(record.source_metadata),
            "photo_url": record.photo_url,
            "best_before_suspicious": record.suspicious_best_before,
            "match_status": match_status,
            "matched_checkin_beer_id": matched.id if matched else None,
        }
        existing = existing_items.get(record.source_item_id)
        if existing is None:
            session.add(InventoryItem(imported_at=datetime.now(UTC), **values))
            inserted += 1
        else:
            changed = any(getattr(existing, key) != value for key, value in values.items())
            if changed:
                for key, value in values.items():
                    setattr(existing, key, value)
                existing.imported_at = datetime.now(UTC)
                updated += 1
            else:
                unchanged += 1

    removed = 0
    for source_item_id, existing in existing_items.items():
        if source_item_id not in seen:
            session.delete(existing)
            removed += 1
    return inserted, updated, unchanged, removed


def reconcile_inventory_matches(session: Session, user_id: int) -> int:
    source = session.scalar(
        select(InventorySource).where(
            InventorySource.user_id == user_id,
            InventorySource.source_system == SOURCE_SYSTEM,
            InventorySource.name == SOURCE_NAME,
            InventorySource.is_authoritative.is_(True),
        )
    )
    if source is None:
        return 0
    changed = 0
    items = session.scalars(
        select(InventoryItem).where(InventoryItem.inventory_source_id == source.id)
    ).all()
    for item in items:
        beer = session.get(Beer, item.beer_id)
        status, matched = match_inventory_beer(session, beer, user_id)
        matched_id = matched.id if matched else None
        if item.match_status != status or item.matched_checkin_beer_id != matched_id:
            item.match_status = status
            item.matched_checkin_beer_id = matched_id
            changed += 1
    return changed
