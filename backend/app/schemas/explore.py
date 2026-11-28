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
    abv_min: Decimal | None = Field(
        default=None, ge=0, multiple_of=Decimal("0.01"), allow_inf_nan=False
    )
    abv_max: Decimal | None = Field(
        default=None, ge=0, multiple_of=Decimal("0.01"), allow_inf_nan=False
    )
    rating_min: Decimal | None = Field(
        default=None, ge=0, le=5, multiple_of=Decimal("0.01"), allow_inf_nan=False
    )
    rating_max: Decimal | None = Field(
        default=None, ge=0, le=5, multiple_of=Decimal("0.01"), allow_inf_nan=False
    )
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


class ExploreLocation(ExploreEntity):
    city: str | None
    state: str | None
    country: str | None


class ExploreRatingPoint(BaseModel):
    id: int
    occurred_at_utc: datetime
    rating: float

    @field_serializer("occurred_at_utc", when_used="json")
    def serialize_timestamp(self, value: datetime) -> str:
        return (
            value.replace(tzinfo=UTC).isoformat()
            if value.tzinfo is None
            else value.astimezone(UTC).isoformat()
        )


class ExploreBeerDetailResponse(ExploreBeerResponse):
    brewery: ExploreLocation | None
    highest_rating: float | None
    lowest_rating: float | None
    rating_history: list[ExploreRatingPoint]
    untappd_url: str | None


class ExploreCheckinResponse(BaseModel):
    id: int
    occurred_at_utc: datetime
    rating: float | None
    comment: str | None
    serving_type: str | None
    purchase_venue: str | None
    photo_url: str | None
    venue: ExploreLocation | None
    untappd_url: str | None

    @field_serializer("occurred_at_utc", when_used="json")
    def serialize_timestamp(self, value: datetime) -> str:
        return (
            value.replace(tzinfo=UTC).isoformat()
            if value.tzinfo is None
            else value.astimezone(UTC).isoformat()
        )


class ExploreCheckinListResponse(BaseModel):
    items: list[ExploreCheckinResponse]
    page: int
    page_size: int
    total: int
    total_pages: int


class ExploreCheckinQuery(BaseModel):
    page: int = Field(default=1, ge=1, le=2147483647)
    page_size: int = Field(default=25, ge=1, le=100)
    sort: Literal["newest", "oldest"] = "newest"


class ExploreBreweryQuery(BaseModel):
    search: str | None = Field(default=None, max_length=200)
    page: int = Field(default=1, ge=1, le=2147483647)
    page_size: int = Field(default=25, ge=1, le=100)
    rating_min: Decimal | None = Field(
        default=None, ge=0, le=5, multiple_of=Decimal("0.01"), allow_inf_nan=False
    )
    rating_max: Decimal | None = Field(
        default=None, ge=0, le=5, multiple_of=Decimal("0.01"), allow_inf_nan=False
    )
    first_tried_from: date | None = None
    first_tried_to: date | None = None
    last_tried_from: date | None = None
    last_tried_to: date | None = None

    @model_validator(mode="after")
    def ordered_ranges(self):
        for low, high in [
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

    sort: Literal[
        "name_asc",
        "name_desc",
        "location_asc",
        "location_desc",
        "unique_beers_asc",
        "unique_beers_desc",
        "checkins_asc",
        "checkins_desc",
        "rating_asc",
        "rating_desc",
        "first_tried_asc",
        "first_tried_desc",
        "last_tried_asc",
        "last_tried_desc",
    ] = "unique_beers_desc"
    country: list[Annotated[str, Field(max_length=200)]] = Field(
        default_factory=list, max_length=100
    )
    unknown_country: bool = False
    min_unique_beers: int | None = Field(default=None, ge=1, le=2147483647)
    min_checkins: int | None = Field(default=None, ge=1, le=2147483647)


class ExploreBreweryResponse(ExploreLocation):
    unique_beer_count: int
    checkin_count: int
    rated_checkin_count: int
    personal_average_rating: float | None
    first_checked_in_at: datetime
    last_checked_in_at: datetime

    @field_serializer("first_checked_in_at", "last_checked_in_at", when_used="json")
    def serialize_timestamp(self, value: datetime) -> str:
        return (
            value.replace(tzinfo=UTC).isoformat()
            if value.tzinfo is None
            else value.astimezone(UTC).isoformat()
        )


class ExploreBreweryListResponse(BaseModel):
    items: list[ExploreBreweryResponse]
    page: int
    page_size: int
    total: int
    total_pages: int


class ExploreCountryOptions(BaseModel):
    items: list[str]
    unknown_available: bool
    has_more: bool


class ExploreRatingBucket(BaseModel):
    lower: float
    upper: float
    count: int


class ExploreStyleCount(ExploreEntity):
    unique_beer_count: int


class ExploreBreweryDetailResponse(ExploreBreweryResponse):
    style_count: int
    highest_rating: float | None
    lowest_rating: float | None
    untappd_url: str | None
    rating_distribution: list[ExploreRatingBucket]
    most_explored_styles: list[ExploreStyleCount]
    highest_rated_beers: list[ExploreBeerResponse]


class ExploreStyleQuery(BaseModel):
    search: str | None = Field(default=None, max_length=200)
    page: int = Field(default=1, ge=1, le=2147483647)
    page_size: int = Field(default=25, ge=1, le=100)
    rating_min: Decimal | None = Field(
        default=None, ge=0, le=5, multiple_of=Decimal("0.01"), allow_inf_nan=False
    )
    rating_max: Decimal | None = Field(
        default=None, ge=0, le=5, multiple_of=Decimal("0.01"), allow_inf_nan=False
    )
    first_tried_from: date | None = None
    first_tried_to: date | None = None
    last_tried_from: date | None = None
    last_tried_to: date | None = None

    @model_validator(mode="after")
    def ordered_ranges(self):
        for low, high in [
            (self.rating_min, self.rating_max),
            (self.abv_min, self.abv_max),
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

    sort: Literal[
        "name_asc",
        "name_desc",
        "breweries_asc",
        "breweries_desc",
        "unique_beers_asc",
        "unique_beers_desc",
        "checkins_asc",
        "checkins_desc",
        "rating_asc",
        "rating_desc",
        "first_tried_asc",
        "first_tried_desc",
        "last_tried_asc",
        "last_tried_desc",
    ] = "unique_beers_desc"
    min_unique_beers: int | None = Field(default=None, ge=1, le=2147483647)
    min_checkins: int | None = Field(default=None, ge=1, le=2147483647)

    min_breweries: int | None = Field(default=None, ge=0, le=2147483647)
    abv_min: Decimal | None = Field(
        default=None, ge=0, multiple_of=Decimal("0.01"), allow_inf_nan=False
    )
    abv_max: Decimal | None = Field(
        default=None, ge=0, multiple_of=Decimal("0.01"), allow_inf_nan=False
    )


class ExploreStyleResponse(BaseModel):
    id: int
    name: str
    unique_beer_count: int
    checkin_count: int
    rated_checkin_count: int
    personal_average_rating: float | None
    brewery_count: int
    average_abv: float | None
    known_abv_beer_count: int
    first_checked_in_at: datetime
    last_checked_in_at: datetime

    @field_serializer("first_checked_in_at", "last_checked_in_at", when_used="json")
    def serialize_timestamp(self, value: datetime) -> str:
        return (
            value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
        ).isoformat()


class ExploreStyleListResponse(BaseModel):
    items: list[ExploreStyleResponse]
    page: int
    page_size: int
    total: int
    total_pages: int


class ExploreStyleDetailResponse(ExploreStyleResponse):
    highest_rating: float | None
    lowest_rating: float | None
    rating_distribution: list[ExploreRatingBucket]
    most_explored_breweries: list[ExploreStyleCount]
    highest_rated_beers: list[ExploreBeerResponse]
