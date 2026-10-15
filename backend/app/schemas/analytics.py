from datetime import date
from typing import Literal

from pydantic import BaseModel


class AnalyticsBucket(BaseModel):
    key: str
    label: str
    start: date
    end: date
    new_discoveries: int
    repeat_checkins: int
    total_checkins: int
    cumulative_checkins: int
    cumulative_discoveries: int


class AnalyticsSummary(BaseModel):
    total_checkins: int
    new_discoveries: int
    repeat_checkins: int
    distinct_beers: int


class CheckinAnalyticsResponse(BaseModel):
    start: date | None
    end: date | None
    timezone: str
    granularity: Literal["day", "week", "month", "year"]
    summary: AnalyticsSummary
    cumulative_baseline_checkins: int
    cumulative_baseline_discoveries: int
    buckets: list[AnalyticsBucket]
