from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..api.auth import get_current_user
from ..db import get_db
from ..models import User
from ..schemas.locations import LocationDetailResponse, LocationListResponse
from ..services.locations import LocationService

router = APIRouter(prefix="/api/v1/locations", tags=["locations"])


@router.get("", response_model=LocationListResponse)
def location_list(
    session: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(get_current_user)]
):
    return LocationService(session).tree(user.id)


@router.get("/{location_id}", response_model=LocationDetailResponse)
def location_detail(
    location_id: int,
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    location = LocationService(session).detail(user.id, location_id)
    if location is None:
        raise HTTPException(status_code=404, detail="location not found")
    return location
