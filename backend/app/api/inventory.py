from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import User
from ..schemas.inventory import InventoryItemResponse, InventoryListResponse, InventoryStyleResponse
from ..services.inventory import InventoryFilterError, InventoryLocationNotFound, InventoryService

router = APIRouter(prefix="/api/v1/inventory", tags=["inventory"])


def local_user(session: Session) -> int:
    user_id = session.scalar(select(User.id).where(User.username == "local"))
    if user_id is None:
        raise HTTPException(status_code=503, detail="local user is not initialized")
    return user_id


def service_error(error: ValueError) -> HTTPException:
    if isinstance(error, InventoryLocationNotFound):
        return HTTPException(status_code=404, detail=str(error))
    return HTTPException(status_code=422, detail=str(error))


@router.get("", response_model=InventoryListResponse)
def inventory_list(
    session: Annotated[Session, Depends(get_db)],
    search: str | None = None,
    location_id: int | None = None,
    include_descendants: bool = True,
    unresolved: bool = False,
    match_status: str | None = None,
    style_id: int | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
    sort: str = "beer_name_asc",
):
    try:
        return InventoryService(session).list_inventory(
            local_user(session),
            search=search,
            location_id=location_id,
            include_descendants=include_descendants,
            unresolved=unresolved,
            match_status=match_status,
            style_id=style_id,
            page=page,
            page_size=page_size,
            sort=sort,
        )
    except (InventoryFilterError, InventoryLocationNotFound) as exc:
        raise service_error(exc) from exc


@router.get("/styles", response_model=list[InventoryStyleResponse])
def inventory_styles(session: Annotated[Session, Depends(get_db)]):
    return InventoryService(session).styles(local_user(session))


@router.get("/{item_id}", response_model=InventoryItemResponse)
def inventory_detail(item_id: int, session: Annotated[Session, Depends(get_db)]):
    item = InventoryService(session).get_inventory(local_user(session), item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="inventory item not found")
    return item
