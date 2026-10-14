from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..api.auth import get_current_user, require_csrf
from ..config import get_settings
from ..db import get_db
from ..models import User
from ..schemas.locations import (
    AliasCreateRequest,
    AliasMutationResponse,
    AliasUpdateRequest,
    LocationCreateRequest,
    LocationDetailResponse,
    LocationListResponse,
    LocationMutationResponse,
    LocationOwnershipTransferRequest,
    LocationUpdateRequest,
    ReconciliationResponse,
)
from ..services.auth import find_user
from ..services.locations import (
    LocationConfigurationError,
    LocationConflictError,
    LocationNotFound,
    LocationService,
    LocationValidationError,
)

router = APIRouter(prefix="/api/v1/locations", tags=["locations"])


def _configuration_active_for_user(session: Session, user_id: int) -> bool:
    """Fail closed when an active private config could reclaim this subtree."""
    settings = get_settings()
    if not settings.location_config:
        return False
    if settings.location_config_user_id is not None:
        return settings.location_config_user_id == user_id
    if settings.location_config_username is not None:
        owner = find_user(session, username=settings.location_config_username)
        return owner is None or owner.id == user_id
    users = session.scalars(select(User).order_by(User.id)).all()
    return len(users) != 1 or users[0].id == user_id


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


def _service_error(exc: ValueError) -> HTTPException:
    if isinstance(exc, LocationNotFound):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, LocationConflictError):
        return HTTPException(status_code=409, detail=str(exc))
    if isinstance(exc, (LocationValidationError, LocationConfigurationError)):
        return HTTPException(status_code=422, detail=str(exc))
    return HTTPException(status_code=422, detail=str(exc))


def _mutation_response(service: LocationService, user_id: int, location_id: int, changed: int):
    detail = service.detail(user_id, location_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="location not found")
    return {
        **detail.model_dump(),
        "reconciliation": ReconciliationResponse(
            **service.reconciliation_summary(user_id, changed)
        ).model_dump(),
    }


def _run_mutation(session: Session, operation):
    try:
        return operation()
    except (LocationNotFound, LocationConfigurationError, IntegrityError) as exc:
        session.rollback()
        if isinstance(exc, IntegrityError):
            raise HTTPException(
                status_code=409, detail="location data conflicts with another change"
            ) from exc
        raise _service_error(exc) from exc
    except Exception:
        session.rollback()
        raise


@router.post(
    "",
    response_model=LocationMutationResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(get_current_user), Depends(require_csrf)],
)
def location_create(
    payload: LocationCreateRequest,
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    def operation():
        service = LocationService(session)
        location = service.create_location(
            user.id, payload.name, payload.parent_id, payload.description
        )
        changed = service.reconcile(user.id)
        session.commit()
        return _mutation_response(service, user.id, location.id, changed)

    return _run_mutation(session, operation)


@router.patch(
    "/{location_id}",
    response_model=LocationMutationResponse,
    dependencies=[Depends(get_current_user), Depends(require_csrf)],
)
def location_update(
    location_id: int,
    payload: LocationUpdateRequest,
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    def operation():
        service = LocationService(session)
        service.update_location(
            user.id,
            location_id,
            name=payload.name,
            parent_id=payload.parent_id,
            description=payload.description,
            update_parent="parent_id" in payload.model_fields_set,
            update_description="description" in payload.model_fields_set,
        )
        changed = service.reconcile(user.id)
        session.commit()
        return _mutation_response(service, user.id, location_id, changed)

    return _run_mutation(session, operation)


@router.post(
    "/{location_id}/ownership",
    response_model=LocationMutationResponse,
    dependencies=[Depends(get_current_user), Depends(require_csrf)],
)
def location_transfer_ownership(
    location_id: int,
    payload: LocationOwnershipTransferRequest,
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    def operation():
        if not payload.confirm_configuration_removed:
            raise LocationValidationError(
                "confirm that the private JSON configuration was removed before transfer"
            )
        if _configuration_active_for_user(session, user.id):
            raise LocationConflictError(
                "remove this account's HOPSTATS_LOCATION_CONFIG before transferring ownership"
            )
        service = LocationService(session)
        service.transfer_to_database(user.id, location_id)
        changed = service.reconcile(user.id)
        session.commit()
        return _mutation_response(service, user.id, location_id, changed)

    return _run_mutation(session, operation)


@router.delete(
    "/{location_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(get_current_user), Depends(require_csrf)],
)
def location_delete(
    location_id: int,
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    def operation():
        service = LocationService(session)
        service.delete_location(user.id, location_id)
        service.reconcile(user.id)
        session.commit()
        return None

    return _run_mutation(session, operation)


@router.post(
    "/{location_id}/aliases",
    response_model=AliasMutationResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(get_current_user), Depends(require_csrf)],
)
def alias_create(
    location_id: int,
    payload: AliasCreateRequest,
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    def operation():
        service = LocationService(session)
        alias = service.create_alias(user.id, location_id, payload.alias)
        changed = service.reconcile(user.id)
        session.commit()
        return {
            "alias": alias,
            "reconciliation": service.reconciliation_summary(user.id, changed),
        }

    return _run_mutation(session, operation)


@router.patch(
    "/{location_id}/aliases/{alias_id}",
    response_model=AliasMutationResponse,
    dependencies=[Depends(get_current_user), Depends(require_csrf)],
)
def alias_update(
    location_id: int,
    alias_id: int,
    payload: AliasUpdateRequest,
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    def operation():
        service = LocationService(session)
        alias = service.update_alias(user.id, location_id, alias_id, payload.alias)
        changed = service.reconcile(user.id)
        session.commit()
        return {
            "alias": alias,
            "reconciliation": service.reconciliation_summary(user.id, changed),
        }

    return _run_mutation(session, operation)


@router.delete(
    "/{location_id}/aliases/{alias_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(get_current_user), Depends(require_csrf)],
)
def alias_delete(
    location_id: int,
    alias_id: int,
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    def operation():
        service = LocationService(session)
        service.delete_alias(user.id, location_id, alias_id)
        service.reconcile(user.id)
        session.commit()
        return None

    return _run_mutation(session, operation)
