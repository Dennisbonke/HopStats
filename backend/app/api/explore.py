from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..api.auth import get_current_user
from ..db import get_db
from ..models import User
from ..schemas.explore import ExploreBeerListResponse
from ..services.explore import ExploreService

router = APIRouter(prefix="/api/v1/explore", tags=["explore"])


@router.get("/beers", response_model=ExploreBeerListResponse)
def explore_beers(
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    search: Annotated[str | None, Query(max_length=200)] = None,
    sort: Literal[
        "name_asc",
        "name_desc",
        "last_tried_desc",
        "last_tried_asc",
        "checkins_desc",
        "checkins_asc",
    ] = "last_tried_desc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> ExploreBeerListResponse:
    return ExploreService(session).beers(
        user.id,
        search=search,
        sort=sort,
        page=page,
        page_size=page_size,
    )
