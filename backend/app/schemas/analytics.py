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


class DrinkingTrendBucket(BaseModel):
    total: int
    discoveries: int
    repeats: int


class DrinkingTrendDay(DrinkingTrendBucket):
    date: date


class DrinkingTrendWeekday(DrinkingTrendBucket):
    weekday: int
    days_in_period: int


class DrinkingTrendHour(DrinkingTrendBucket):
    hour: int


class DrinkingTrendWeekdayHour(DrinkingTrendBucket):
    weekday: int
    hour: int


class DrinkingTrendsResponse(BaseModel):
    start: date
    end: date
    timezone: str
    daily: list[DrinkingTrendDay]
    weekday: list[DrinkingTrendWeekday]
    hourly: list[DrinkingTrendHour]
    weekday_hour: list[DrinkingTrendWeekdayHour]
