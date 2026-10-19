from typing import Literal

from pydantic import BaseModel

InsightType = Literal[
    "milestone_completed",
    "milestone_near",
    "milestone_ahead",
    "milestone_below",
    "milestone_deadline_passed",
    "discovery_trend",
    "checkin_trend",
]
InsightCategory = Literal["milestone", "activity"]


class Insight(BaseModel):
    id: str
    type: InsightType
    category: InsightCategory
    priority: int
    title: str
    description: str
    href: str | None
    data: dict[str, int | float | str]


class InsightsResponse(BaseModel):
    insights: list[Insight]
