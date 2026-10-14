from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import User
from ..schemas.locations import LocationDetailResponse, LocationListResponse
from ..services.locations import LocationService

router = APIRouter(prefix="/api/v1/locations", tags=["locations"])


def local_user(session: Session) -> int:
    user_id = session.scalar(select(User.id).where(User.username == "local"))
    if user_id is None:
        raise HTTPException(status_code=503, detail="local user is not initialized")
    return user_id


@router.get("", response_model=LocationListResponse)
def location_list(session: Annotated[Session, Depends(get_db)]):
    return LocationService(session).tree(local_user(session))


@router.get("/{location_id}", response_model=LocationDetailResponse)
def location_detail(location_id: int, session: Annotated[Session, Depends(get_db)]):
    location = LocationService(session).detail(local_user(session), location_id)
    if location is None:
        raise HTTPException(status_code=404, detail="location not found")
    return location
