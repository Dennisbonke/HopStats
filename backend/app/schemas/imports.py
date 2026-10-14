from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any


@dataclass(frozen=True)
class BreweryRecord:
    source_system: str
    external_id: str | None
    name: str
    country: str | None = None
    city: str | None = None
    state: str | None = None


@dataclass(frozen=True)
class StyleRecord:
    name: str


@dataclass(frozen=True)
class BeerRecord:
    source_system: str | None
    external_id: str | None
    name: str
    brewery: BreweryRecord | None = None
    style: StyleRecord | None = None
    abv: Decimal | None = None
    ibu: Decimal | None = None
    photo_url: str | None = None


@dataclass(frozen=True)
class VenueRecord:
    source_system: str
    external_id: str | None
    name: str
    city: str | None = None
    state: str | None = None
    country: str | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None


@dataclass(frozen=True)
class NormalizedCheckin:
    external_id: str
    beer: BeerRecord
    venue: VenueRecord | None
    occurred_at_utc: datetime
    original_offset_minutes: int | None
    rating: Decimal | None
    comment: str | None
    serving_type: str | None
    purchase_venue: str | None
    photo_url: str | None
    source_metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class NormalizedInventoryItem:
    source_item_id: str
    beer: BeerRecord
    quantity: int
    container: str | None
    notes: str | None
    purchase_date: date | None
    bottled_date: date | None
    best_before: date | None
    raw_best_before: str | None
    suspicious_best_before: bool
    purchase_location: str | None
    purchase_price: Decimal | None
    created_at_source: datetime | None
    photo_url: str | None
    source_metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ValidationIssue:
    row_number: int
    field: str | None
    reason: str


@dataclass(frozen=True)
class ParsedImport:
    kind: str
    records: tuple[NormalizedCheckin | NormalizedInventoryItem, ...]
    headers: tuple[str, ...]
    issues: tuple[ValidationIssue, ...] = ()
