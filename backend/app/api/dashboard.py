from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import User
from ..schemas.dashboard import DashboardResponse
from ..services.dashboard import DashboardService

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardResponse)
def dashboard(session: Annotated[Session, Depends(get_db)]) -> DashboardResponse:
    user_id = session.scalar(select(User.id).where(User.username == "local"))
    if user_id is None:
        return DashboardService(session).get_dashboard(-1)
    return DashboardService(session).get_dashboard(user_id)
