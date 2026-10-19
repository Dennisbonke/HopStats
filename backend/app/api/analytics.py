from datetime import date, datetime
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..api.auth import get_current_user
from ..db import get_db
from ..models import User
from ..schemas.analytics import CheckinAnalyticsResponse, DrinkingTrendsResponse
from ..services.analytics import AnalyticsService, AnalyticsValidationError

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


@router.get("/drinking-trends", response_model=DrinkingTrendsResponse)
def drinking_trends(
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    start: date | None = None,
    end: date | None = None,
    timezone_name: str = Query(default="Europe/Amsterdam", alias="timezone"),
    include_daily: bool = Query(default=True, alias="daily"),
) -> DrinkingTrendsResponse:
    if (start is None) != (end is None):
        raise HTTPException(status_code=422, detail="start and end must be provided together")
    if start is None:
        try:
            today = datetime.now(ZoneInfo(timezone_name)).date()
        except (ZoneInfoNotFoundError, ValueError):
            raise HTTPException(
                status_code=422, detail="timezone must be a valid IANA timezone"
            ) from None
        start, end = today.replace(month=1, day=1), today
    try:
        return AnalyticsService(session).drinking_trends(
            user.id, start, end, timezone_name, include_daily=include_daily
        )
    except AnalyticsValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/checkins", response_model=CheckinAnalyticsResponse)
def checkin_analytics(
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    start: date | None = None,
    end: date | None = None,
    granularity: Literal["auto", "day", "week", "month", "year"] = Query(default="auto"),
    timezone_name: str = Query(default="Europe/Amsterdam", alias="timezone"),
) -> CheckinAnalyticsResponse:
    try:
        return AnalyticsService(session).checkins(user.id, start, end, granularity, timezone_name)
    except AnalyticsValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
