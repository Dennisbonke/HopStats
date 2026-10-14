from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..api.auth import get_current_user
from ..db import get_db
from ..models import User
from ..schemas.inventory import InventoryItemResponse, InventoryListResponse, InventoryStyleResponse
from ..services.inventory import InventoryFilterError, InventoryLocationNotFound, InventoryService

router = APIRouter(prefix="/api/v1/inventory", tags=["inventory"])


def service_error(error: ValueError) -> HTTPException:
    if isinstance(error, InventoryLocationNotFound):
        return HTTPException(status_code=404, detail=str(error))
    return HTTPException(status_code=422, detail=str(error))


@router.get("", response_model=InventoryListResponse)
def inventory_list(
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
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
            user.id,
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
def inventory_styles(
    session: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(get_current_user)]
):
    return InventoryService(session).styles(user.id)


@router.get("/{item_id}", response_model=InventoryItemResponse)
def inventory_detail(
    item_id: int,
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    item = InventoryService(session).get_inventory(user.id, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="inventory item not found")
    return item
