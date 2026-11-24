from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_serializer, model_validator


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


ExploreBeerSort = Literal[
    "name_asc",
    "name_desc",
    "brewery_asc",
    "brewery_desc",
    "style_asc",
    "style_desc",
    "abv_asc",
    "abv_desc",
    "rating_asc",
    "rating_desc",
    "first_tried_asc",
    "first_tried_desc",
    "last_tried_asc",
    "last_tried_desc",
    "checkins_asc",
    "checkins_desc",
]

PositiveId = Annotated[int, Field(gt=0, le=9223372036854775807)]


class ExploreBeerQuery(BaseModel):
    search: str | None = Field(default=None, max_length=200)
    sort: ExploreBeerSort = "last_tried_desc"
    page: int = Field(default=1, ge=1, le=2147483647)
    page_size: int = Field(default=25, ge=1, le=100)
    brewery_id: list[PositiveId] = Field(default_factory=list, max_length=100)
    style_id: list[PositiveId] = Field(default_factory=list, max_length=100)
    abv_min: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    abv_max: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    rating_min: float | None = Field(default=None, ge=0, le=5, allow_inf_nan=False)
    rating_max: float | None = Field(default=None, ge=0, le=5, allow_inf_nan=False)
    first_tried_from: date | None = None
    first_tried_to: date | None = None
    last_tried_from: date | None = None
    last_tried_to: date | None = None

    @model_validator(mode="after")
    def ordered_ranges(self):
        for low, high in [
            (self.abv_min, self.abv_max),
            (self.rating_min, self.rating_max),
            (self.first_tried_from, self.first_tried_to),
            (self.last_tried_from, self.last_tried_to),
        ]:
            if low is not None and high is not None and low > high:
                raise ValueError("Range minimum must not exceed maximum")
        for day in [
            self.first_tried_from,
            self.first_tried_to,
            self.last_tried_from,
            self.last_tried_to,
        ]:
            if day is not None and (day <= date(1, 12, 31) or day == date.max):
                raise ValueError("Dates must be between 0002-01-01 and 9999-12-30")
        return self


class ExploreOptionsResponse(BaseModel):
    items: list[ExploreEntity]
    has_more: bool


class ExploreBoundsResponse(BaseModel):
    abv_max: float
