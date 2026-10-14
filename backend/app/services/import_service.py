import hashlib
from collections.abc import Callable
from datetime import UTC, datetime
from io import BytesIO
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import SessionLocal
from ..importers.base import ImportValidationError
from ..importers.common import read_csv
from ..importers.registry import select_importer
from ..models import Checkin, ImportRun
from ..models import ImportError as ImportErrorRecord
from ..schemas.imports import NormalizedCheckin, ParsedImport, ValidationIssue
from .catalog import CatalogService, metadata_json


def now_utc() -> datetime:
    return datetime.now(UTC)


class ImportService:
    """Parse outside the data transaction and commit check-in changes atomically."""

    def __init__(self, session_factory: Callable[[], Session] = SessionLocal):
        self.session_factory = session_factory

    def import_checkins(self, user_id: int, filename: str, payload: bytes) -> ImportRun:
        run = self._start_run(user_id, "checkins", filename, payload)
        try:
            parsed = self._parse(payload)
            if parsed.kind != "untappd_checkins_csv":
                raise ImportValidationError("file is not an Untappd check-in CSV")
        except Exception as exc:
            return self._fail_run(run.id, exc, _issues(exc))

        try:
            with self.session_factory() as session:
                with session.begin():
                    inserted, updated, unchanged = self._persist_checkins(
                        session, user_id, parsed.records
                    )
            return self._complete_run(run.id, inserted, updated, unchanged, 0)
        except Exception as exc:
            return self._fail_run(run.id, exc, ())

    def _parse(self, payload: bytes) -> ParsedImport:
        headers, _, _ = read_csv(BytesIO(payload))
        importer = select_importer(headers)
        return importer.parse(BytesIO(payload))

    def _persist_checkins(
        self, session: Session, user_id: int, records: tuple[Any, ...]
    ) -> tuple[int, int, int]:
        catalog = CatalogService(session)
        inserted = updated = unchanged = 0
        for normalized in records:
            if not isinstance(normalized, NormalizedCheckin):
                raise ImportValidationError("check-in importer produced an invalid record")
            beer = catalog.beer(normalized.beer)
            venue = catalog.venue(normalized.venue)
            existing = session.scalar(
                select(Checkin).where(
                    Checkin.user_id == user_id,
                    Checkin.source_system == "untappd",
                    Checkin.external_id == normalized.external_id,
                )
            )
            values = {
                "beer_id": beer.id,
                "venue_id": venue.id if venue else None,
                "occurred_at_utc": normalized.occurred_at_utc,
                "original_offset_minutes": normalized.original_offset_minutes,
                "rating": normalized.rating,
                "comment": normalized.comment,
                "serving_type": normalized.serving_type,
                "purchase_venue": normalized.purchase_venue,
                "photo_url": normalized.photo_url,
                "source_payload_json": metadata_json(normalized.source_metadata),
            }
            if existing is None:
                session.add(
                    Checkin(
                        user_id=user_id,
                        source_system="untappd",
                        external_id=normalized.external_id,
                        created_at=now_utc(),
                        updated_at=now_utc(),
                        **values,
                    )
                )
                inserted += 1
            else:
                changed = any(getattr(existing, key) != value for key, value in values.items())
                if changed:
                    for key, value in values.items():
                        setattr(existing, key, value)
                    existing.updated_at = now_utc()
                    updated += 1
                else:
                    unchanged += 1
        return inserted, updated, unchanged

    def _start_run(
        self, user_id: int, source_type: str, filename: str, payload: bytes
    ) -> ImportRun:
        run = ImportRun(
            user_id=user_id,
            source_type=source_type,
            filename=filename[:255],
            sha256=hashlib.sha256(payload).hexdigest(),
            started_at=now_utc(),
            status="processing",
            inserted_count=0,
            updated_count=0,
            unchanged_count=0,
            removed_count=0,
            rejected_count=0,
        )
        with self.session_factory() as session:
            session.add(run)
            session.commit()
            return run

    def _complete_run(
        self, run_id: int, inserted: int, updated: int, unchanged: int, removed: int
    ) -> ImportRun:
        with self.session_factory() as session:
            run = session.get(ImportRun, run_id)
            run.status = "completed"
            run.completed_at = now_utc()
            run.inserted_count = inserted
            run.updated_count = updated
            run.unchanged_count = unchanged
            run.removed_count = removed
            session.commit()
            return run

    def _fail_run(
        self, run_id: int, error: Exception, issues: tuple[ValidationIssue, ...]
    ) -> ImportRun:
        with self.session_factory() as session:
            run = session.get(ImportRun, run_id)
            run.status = "failed"
            run.completed_at = now_utc()
            run.rejected_count = max(1, len(issues))
            run.error_summary = str(error)[:2000]
            for issue in issues:
                session.add(
                    ImportErrorRecord(
                        import_run_id=run.id,
                        row_number=issue.row_number,
                        field=issue.field,
                        reason=issue.reason[:2000],
                    )
                )
            session.commit()
            return run


def _issues(error: Exception) -> tuple[ValidationIssue, ...]:
    issues = getattr(error, "issues", ())
    return tuple(issue for issue in issues if isinstance(issue, ValidationIssue))
