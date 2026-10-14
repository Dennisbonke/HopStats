from collections.abc import Sequence
from datetime import UTC, date
from typing import BinaryIO

from ..schemas.imports import (
    BeerRecord,
    BreweryRecord,
    NormalizedInventoryItem,
    ParsedImport,
    StyleRecord,
)
from .base import ImportValidationError
from .common import (
    bounded_metadata,
    decimal_value,
    iso_date,
    quantity,
    read_csv,
    required_headers,
    required_value,
    value,
)

KIND = "untappd_stash_csv"
REQUIRED_HEADERS = {"item_id", "beer_name", "brewery_name", "quantity"}
KNOWN_HEADERS = {
    "item_id",
    "beer_name",
    "brewery_name",
    "beer_type",
    "beer_abv",
    "beer_ibu",
    "venue_name",
    "venue_city",
    "venue_state",
    "venue_country",
    "venue_lat",
    "venue_lng",
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
}
METADATA_EXCLUDED = set(KNOWN_HEADERS)


class UntappdStashCsvImporter:
    kind = KIND

    def detect(self, headers: Sequence[str]) -> bool:
        return REQUIRED_HEADERS.issubset(headers) and "checkin_id" not in headers

    def parse(self, stream: BinaryIO) -> ParsedImport:
        headers, rows, issues = read_csv(stream)
        required_headers(headers, REQUIRED_HEADERS)
        if issues:
            raise ImportValidationError("CSV contains malformed rows", issues)
        records: list[NormalizedInventoryItem] = []
        seen: set[str] = set()
        for row_number, row in enumerate(rows, start=2):
            source_item_id = required_value(row, "item_id", row_number)
            if source_item_id in seen:
                raise ImportValidationError(f"row {row_number}: duplicate item_id {source_item_id}")
            seen.add(source_item_id)
            beer_name = required_value(row, "beer_name", row_number)
            brewery_name = value(row, "brewery_name") or "Unknown brewery"
            best_raw = value(row, "best_by_date_iso") or value(row, "best_by_date")
            best_before = _best_before(row, row_number)
            created_at = _source_timestamp(row, row_number)
            records.append(
                NormalizedInventoryItem(
                    source_item_id=source_item_id,
                    beer=BeerRecord(
                        source_system="untappd_stash",
                        external_id=None,
                        name=beer_name,
                        brewery=BreweryRecord("untappd_stash", None, brewery_name),
                        style=(
                            StyleRecord(value(row, "beer_type"))
                            if value(row, "beer_type")
                            else None
                        ),
                        abv=decimal_value(row, "beer_abv", row_number),
                        ibu=decimal_value(row, "beer_ibu", row_number),
                        photo_url=value(row, "photo"),
                    ),
                    quantity=quantity(row, "quantity", row_number),
                    container=value(row, "container"),
                    notes=value(row, "notes"),
                    purchase_date=iso_date(row, "purchase_date", row_number),
                    bottled_date=iso_date(row, "bottled_date", row_number),
                    best_before=best_before,
                    raw_best_before=best_raw,
                    suspicious_best_before=best_before == date(2100, 1, 1),
                    purchase_location=value(row, "purchase_location"),
                    purchase_price=decimal_value(row, "purchase_price", row_number),
                    created_at_source=created_at,
                    photo_url=value(row, "photo"),
                    source_metadata=bounded_metadata(row, KNOWN_HEADERS),
                )
            )
        return ParsedImport(KIND, tuple(records), tuple(headers))


def _best_before(row: dict[str, str], row_number: int):
    raw = value(row, "best_by_date_iso") or value(row, "best_by_date")
    if raw in {None, "0000-00-00", "0000-00-00 00:00:00"}:
        return None
    return iso_date({"best_before": raw}, "best_before", row_number)


def _source_timestamp(row: dict[str, str], row_number: int):
    if not value(row, "created_at"):
        return None
    # Stash creation timestamps are source metadata. Date-only values are not
    # converted through an arbitrary timezone; timestamps with an offset are
    # normalized to UTC and naive timestamps remain naive.
    from datetime import datetime

    raw = required_value(row, "created_at", row_number).replace("Z", "+00:00")
    try:
        timestamp = datetime.fromisoformat(raw)
    except ValueError as exc:
        raise ImportValidationError(
            f"row {row_number}: created_at must be an ISO timestamp",
        ) from exc
    return timestamp.astimezone(UTC).replace(tzinfo=None) if timestamp.tzinfo else timestamp
