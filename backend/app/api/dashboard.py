from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..api.auth import get_current_user
from ..db import get_db
from ..models import User
from ..schemas.dashboard import DashboardResponse
from ..services.dashboard import DashboardService

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardResponse)
def dashboard(
    session: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(get_current_user)]
) -> DashboardResponse:
    return DashboardService(session).get_dashboard(user.id)
