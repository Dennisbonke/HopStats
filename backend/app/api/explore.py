from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..api.auth import get_current_user
from ..db import get_db
from ..models import User
from ..schemas.explore import (
    ExploreBeerListResponse,
    ExploreBeerQuery,
    ExploreBoundsResponse,
    ExploreOptionsResponse,
    PositiveId,
)
from ..services.explore import ExploreService

router = APIRouter(prefix="/api/v1/explore", tags=["explore"])


@router.get("/beers", response_model=ExploreBeerListResponse)
def explore_beers(
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    filters: Annotated[ExploreBeerQuery, Query()],
) -> ExploreBeerListResponse:
    return ExploreService(session).beers(user.id, **filters.model_dump())


@router.get("/filter-options/{category}", response_model=ExploreOptionsResponse)
def filter_options(
    category: Literal["breweries", "styles"],
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    search: Annotated[str, Query(max_length=200)] = "",
    selected_id: Annotated[list[PositiveId] | None, Query(max_length=100)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
) -> ExploreOptionsResponse:
    return ExploreService(session).options(
        user.id, category, search=search, selected_ids=selected_id, offset=offset, limit=limit
    )


@router.get("/filter-bounds", response_model=ExploreBoundsResponse)
def filter_bounds(
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ExploreBoundsResponse:
    return ExploreService(session).bounds(user.id)
