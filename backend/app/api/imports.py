from datetime import datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..api.auth import get_current_user, require_csrf
from ..config import get_settings
from ..db import get_db
from ..models import ImportError as ImportErrorRecord
from ..models import ImportRun, User
from ..schemas.api_imports import ImportDetailResponse, ImportSummaryResponse
from ..services.import_service import ImportService

router = APIRouter(prefix="/api/v1/imports", tags=["imports"])


def summary(run: ImportRun, errors: list[ImportErrorRecord] | None = None) -> ImportSummaryResponse:
    return ImportSummaryResponse.model_validate(
        {**ImportSummaryResponse.model_validate(run).model_dump(), "errors": errors or []}
    )


async def upload_bytes(upload: UploadFile) -> bytes:
    maximum = get_settings().max_upload_bytes
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(min(64 * 1024, maximum + 1))
        if not chunk:
            break
        total += len(chunk)
        if total > maximum:
            raise HTTPException(
                status_code=413, detail="uploaded file exceeds the configured size limit"
            )
        chunks.append(chunk)
    return b"".join(chunks)


def result(run: ImportRun, session: Session):
    errors = session.scalars(
        select(ImportErrorRecord)
        .where(ImportErrorRecord.import_run_id == run.id)
        .order_by(ImportErrorRecord.row_number, ImportErrorRecord.id)
    ).all()
    body = summary(run, errors).model_dump(mode="json")
    if run.status == "completed":
        return body
    status_code = {
        "invalid_csv": 422,
        "unsupported_schema": 415,
        "confirmation_required": 409,
        "older_snapshot": 409,
        "undated_snapshot": 409,
        "persistence_failure": 500,
    }.get(run.error_code, 422)
    return JSONResponse(status_code=status_code, content=body)


@router.post("/checkins", response_model=ImportSummaryResponse)
async def import_checkins(
    file: Annotated[UploadFile, File(...)],
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    _: Annotated[None, Depends(require_csrf)],
):
    payload = await upload_bytes(file)
    filename = Path(file.filename or "checkins.csv").name
    run = await run_in_threadpool(ImportService().import_checkins, user.id, filename, payload)
    return result(run, session)


@router.post("/inventory", response_model=ImportSummaryResponse)
async def import_inventory(
    file: Annotated[UploadFile, File(...)],
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    _: Annotated[None, Depends(require_csrf)],
    confirm_replacement: Annotated[bool, Form()] = False,
    source_exported_at: Annotated[str | None, Form()] = None,
    allow_older: Annotated[bool, Form()] = False,
    allow_undated: Annotated[bool, Form()] = False,
):
    payload = await upload_bytes(file)
    filename = Path(file.filename or "stash.csv").name
    parsed_source_date = None
    if source_exported_at:
        try:
            parsed_source_date = datetime.fromisoformat(source_exported_at.replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(
                status_code=422, detail="source_exported_at must be ISO-8601"
            ) from exc
    run = await run_in_threadpool(
        ImportService().import_inventory,
        user.id,
        filename,
        payload,
        confirm_replacement,
        parsed_source_date,
        allow_older,
        allow_undated,
    )
    return result(run, session)


@router.get("", response_model=list[ImportSummaryResponse])
def import_history(
    session: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(get_current_user)]
):
    runs = session.scalars(
        select(ImportRun)
        .where(ImportRun.user_id == user.id)
        .order_by(ImportRun.started_at.desc())
        .limit(100)
    ).all()
    return runs


@router.get("/{import_id}", response_model=ImportDetailResponse)
def import_detail(
    import_id: int,
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    run = session.get(ImportRun, import_id)
    if run is None or run.user_id != user.id:
        raise HTTPException(status_code=404, detail="import run not found")
    errors = session.scalars(
        select(ImportErrorRecord)
        .where(ImportErrorRecord.import_run_id == import_id)
        .order_by(ImportErrorRecord.row_number, ImportErrorRecord.id)
    ).all()
    return ImportDetailResponse.model_validate(
        {**summary(run, errors).model_dump(), "errors": errors}
    )
