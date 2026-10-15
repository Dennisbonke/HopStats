from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..api.auth import get_current_user
from ..db import get_db
from ..models import User
from ..schemas.analytics import CheckinAnalyticsResponse
from ..services.analytics import AnalyticsService, AnalyticsValidationError

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


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
