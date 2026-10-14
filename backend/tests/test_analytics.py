from datetime import UTC, datetime

from sqlalchemy import select

from backend.app.db import SessionLocal
from backend.app.models import Beer, Checkin, User


def user_id(username="local"):
    with SessionLocal() as session:
        return session.scalar(select(User.id).where(User.username == username))


def add_checkin(owner_id, beer_external_id, when, external_id):
    with SessionLocal() as session:
        beer = session.scalar(
            select(Beer).where(
                Beer.source_system == "untappd", Beer.external_id == beer_external_id
            )
        )
        if beer is None:
            beer = Beer(
                source_system="untappd", external_id=beer_external_id, name=beer_external_id
            )
            session.add(beer)
            session.flush()
        occurred = when.astimezone(UTC).replace(tzinfo=None)
        session.add(
            Checkin(
                user_id=owner_id,
                source_system="untappd",
                external_id=external_id,
                beer_id=beer.id,
                occurred_at_utc=occurred,
            )
        )
        session.commit()


def utc(value):
    return datetime.fromisoformat(value).replace(tzinfo=UTC)


def test_analytics_breakdown_period_and_lifetime_baseline(client):
    owner = user_id()
    add_checkin(owner, "beer-a", utc("2025-12-31T12:30:00"), "a-old")
    add_checkin(owner, "beer-a", utc("2026-01-01T10:00:00"), "a-repeat")
    add_checkin(owner, "beer-a", utc("2026-01-02T09:00:00"), "a-repeat-again")
    add_checkin(owner, "beer-b", utc("2026-01-02T12:00:00"), "b-first")
    add_checkin(owner, "beer-b", utc("2026-01-02T13:00:00"), "b-repeat")

    response = client.get(
        "/api/v1/analytics/checkins",
        params={
            "start": "2026-01-01",
            "end": "2026-01-02",
            "granularity": "day",
            "timezone": "Europe/Amsterdam",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["summary"] == {
        "total_checkins": 4,
        "new_discoveries": 1,
        "repeat_checkins": 3,
        "distinct_beers": 2,
    }
    assert data["cumulative_baseline_checkins"] == 1
    assert data["cumulative_baseline_discoveries"] == 1
    assert [
        (bucket["new_discoveries"], bucket["repeat_checkins"], bucket["cumulative_checkins"])
        for bucket in data["buckets"]
    ] == [(0, 1, 2), (1, 2, 5)]


def test_analytics_zero_fills_months_and_handles_iso_week_year(client):
    owner = user_id()
    add_checkin(owner, "week-beer", utc("2021-01-01T12:00:00"), "week-one")
    week = client.get(
        "/api/v1/analytics/checkins?start=2020-12-31&end=2021-01-04&granularity=week"
    ).json()
    assert [bucket["key"] for bucket in week["buckets"]] == ["2020-W53", "2021-W01"]
    assert week["buckets"][0]["total_checkins"] == 1
    assert week["buckets"][1]["total_checkins"] == 0

    monthly = client.get(
        "/api/v1/analytics/checkins?start=2021-01-01&end=2021-03-31&granularity=month"
    ).json()
    assert [bucket["key"] for bucket in monthly["buckets"]] == ["2021-01", "2021-02", "2021-03"]
    assert [bucket["total_checkins"] for bucket in monthly["buckets"]] == [1, 0, 0]


def test_analytics_timezone_dst_and_inclusive_dates(client):
    owner = user_id()
    add_checkin(owner, "dst-beer", utc("2026-03-29T00:30:00"), "dst-before")
    add_checkin(owner, "dst-beer", utc("2026-03-29T21:30:00"), "dst-after")
    data = client.get(
        "/api/v1/analytics/checkins?start=2026-03-29&end=2026-03-29&granularity=day"
        "&timezone=Europe%2FAmsterdam"
    ).json()
    assert data["summary"]["total_checkins"] == 2
    assert data["buckets"][0]["new_discoveries"] == 1
    assert data["buckets"][0]["repeat_checkins"] == 1


def test_analytics_user_scoped_discoveries_empty_range_and_auth(client):
    owner = user_id()
    with SessionLocal() as session:
        other = User(username="analytics-other")
        session.add(other)
        session.commit()
        other_id = other.id
    shared_at = utc("2024-02-01T12:00:00")
    add_checkin(other_id, "shared-beer", shared_at, "other-first")
    add_checkin(owner, "shared-beer", utc("2025-02-01T12:00:00"), "mine-first")
    add_checkin(owner, "shared-beer", utc("2026-02-01T12:00:00"), "mine-repeat")
    own = client.get("/api/v1/analytics/checkins?start=2025-01-01&end=2026-12-31&granularity=year")
    assert own.status_code == 422
    own = client.get(
        "/api/v1/analytics/checkins?start=2025-01-01&end=2026-12-31&granularity=month"
    ).json()
    assert own["summary"]["new_discoveries"] == 1
    assert own["summary"]["repeat_checkins"] == 1
    empty = client.get(
        "/api/v1/analytics/checkins?start=2019-01-01&end=2019-01-02&granularity=day"
    ).json()
    assert empty["summary"]["total_checkins"] == 0
    assert [bucket["total_checkins"] for bucket in empty["buckets"]] == [0, 0]

    client.cookies.clear()
    assert client.get("/api/v1/analytics/checkins").status_code == 401


def test_late_historical_import_and_identical_timestamps_use_event_time_then_id(client):
    owner = user_id()
    # Insert a newer event first to model out-of-order imports.
    tied = utc("2024-05-01T12:00:00")
    add_checkin(owner, "late-import-beer", utc("2025-05-01T12:00:00"), "newer-first")
    add_checkin(owner, "late-import-beer", tied, "older-imported-later")
    add_checkin(owner, "tie-beer", tied, "tie-one")
    add_checkin(owner, "tie-beer", tied, "tie-two")

    older = client.get(
        "/api/v1/analytics/checkins?start=2024-05-01&end=2024-05-01&granularity=day"
    ).json()
    newer = client.get(
        "/api/v1/analytics/checkins?start=2025-05-01&end=2025-05-01&granularity=day"
    ).json()
    all_time = client.get("/api/v1/analytics/checkins?granularity=auto").json()
    assert older["summary"]["new_discoveries"] == 2
    assert older["summary"]["repeat_checkins"] == 1
    assert newer["summary"]["new_discoveries"] == 0
    assert newer["summary"]["repeat_checkins"] == 1
    assert all_time["summary"]["total_checkins"] == 4
    assert all_time["summary"]["new_discoveries"] == 2
    assert all_time["granularity"] == "month"


def test_analytics_rejects_invalid_range_and_timezone(client):
    reversed_range = client.get(
        "/api/v1/analytics/checkins?start=2026-02-01&end=2026-01-01&granularity=month"
    )
    invalid_timezone = client.get(
        "/api/v1/analytics/checkins?start=2026-01-01&end=2026-01-02&timezone=Not%2FAZone"
    )
    assert reversed_range.status_code == 422
    assert invalid_timezone.status_code == 422
