from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from ..api.auth import get_current_user, require_csrf
from ..db import get_db
from ..models import User
from ..schemas.milestones import (
    MilestoneListResponse,
    MilestonePatch,
    MilestoneResponse,
    MilestoneSummaryResponse,
    MilestoneWrite,
)
from ..services.milestones import MilestoneNotFound, MilestoneService

router = APIRouter(prefix="/api/v1/milestones", tags=["milestones"])


@router.get("", response_model=MilestoneListResponse)
def list_milestones(
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    archived: bool = False,
):
    return {"milestones": MilestoneService(session).list(user.id, archived)}


@router.get("/summary", response_model=MilestoneSummaryResponse)
def milestone_summary(
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    return MilestoneService(session).summary(user.id)


@router.post(
    "", response_model=MilestoneResponse, status_code=201, dependencies=[Depends(require_csrf)]
)
def create_milestone(
    payload: MilestoneWrite,
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    return MilestoneService(session).create(user.id, payload)


@router.get("/{milestone_id}", response_model=MilestoneResponse)
def get_milestone(
    milestone_id: int,
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    result = MilestoneService(session).get(user.id, milestone_id)
    if result is None:
        raise HTTPException(status_code=404, detail="milestone not found")
    return result


@router.patch(
    "/{milestone_id}", response_model=MilestoneResponse, dependencies=[Depends(require_csrf)]
)
def patch_milestone(
    milestone_id: int,
    payload: MilestonePatch,
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    try:
        return MilestoneService(session).update(
            user.id, milestone_id, payload.model_dump(exclude_unset=True)
        )
    except MilestoneNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ValueError, TypeError) as exc:
        session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/{milestone_id}", status_code=204, dependencies=[Depends(require_csrf)])
def delete_milestone(
    milestone_id: int,
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    try:
        MilestoneService(session).delete(user.id, milestone_id)
    except MilestoneNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return Response(status_code=204)
