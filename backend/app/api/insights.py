from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..api.auth import get_current_user
from ..db import get_db
from ..models import User
from ..schemas.insights import InsightsResponse
from ..services.insights import InsightsService

router = APIRouter(prefix="/api/v1/insights", tags=["insights"])


@router.get("", response_model=InsightsResponse)
def get_insights(
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> InsightsResponse:
    return InsightsService(session).get(user.id, datetime.now(UTC))
