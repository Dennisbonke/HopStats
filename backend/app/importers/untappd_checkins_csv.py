from collections.abc import Sequence
from typing import BinaryIO

from ..schemas.imports import (
    BeerRecord,
    BreweryRecord,
    NormalizedCheckin,
    ParsedImport,
    StyleRecord,
    ValidationIssue,
    VenueRecord,
)
from .base import ImportValidationError
from .common import (
    bounded_metadata,
    decimal_value,
    ensure_range,
    iso_timestamp,
    read_csv,
    required_headers,
    required_value,
    value,
)

KIND = "untappd_checkins_csv"
REQUIRED_HEADERS = {"checkin_id", "bid", "brewery_id", "beer_name", "brewery_name", "created_at"}
KNOWN_HEADERS = {
    "beer_name",
    "brewery_name",
    "beer_type",
    "beer_abv",
    "beer_ibu",
    "comment",
    "venue_name",
    "venue_city",
    "venue_state",
    "venue_country",
    "venue_lat",
    "venue_lng",
    "venue_id",
    "rating_score",
    "created_at",
    "timezone_offset",
    "checkin_url",
    "beer_url",
    "brewery_url",
    "brewery_country",
    "brewery_city",
    "brewery_state",
    "flavor_profiles",
    "purchase_venue",
    "serving_type",
    "checkin_id",
    "bid",
    "brewery_id",
    "photo_url",
    "global_rating_score",
    "global_weighted_rating_score",
    "tagged_friends",
    "total_toasts",
    "total_comments",
}
METADATA_EXCLUDED = {
    "beer_name",
    "brewery_name",
    "beer_type",
    "beer_abv",
    "beer_ibu",
    "comment",
    "venue_name",
    "venue_city",
    "venue_state",
    "venue_country",
    "venue_lat",
    "venue_lng",
    "venue_id",
    "rating_score",
    "created_at",
    "timezone_offset",
    "purchase_venue",
    "serving_type",
    "checkin_id",
    "bid",
    "brewery_id",
    "photo_url",
}


class UntappdCheckinsCsvImporter:
    kind = KIND

    def detect(self, headers: Sequence[str]) -> bool:
        return REQUIRED_HEADERS.issubset(headers) and "item_id" not in headers

    def parse(self, stream: BinaryIO) -> ParsedImport:
        headers, rows, issues = read_csv(stream)
        required_headers(headers, REQUIRED_HEADERS)
        if issues:
            raise ImportValidationError("CSV contains malformed rows", issues)
        records: list[NormalizedCheckin] = []
        seen: set[str] = set()
        for row_number, row in enumerate(rows, start=2):
            try:
                external_id = required_value(row, "checkin_id", row_number)
                if external_id in seen:
                    raise ImportValidationError(
                        f"row {row_number}: duplicate checkin_id {external_id}",
                        (
                            ValidationIssue(
                                row_number, "checkin_id", "duplicate external identifier"
                            ),
                        ),
                    )
                seen.add(external_id)
                brewery_id = required_value(row, "brewery_id", row_number)
                beer_id = required_value(row, "bid", row_number)
                brewery_name = required_value(row, "brewery_name", row_number)
                beer_name = required_value(row, "beer_name", row_number)
                occurred_at, offset = iso_timestamp(
                    row, "created_at", row_number, "timezone_offset"
                )
                abv = decimal_value(row, "beer_abv", row_number, 5, 2)
                ibu = decimal_value(row, "beer_ibu", row_number, 6, 2)
                rating = ensure_range(
                    decimal_value(row, "rating_score", row_number, 3, 2),
                    "rating_score",
                    row_number,
                    5,
                )
                venue = None
                if value(row, "venue_name") or value(row, "venue_id"):
                    venue = VenueRecord(
                        source_system="untappd",
                        external_id=value(row, "venue_id"),
                        name=value(row, "venue_name") or "Unknown venue",
                        city=value(row, "venue_city"),
                        state=value(row, "venue_state"),
                        country=value(row, "venue_country"),
                        latitude=decimal_value(row, "venue_lat", row_number, 9, 6),
                        longitude=decimal_value(row, "venue_lng", row_number, 9, 6),
                    )
                brewery = BreweryRecord(
                    source_system="untappd",
                    external_id=brewery_id,
                    name=brewery_name,
                    country=value(row, "brewery_country"),
                    city=value(row, "brewery_city"),
                    state=value(row, "brewery_state"),
                )
                records.append(
                    NormalizedCheckin(
                        external_id=external_id,
                        beer=BeerRecord(
                            source_system="untappd",
                            external_id=beer_id,
                            name=beer_name,
                            brewery=brewery,
                            style=StyleRecord(value(row, "beer_type"))
                            if value(row, "beer_type")
                            else None,
                            abv=abv,
                            ibu=ibu,
                            photo_url=value(row, "photo_url"),
                        ),
                        venue=venue,
                        occurred_at_utc=occurred_at,
                        original_offset_minutes=offset,
                        rating=rating,
                        comment=value(row, "comment"),
                        serving_type=value(row, "serving_type"),
                        purchase_venue=value(row, "purchase_venue"),
                        photo_url=value(row, "photo_url"),
                        source_metadata=bounded_metadata(row, METADATA_EXCLUDED),
                    )
                )
            except ImportValidationError:
                raise
            except ValueError as exc:
                raise ImportValidationError(f"row {row_number}: invalid check-in data") from exc
        return ParsedImport(KIND, tuple(records), tuple(headers))
