from datetime import date, datetime
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, model_validator

Metric = Literal["unique_beers", "checkins", "discoveries"]
GoalType = Literal["absolute", "calendar_year", "incremental"]


class MilestoneWrite(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    metric: Metric
    goal_type: GoalType
    target: int = Field(gt=0)
    calendar_year: int | None = Field(default=None, ge=1, le=9999)
    start_date: date | None = None
    deadline_date: date | None = None
    timezone: str = "Europe/Amsterdam"

    @model_validator(mode="after")
    def dates_match_goal(self):
        required = {
            "absolute": (False, False),
            "calendar_year": (True, False),
            "incremental": (False, True),
        }[self.goal_type]
        if (self.calendar_year is not None, self.start_date is not None) != required:
            raise ValueError("calendar_year and start_date must match goal_type")
        if self.goal_type == "calendar_year" and not 1 <= self.calendar_year <= 9999:
            raise ValueError("calendar_year is invalid")
        if self.deadline_date and self.start_date and self.deadline_date < self.start_date:
            raise ValueError("deadline_date must not be before start_date")
        if (
            self.deadline_date
            and self.calendar_year
            and self.deadline_date < date(self.calendar_year, 1, 1)
        ):
            raise ValueError("deadline_date must not be before the calendar year")
        try:
            ZoneInfo(self.timezone)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("timezone must be a valid IANA timezone") from None
        return self


class MilestonePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=150)
    metric: Metric | None = None
    goal_type: GoalType | None = None
    target: int | None = Field(default=None, gt=0)
    calendar_year: int | None = Field(default=None, ge=1, le=9999)
    start_date: date | None = None
    deadline_date: date | None = None
    timezone: str | None = None
    archived: bool | None = None


class MilestoneResponse(BaseModel):
    id: int
    name: str
    metric: str
    goal_type: str
    target: int
    calendar_year: int | None
    start_date: date | None
    deadline_date: date | None
    timezone: str
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
    current: int
    remaining: int
    progress_percent: float
    status: str
    deadline_outcome: str | None
    completed_at: datetime | None
    completed_before_deadline: bool | None
    required_per_day: float | None
    required_per_week: float | None
    elapsed_per_day: float | None
    elapsed_per_week: float | None
    trajectory_difference: float | None


class MilestoneListResponse(BaseModel):
    milestones: list[MilestoneResponse]


class MilestoneSummaryResponse(BaseModel):
    active_count: int
    completed_count: int
    overdue_count: int
    milestones: list["MilestoneSummaryItem"]


class MilestoneSummaryItem(BaseModel):
    id: int
    name: str
    metric: str
    goal_type: str
    target: int
    current: int
    remaining: int
    progress_percent: float
    status: str
    deadline_date: date | None
    deadline_outcome: str | None
    completed_at: datetime | None
