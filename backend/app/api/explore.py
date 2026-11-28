from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from ..api.auth import get_current_user
from ..db import get_db
from ..models import User
from ..schemas.explore import (
    ExploreBeerDetailResponse,
    ExploreBeerListResponse,
    ExploreBeerQuery,
    ExploreBoundsResponse,
    ExploreBreweryDetailResponse,
    ExploreBreweryListResponse,
    ExploreBreweryQuery,
    ExploreCheckinListResponse,
    ExploreCheckinQuery,
    ExploreCountryOptions,
    ExploreOptionsResponse,
    ExploreStyleDetailResponse,
    ExploreStyleListResponse,
    ExploreStyleQuery,
    PositiveId,
)
from ..services.breweries import BreweryExplorer
from ..services.explore import ExploreService
from ..services.styles import StyleExplorer

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
    offset: Annotated[int, Query(ge=0, le=2147483647)] = 0,
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


@router.get("/beers/{beer_id}", response_model=ExploreBeerDetailResponse)
def beer_detail(
    beer_id: Annotated[int, Path(gt=0, le=9223372036854775807)],
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ExploreBeerDetailResponse:
    return ExploreService(session).detail(user.id, beer_id)


@router.get("/beers/{beer_id}/checkins", response_model=ExploreCheckinListResponse)
def beer_checkins(
    beer_id: Annotated[int, Path(gt=0, le=9223372036854775807)],
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    filters: Annotated[ExploreCheckinQuery, Query()],
) -> ExploreCheckinListResponse:
    return ExploreService(session).checkins(user.id, beer_id, **filters.model_dump())


@router.get("/breweries", response_model=ExploreBreweryListResponse)
def breweries(
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    filters: Annotated[ExploreBreweryQuery, Query()],
):
    return BreweryExplorer(session).catalogue(user.id, **filters.model_dump())


@router.get("/brewery-countries", response_model=ExploreCountryOptions)
def brewery_countries(
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    search: Annotated[str, Query(max_length=200)] = "",
    offset: Annotated[int, Query(ge=0, le=2147483647)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
):
    return BreweryExplorer(session).countries(user.id, search, offset, limit)


@router.get("/breweries/{brewery_id}", response_model=ExploreBreweryDetailResponse)
def brewery_detail(
    brewery_id: Annotated[int, Path(gt=0, le=9223372036854775807)],
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    return BreweryExplorer(session).detail(user.id, brewery_id)


@router.get("/styles", response_model=ExploreStyleListResponse)
def styles(
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    filters: Annotated[ExploreStyleQuery, Query()],
):
    return StyleExplorer(session).catalogue(user.id, **filters.model_dump())


@router.get("/style-bounds", response_model=ExploreBoundsResponse)
def style_bounds(
    session: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(get_current_user)]
):
    return StyleExplorer(session).bounds(user.id)


@router.get("/styles/{style_id}", response_model=ExploreStyleDetailResponse)
def style_detail(
    style_id: Annotated[int, Path(gt=0, le=9223372036854775807)],
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    return StyleExplorer(session).detail(user.id, style_id)
