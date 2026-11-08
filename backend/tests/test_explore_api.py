from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select

from backend.app.db import SessionLocal
from backend.app.models import Beer, BeerStyle, Brewery, Checkin, User


def _user_id(username: str = "local") -> int:
    with SessionLocal() as session:
        return session.scalar(select(User.id).where(User.username == username))


def _beer(
    name: str,
    *,
    brewery: str | None = None,
    style: str | None = None,
    photo_url: str | None = None,
) -> int:
    with SessionLocal() as session:
        brewery_row = None
        if brewery:
            brewery_row = Brewery(source_system="test", name=brewery)
            session.add(brewery_row)
        style_row = BeerStyle(name=style) if style else None
        if style_row:
            session.add(style_row)
        session.flush()
        beer = Beer(
            name=name,
            source_system="test",
            brewery_id=brewery_row.id if brewery_row else None,
            style_id=style_row.id if style_row else None,
            photo_url=photo_url,
        )
        session.add(beer)
        session.commit()
        return beer.id


def _checkin(user_id: int, beer_id: int, key: str, day: int, rating=None) -> None:
    with SessionLocal() as session:
        session.add(
            Checkin(
                user_id=user_id,
                source_system="test",
                external_id=key,
                beer_id=beer_id,
                occurred_at_utc=datetime(2026, 1, 1, tzinfo=UTC) + timedelta(days=day),
                rating=Decimal(str(rating)) if rating is not None else None,
            )
        )
        session.commit()


def test_explore_empty_history_and_authentication(client):
    assert client.get("/api/v1/explore/beers").json() == {
        "items": [],
        "page": 1,
        "page_size": 25,
        "total": 0,
        "total_pages": 0,
    }


def test_explore_aggregates_personal_checkins_and_isolates_users(client):
    beer_id = _beer(
        "Shared Stout",
        brewery="Brew House",
        style="Stout",
        photo_url="https://example.test/beer.jpg",
    )
    local_id = _user_id()
    with SessionLocal() as session:
        other = User(username="other")
        session.add(other)
        session.commit()
        other_id = other.id
    _checkin(local_id, beer_id, "local-1", 0, 4)
    _checkin(local_id, beer_id, "local-2", 3)
    _checkin(local_id, beer_id, "local-3", 8, 5)
    _checkin(other_id, beer_id, "other-1", 12, 1)
    _checkin(other_id, _beer("Other only"), "other-2", 1)

    items = client.get("/api/v1/explore/beers").json()["items"]
    assert len(items) == 1
    assert items[0]["checkin_count"] == 3
    assert items[0]["rated_checkin_count"] == 2
    assert items[0]["personal_average_rating"] == 4.5
    assert items[0]["first_checked_in_at"].startswith("2026-01-01")
    assert items[0]["first_checked_in_at"].endswith("+00:00")
    assert items[0]["last_checked_in_at"].startswith("2026-01-09")
    assert items[0]["brewery"]["name"] == "Brew House"
    assert items[0]["style"]["name"] == "Stout"
    assert items[0]["photo_url"].endswith("beer.jpg")


def test_explore_keeps_same_name_beers_distinct_and_all_missing_values(client):
    user_id = _user_id()
    ids = [_beer("Twin"), _beer("Twin")]
    for index, beer_id in enumerate(ids):
        _checkin(user_id, beer_id, f"twin-{index}", index)
    items = client.get("/api/v1/explore/beers?sort=name_asc").json()["items"]
    assert {item["id"] for item in items} == set(ids)
    assert all(item["brewery"] is None and item["style"] is None for item in items)
    assert all(item["abv"] is None and item["ibu"] is None for item in items)
    assert all(
        item["photo_url"] is None and item["personal_average_rating"] is None for item in items
    )
    assert all(item["rated_checkin_count"] == 0 for item in items)


def test_explore_search_sort_and_pagination(client):
    user_id = _user_id()
    fixtures = [
        ("Alpha", "North Brewing", 2, 1),
        ("beta", "South Brewing", 5, 3),
        ("Gamma", "North Brewing", 2, 6),
        ("Delta", "Other", 1, 8),
    ]
    ids = []
    for index, (name, brewery, count, day) in enumerate(fixtures):
        beer_id = _beer(name, brewery=brewery)
        ids.append(beer_id)
        for instance in range(count):
            _checkin(user_id, beer_id, f"{index}-{instance}", day + instance)

    assert [
        item["name"] for item in client.get("/api/v1/explore/beers?search=ALP").json()["items"]
    ] == ["Alpha"]
    assert [
        item["name"] for item in client.get("/api/v1/explore/beers?search=sOuTh").json()["items"]
    ] == ["beta"]
    expected = {
        "name_asc": ["Alpha", "beta", "Delta", "Gamma"],
        "name_desc": ["Gamma", "Delta", "beta", "Alpha"],
        "last_tried_desc": ["Delta", "beta", "Gamma", "Alpha"],
        "last_tried_asc": ["Alpha", "beta", "Gamma", "Delta"],
        "checkins_desc": ["beta", "Alpha", "Gamma", "Delta"],
        "checkins_asc": ["Delta", "Alpha", "Gamma", "beta"],
    }
    for sort, names in expected.items():
        response = client.get(f"/api/v1/explore/beers?sort={sort}&page_size=2")
        data = response.json()
        assert [item["name"] for item in data["items"]] == names[:2]
        second = client.get(f"/api/v1/explore/beers?sort={sort}&page_size=2&page=2").json()
        assert [item["name"] for item in second["items"]] == names[2:]
        assert data["total"] == 4 and data["total_pages"] == 2

    filtered = client.get("/api/v1/explore/beers?search=brewing&page_size=1&page=2").json()
    assert filtered["total"] == 3
    assert len(filtered["items"]) == 1
    assert client.get("/api/v1/explore/beers?page=0").status_code == 422
    assert client.get("/api/v1/explore/beers?page_size=101").status_code == 422
    assert client.get("/api/v1/explore/beers?sort=abv_desc").status_code == 422
