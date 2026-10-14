from datetime import UTC, datetime
from decimal import Decimal

from pydantic import BaseModel, field_serializer


class MatchCoverageResponse(BaseModel):
    external_id: int
    exact: int
    ambiguous: int
    unmatched: int


class DashboardFreshnessResponse(BaseModel):
    checkins_last_imported_at: datetime | None
    inventory_last_imported_at: datetime | None
    checkins_source_exported_at: datetime | None = None
    inventory_source_exported_at: datetime | None = None

    @field_serializer(
        "checkins_last_imported_at",
        "inventory_last_imported_at",
        "checkins_source_exported_at",
        "inventory_source_exported_at",
        when_used="json",
    )
    def serialize_utc_timestamp(self, value: datetime | None) -> str | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        else:
            value = value.astimezone(UTC)
        return value.isoformat()


class DashboardResponse(BaseModel):
    total_checkins: int
    unique_beers: int
    unique_breweries: int
    unique_styles: int
    average_personal_rating: Decimal | None
    rated_checkins: int
    inventory_units: int
    unique_inventory_beers: int
    not_confirmed_checked_in: int
    match_coverage: MatchCoverageResponse
    freshness: DashboardFreshnessResponse

    @field_serializer("average_personal_rating", when_used="json")
    def serialize_rating(self, value: Decimal | None) -> float | None:
        return float(value) if value is not None else None
