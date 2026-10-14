from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, field_serializer


class LocationPathResponse(BaseModel):
    id: int
    name: str
    path: str


class InventoryItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_item_id: str
    source_system: str
    source_name: str
    beer_id: int
    beer_name: str
    brewery_name: str | None
    style_id: int | None
    style_name: str | None
    abv: Decimal | None
    ibu: Decimal | None
    photo_url: str | None
    quantity: int
    container: str | None
    notes: str | None
    purchase_date: date | None
    bottled_date: date | None
    best_before: date | None
    raw_best_before: str | None
    best_before_suspicious: bool
    purchase_location: str | None
    purchase_price: Decimal | None
    created_at_source: datetime | None
    imported_at: datetime
    location: LocationPathResponse | None
    location_resolution_status: str
    location_resolution_source: str | None
    location_resolution_detail: str | None
    match_status: str
    matched_checkin_beer_id: int | None
    source_metadata: dict[str, Any] | None = None

    @field_serializer("abv", "ibu", "purchase_price", when_used="json")
    def serialize_decimal(self, value: Decimal | None) -> float | None:
        return float(value) if value is not None else None

    @field_serializer("created_at_source", "imported_at", when_used="json")
    def serialize_timestamp(self, value: datetime | None) -> str | None:
        return value.isoformat() if value is not None else None


class InventoryListResponse(BaseModel):
    items: list[InventoryItemResponse]
    page: int
    page_size: int
    total: int
    total_pages: int


class InventoryStyleResponse(BaseModel):
    id: int
    name: str
