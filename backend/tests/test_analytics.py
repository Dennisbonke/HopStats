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

    annual_overview = client.get(
        "/api/v1/analytics/checkins?start=2020-01-01&end=2022-12-31&granularity=auto"
    ).json()
    assert annual_overview["granularity"] == "year"
    assert [bucket["key"] for bucket in annual_overview["buckets"]] == [
        "2020",
        "2021",
        "2022",
    ]
    full_year = client.get(
        "/api/v1/analytics/checkins?start=2021-01-01&end=2021-12-31&granularity=auto"
    ).json()
    assert full_year["granularity"] == "month"
    assert len(full_year["buckets"]) == 12


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
    annual = client.get(
        "/api/v1/analytics/checkins?start=2025-01-01&end=2026-12-31&granularity=year"
    )
    assert annual.status_code == 200
    assert [bucket["key"] for bucket in annual.json()["buckets"]] == ["2025", "2026"]
    assert annual.json()["summary"]["new_discoveries"] == 1
    assert annual.json()["summary"]["repeat_checkins"] == 1
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
    assert all_time["granularity"] == "year"


def test_analytics_rejects_invalid_range_and_timezone(client):
    reversed_range = client.get(
        "/api/v1/analytics/checkins?start=2026-02-01&end=2026-01-01&granularity=month"
    )
    invalid_timezone = client.get(
        "/api/v1/analytics/checkins?start=2026-01-01&end=2026-01-02&timezone=Not%2FAZone"
    )
    assert reversed_range.status_code == 422
    assert invalid_timezone.status_code == 422


def test_analytics_daily_bucket_cap_rejects_without_truncating(client):
    daily = client.get("/api/v1/analytics/checkins?start=2024-01-01&end=2025-01-01&granularity=day")
    assert daily.status_code == 422
    assert "more than 366 buckets" in daily.json()["detail"]

    monthly = client.get(
        "/api/v1/analytics/checkins?start=2024-01-01&end=2025-01-01&granularity=month"
    )
    assert monthly.status_code == 200
    assert len(monthly.json()["buckets"]) == 13


def test_analytics_daily_bucket_cap_can_be_configured(client, monkeypatch):
    from backend.app.config import get_settings

    monkeypatch.setenv("HOPSTATS_ANALYTICS_MAX_BUCKETS", "400")
    get_settings.cache_clear()
    response = client.get(
        "/api/v1/analytics/checkins?start=2024-01-01&end=2025-01-01&granularity=day"
    )
    get_settings.cache_clear()
    assert response.status_code == 200
    assert len(response.json()["buckets"]) == 367


def test_drinking_trends_dense_timezone_buckets_and_m7_consistency(client):
    owner = user_id()
    add_checkin(owner, "trends-a", utc("2025-12-31T23:30:00"), "trend-before")
    add_checkin(owner, "trends-a", utc("2026-01-01T22:00:00"), "trend-repeat")
    add_checkin(owner, "trends-b", utc("2026-01-04T01:15:00"), "trend-new")
    add_checkin(owner, "trends-b", utc("2026-01-04T01:45:00"), "trend-repeat-two")
    response = client.get(
        "/api/v1/analytics/drinking-trends",
        params={"start": "2026-01-01", "end": "2026-01-04", "timezone": "Europe/Amsterdam"},
    )
    assert response.status_code == 200
    result = response.json()
    assert len(result["daily"]) == 4
    assert len(result["weekday"]) == 7
    assert len(result["hourly"]) == 24
    assert len(result["weekday_hour"]) == 168
    assert [day["total"] for day in result["daily"]] == [2, 0, 0, 2]
    assert [day["discoveries"] for day in result["daily"]] == [1, 0, 0, 1]
    assert [bucket["days_in_period"] for bucket in result["weekday"]] == [0, 0, 0, 1, 1, 1, 1]
    assert result["hourly"][2] == {"hour": 2, "total": 2, "discoveries": 1, "repeats": 1}
    assert result["weekday_hour"][6 * 24 + 2] == {
        "weekday": 6,
        "hour": 2,
        "total": 2,
        "discoveries": 1,
        "repeats": 1,
    }
    for field in ("total", "discoveries", "repeats"):
        daily = sum(row[field] for row in result["daily"])
        assert daily == sum(row[field] for row in result["weekday"])
        assert daily == sum(row[field] for row in result["hourly"])
        assert daily == sum(row[field] for row in result["weekday_hour"])
    m7 = client.get(
        "/api/v1/analytics/checkins?start=2026-01-01&end=2026-01-04&granularity=day"
    ).json()
    assert sum(row["total"] for row in result["daily"]) == m7["summary"]["total_checkins"]
    assert sum(row["discoveries"] for row in result["daily"]) == m7["summary"]["new_discoveries"]


def test_drinking_trends_dst_repeated_hour_invalid_range_and_auth(client):
    owner = user_id()
    add_checkin(owner, "autumn-beer", utc("2026-10-25T00:15:00"), "autumn-first")
    add_checkin(owner, "autumn-beer", utc("2026-10-25T01:15:00"), "autumn-repeat")
    data = client.get("/api/v1/analytics/drinking-trends?start=2026-10-25&end=2026-10-25").json()
    assert data["hourly"][2]["total"] == 2
    assert data["daily"][0]["total"] == 2
    assert (
        client.get("/api/v1/analytics/drinking-trends?start=2026-02-02&end=2026-02-01").status_code
        == 422
    )
    assert (
        client.get(
            "/api/v1/analytics/drinking-trends?start=2026-01-01&end=2026-01-02&timezone=Not%2FAZone"
        ).status_code
        == 422
    )
    client.cookies.clear()
    assert client.get("/api/v1/analytics/drinking-trends").status_code == 401


def test_drinking_trends_spring_dst_leap_day_cross_year_and_timezone_boundaries(client):
    owner = user_id()
    add_checkin(owner, "boundary-a", utc("2025-12-31T23:30:00"), "boundary-utc")
    add_checkin(owner, "boundary-b", utc("2026-03-29T00:30:00"), "spring-before")
    add_checkin(owner, "boundary-c", utc("2026-03-29T01:30:00"), "spring-after")
    add_checkin(owner, "boundary-d", utc("2024-02-29T12:00:00"), "leap-day")

    utc_day = client.get(
        "/api/v1/analytics/drinking-trends",
        params={"start": "2025-12-31", "end": "2025-12-31", "timezone": "UTC"},
    ).json()
    amsterdam_day = client.get(
        "/api/v1/analytics/drinking-trends",
        params={
            "start": "2026-01-01",
            "end": "2026-01-01",
            "timezone": "Europe/Amsterdam",
        },
    ).json()
    assert utc_day["daily"][0]["total"] == amsterdam_day["daily"][0]["total"] == 1

    cross_year = client.get(
        "/api/v1/analytics/drinking-trends",
        params={"start": "2025-12-31", "end": "2026-01-01", "timezone": "UTC"},
    ).json()
    assert [item["total"] for item in cross_year["daily"]] == [1, 0]

    spring = client.get(
        "/api/v1/analytics/drinking-trends",
        params={
            "start": "2026-03-29",
            "end": "2026-03-29",
            "timezone": "Europe/Amsterdam",
        },
    ).json()
    assert spring["daily"][0]["total"] == 2
    assert spring["hourly"][1]["total"] == 1
    assert spring["hourly"][2]["total"] == 0
    assert spring["hourly"][3]["total"] == 1

    leap = client.get(
        "/api/v1/analytics/drinking-trends?start=2024-02-28&end=2024-03-01&timezone=UTC"
    ).json()
    assert [item["date"] for item in leap["daily"]] == [
        "2024-02-28",
        "2024-02-29",
        "2024-03-01",
    ]
    assert [item["total"] for item in leap["daily"]] == [0, 1, 0]


def test_drinking_trends_empty_period_short_week_and_range_cap(client):
    empty = client.get("/api/v1/analytics/drinking-trends?start=2019-01-01&end=2019-01-01").json()
    assert len(empty["daily"]) == 1
    assert all(row["total"] == row["discoveries"] == row["repeats"] == 0 for row in empty["daily"])
    assert sum(row["total"] for row in empty["weekday"]) == 0
    assert sum(row["total"] for row in empty["hourly"]) == 0
    assert sum(row["total"] for row in empty["weekday_hour"]) == 0

    single_weekday = client.get(
        "/api/v1/analytics/drinking-trends?start=2026-01-01&end=2026-01-01"
    ).json()
    assert [row["days_in_period"] for row in single_weekday["weekday"]] == [
        0,
        0,
        0,
        1,
        0,
        0,
        0,
    ]
    assert (
        client.get("/api/v1/analytics/drinking-trends?start=2024-01-01&end=2025-01-01").status_code
        == 422
    )

    aggregate_only = client.get(
        "/api/v1/analytics/drinking-trends?start=2024-01-01&end=2025-01-01&daily=false"
    )
    assert aggregate_only.status_code == 200
    assert aggregate_only.json()["daily"] == []
    assert len(aggregate_only.json()["weekday"]) == 7
    assert len(aggregate_only.json()["hourly"]) == 24
    assert sum(row["days_in_period"] for row in aggregate_only.json()["weekday"]) == 367


def test_drinking_trends_default_is_year_to_date_and_not_m7_all_time(client):
    from datetime import datetime
    from zoneinfo import ZoneInfo

    today = datetime.now(ZoneInfo("Europe/Amsterdam")).date()
    trends = client.get("/api/v1/analytics/drinking-trends").json()
    m7 = client.get("/api/v1/analytics/checkins?granularity=auto").json()
    assert trends["start"] == f"{today.year}-01-01"
    assert trends["end"] == today.isoformat()
    assert len(trends["daily"]) == (today - today.replace(month=1, day=1)).days + 1
    # M7 without dates has different semantics: lifetime history (or no range).
    assert m7["start"] is None
    assert m7["end"] is None


def test_drinking_trends_duplicate_imports_tied_timestamps_and_beer_identity(client):
    from backend.app.services.import_service import ImportService

    owner = user_id()
    payload = (
        b"checkin_id,bid,brewery_id,beer_name,brewery_name,created_at\n"
        b"imported-once,beer-identity-a,brewery-a,Same name,Brewery,2026-04-01T12:00:00Z\n"
    )
    importer = ImportService()
    importer.import_checkins(owner, "once.csv", payload)
    importer.import_checkins(owner, "twice.csv", payload)

    tied = utc("2026-04-01T12:00:00")
    add_checkin(owner, "beer-identity-b", tied, "tied-second-beer")
    add_checkin(owner, "beer-identity-b", tied, "tied-first-beer")
    with SessionLocal() as session:
        beers = session.scalars(select(Beer)).all()
        for beer in beers:
            beer.name = "Same name"
        session.commit()

    data = client.get(
        "/api/v1/analytics/drinking-trends?start=2026-04-01&end=2026-04-01&timezone=UTC"
    ).json()
    assert data["daily"][0]["total"] == 3
    assert data["daily"][0]["discoveries"] == 2
    assert data["daily"][0]["repeats"] == 1
