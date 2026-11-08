from datetime import UTC, datetime
from decimal import Decimal

from pydantic import BaseModel, field_serializer


class ExploreEntity(BaseModel):
    id: int
    name: str


class ExploreBeerResponse(BaseModel):
    id: int
    name: str
    brewery: ExploreEntity | None
    style: ExploreEntity | None
    abv: Decimal | None
    ibu: Decimal | None
    photo_url: str | None
    checkin_count: int
    rated_checkin_count: int
    personal_average_rating: Decimal | None
    first_checked_in_at: datetime
    last_checked_in_at: datetime

    @field_serializer("abv", "ibu", "personal_average_rating", when_used="json")
    def serialize_decimal(self, value: Decimal | None) -> float | None:
        return float(value) if value is not None else None

    @field_serializer("first_checked_in_at", "last_checked_in_at", when_used="json")
    def serialize_timestamp(self, value: datetime) -> str:
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        else:
            value = value.astimezone(UTC)
        return value.isoformat()


class ExploreBeerListResponse(BaseModel):
    items: list[ExploreBeerResponse]
    page: int
    page_size: int
    total: int
    total_pages: int
