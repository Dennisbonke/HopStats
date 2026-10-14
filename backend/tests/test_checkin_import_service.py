import csv
from io import StringIO

from sqlalchemy import select

from backend.app.db import SessionLocal
from backend.app.models import Beer, Brewery, Checkin, ImportError, ImportRun, User
from backend.app.services.import_service import ImportService


def checkin_csv(*rows: dict[str, str]) -> bytes:
    fields = [
        "beer_name",
        "brewery_name",
        "beer_type",
        "beer_abv",
        "beer_ibu",
        "comment",
        "venue_name",
        "venue_city",
        "venue_state",
        "venue_country",
        "venue_lat",
        "venue_lng",
        "venue_id",
        "rating_score",
        "created_at",
        "timezone_offset",
        "purchase_venue",
        "serving_type",
        "checkin_id",
        "bid",
        "brewery_id",
        "photo_url",
        "tagged_friends",
    ]
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue().encode()


def row(checkin_id: str, bid: str, comment: str = "", rating: str = "") -> dict[str, str]:
    return {
        "beer_name": "Pilsner",
        "brewery_name": "Hop Works",
        "beer_type": "Pilsner",
        "beer_abv": "5.0",
        "beer_ibu": "25",
        "comment": comment,
        "rating_score": rating,
        "created_at": "2026-09-29T20:00:00-07:00",
        "timezone_offset": "-420",
        "serving_type": "Draft",
        "checkin_id": checkin_id,
        "bid": bid,
        "brewery_id": "brew-1",
        "tagged_friends": "friend",
    }


def local_user_id() -> int:
    with SessionLocal() as session:
        return session.scalar(select(User.id).where(User.username == "local"))


def test_checkin_import_is_idempotent_and_updates_changed_records(client):
    service = ImportService()
    payload = checkin_csv(row("check-1", "beer-1", "first", "4.0"), row("check-2", "beer-1"))
    first = service.import_checkins(local_user_id(), "checkins.csv", payload)
    assert (first.status, first.inserted_count, first.updated_count, first.unchanged_count) == (
        "completed",
        2,
        0,
        0,
    )
    second = service.import_checkins(local_user_id(), "checkins.csv", payload)
    assert (second.inserted_count, second.updated_count, second.unchanged_count) == (0, 0, 2)

    changed = service.import_checkins(
        local_user_id(), "checkins.csv", checkin_csv(row("check-1", "beer-1", "changed", "4.5"))
    )
    assert (changed.inserted_count, changed.updated_count, changed.unchanged_count) == (0, 1, 0)
    with SessionLocal() as session:
        assert session.query(Checkin).count() == 2
        checkin = session.scalar(select(Checkin).where(Checkin.external_id == "check-1"))
        assert checkin.comment == "changed"
        assert checkin.rating == 4.5
        assert session.query(Beer).count() == 1
        assert session.query(Brewery).count() == 1


def test_invalid_checkin_import_does_not_partially_persist_and_is_audited(client):
    service = ImportService()
    service.import_checkins(local_user_id(), "valid.csv", checkin_csv(row("check-1", "beer-1")))
    invalid = service.import_checkins(
        local_user_id(),
        "invalid.csv",
        checkin_csv(row("check-2", "beer-2"), row("check-2", "beer-3")),
    )
    assert invalid.status == "failed"
    with SessionLocal() as session:
        assert session.query(Checkin).count() == 1
        stored = session.get(ImportRun, invalid.id)
        assert stored.status == "failed"
        assert stored.rejected_count == 1
        assert session.query(ImportError).filter_by(import_run_id=invalid.id).count() == 1
