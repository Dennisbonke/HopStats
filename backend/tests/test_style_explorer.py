from datetime import UTC, datetime
from decimal import Decimal

import pytest
from sqlalchemy import select

from backend.app.db import SessionLocal
from backend.app.models import Beer, BeerStyle, Checkin, InventoryItem, InventorySource, User
from backend.tests.test_explore_api import _beer, _checkin, _user_id


def style(beer):
    with SessionLocal() as session:
        return session.get(Beer, beer).style_id


def attach(beer, style_id, abv=None, brewery_id=None):
    with SessionLocal() as session:
        row = session.get(Beer, beer)
        row.style_id = style_id
        row.abv = Decimal(str(abv)) if abv is not None else None
        if brewery_id is not None:
            row.brewery_id = brewery_id
        session.commit()


def listing(client, query=""):
    response = client.get(f"/api/v1/explore/styles?{query}")
    assert response.status_code == 200, response.text
    return response.json()


def test_scope_distinct_beers_weighted_rating_and_unweighted_abv(client):
    a = _beer("A", style="IPA - American", brewery="Known")
    sid = style(a)
    b, c, d = [_beer(name) for name in ["B", "C", "D"]]
    attach(a, sid, 8)
    attach(b, sid, 12)
    attach(c, sid, 10)
    attach(d, sid, 10)  # Equal values belong to distinct beers.
    for index in range(10):
        _checkin(_user_id(), a, f"a{index}", index, 4)
    _checkin(_user_id(), b, "b", 12, 0)
    _checkin(_user_id(), c, "c1", 13)
    _checkin(_user_id(), c, "c2", 14, 5)
    _checkin(_user_id(), d, "d", 15)
    _checkin(_user_id(), _beer("No style"), "missing", 0, 5)
    private = _beer("Private", style="Private")
    inventory = _beer("Inventory", style="Inventory")
    with SessionLocal() as session:
        other = User(username="other")
        session.add(other)
        session.flush()
        other_id = other.id
        source = InventorySource(user_id=_user_id(), source_system="test", name="stash")
        session.add(source)
        session.flush()
        session.add(
            InventoryItem(
                user_id=_user_id(),
                inventory_source_id=source.id,
                source_item_id="1",
                beer_id=inventory,
                quantity=1,
            )
        )
        session.add(BeerStyle(name="Global only"))
        session.commit()
    _checkin(other_id, private, "private", 0, 5)
    attach(private, style(private), 99)
    _checkin(other_id, b, "shared-private", 90, 0)
    result = listing(client)
    assert result["total"] == 1
    row = result["items"][0]
    assert row["unique_beer_count"] == 4 and row["checkin_count"] == 14
    assert row["rated_checkin_count"] == 12
    assert row["personal_average_rating"] == 3.75
    assert row["brewery_count"] == 1
    assert row["average_abv"] == 10 and row["known_abv_beer_count"] == 4
    assert row["first_checked_in_at"] == "2026-01-01T00:00:00+00:00"
    assert row["last_checked_in_at"] == "2026-01-16T00:00:00+00:00"
    assert client.get("/api/v1/explore/style-bounds").json() == {"abv_max": 10}
    detail = client.get(f"/api/v1/explore/styles/{sid}").json()
    assert detail["highest_rating"] == 5 and detail["lowest_rating"] == 0
    assert sum(b["count"] for b in detail["rating_distribution"]) == 12
    assert [b["id"] for b in detail["highest_rated_beers"]] == [c, a, b]
    assert detail["most_explored_breweries"][0]["unique_beer_count"] == 1
    for identifier in [style(private), style(inventory), 99999]:
        response = client.get(f"/api/v1/explore/styles/{identifier}")
        assert response.status_code == 404 and response.json() == {"detail": "Style not found"}
    client.cookies.clear()
    for path in ["styles", f"styles/{sid}", "style-bounds"]:
        assert client.get(f"/api/v1/explore/{path}").status_code == 401


def test_exact_filters_null_zero_and_sorting(client):
    ids = []
    for name, ratings, abvs in [
        ("Lower", [4.1, 4.2], [8, 12]),
        ("Higher", [4.15, 4.16], [10, 10.01]),
        ("Unrated", [None], [None]),
        ("Zero", [0], [0]),
    ]:
        beer = _beer(name, style=name)
        sid = style(beer)
        ids.append(sid)
        for i, (rating, abv) in enumerate(zip(ratings, abvs, strict=True)):
            current = beer if i == 0 else _beer(f"{name}{i}")
            attach(current, sid, abv)
            _checkin(_user_id(), current, f"{name}{i}", i, rating)
    for direction, order in [("desc", [1, 0, 3, 2]), ("asc", [3, 0, 1, 2])]:
        assert [r["id"] for r in listing(client, f"sort=rating_{direction}")["items"]] == [
            ids[i] for i in order
        ]
    for query, expected in [
        ("rating_min=4.15&rating_max=4.15", [ids[0]]),
        ("rating_max=0", [ids[3]]),
        ("abv_min=10&abv_max=10", [ids[0]]),
        ("abv_min=10.01", []),
        ("abv_min=10.00", ids[:2]),
        ("abv_max=0", [ids[3]]),
        ("abv_min=0", [ids[0], ids[1], ids[3]]),
    ]:
        assert sorted(r["id"] for r in listing(client, query)["items"]) == sorted(expected)
    assert listing(client, "min_breweries=0")["total"] == 4
    assert listing(client, "min_breweries=1")["total"] == 0
    assert listing(client, "min_checkins=2&min_unique_beers=2")["total"] == 2
    detail = client.get(f"/api/v1/explore/styles/{ids[2]}").json()
    assert detail["average_abv"] is None and detail["known_abv_beer_count"] == 0
    assert detail["personal_average_rating"] is None
    assert detail["highest_rating"] is None and detail["lowest_rating"] is None
    assert detail["highest_rated_beers"] == [] and detail["most_explored_breweries"] == []
    assert [b["count"] for b in detail["rating_distribution"]] == [0] * 10


def test_missing_abv_denominator_and_brewery_ranking(client):
    a = _beer("A", style="Original", brewery="Zulu")
    sid = style(a)
    with SessionLocal() as session:
        bid = session.get(Beer, a).brewery_id
    b = _beer("B", brewery="Alpha")
    c = _beer("C")
    attach(a, sid, 0)
    attach(b, sid, 12)
    attach(c, sid, None, bid)
    for index, beer in enumerate([a, b, c]):
        _checkin(_user_id(), beer, str(index), index, 4)
    # Brewery has more beers elsewhere, which must not affect this ranking.
    outside = _beer("Outside", style="Separate")
    with SessionLocal() as session:
        session.get(Beer, outside).brewery_id = session.get(Beer, b).brewery_id
        session.commit()
    _checkin(_user_id(), outside, "outside", 0)
    row = client.get(f"/api/v1/explore/styles/{sid}").json()
    assert row["average_abv"] == 6 and row["known_abv_beer_count"] == 2
    assert row["brewery_count"] == 2
    assert [(b["name"], b["unique_beer_count"]) for b in row["most_explored_breweries"]] == [
        ("Zulu", 2),
        ("Alpha", 1),
    ]
    assert listing(client, "min_breweries=2")["total"] == 1


def test_literal_search_deterministic_pagination_and_original_identities(client):
    for i, name in enumerate(
        ["IPA - American%_\\", "IPA - Triple", "IPA - New England / Hazy", "Same", "same"]
    ):
        _checkin(_user_id(), _beer(str(i), style=name), str(i), 0)
    for query in ["%25", "%5F", "%5C", "amerICAN"]:
        assert listing(client, f"search={query}")["total"] == 1
    for field in [
        "name",
        "unique_beers",
        "checkins",
        "rating",
        "breweries",
        "first_tried",
        "last_tried",
    ]:
        for direction in ["asc", "desc"]:
            result = listing(client, f"sort={field}_{direction}&page_size=2&page=999")
            assert (result["page"], result["total_pages"], result["total"]) == (3, 3, 5)
    rows = listing(client)["items"]
    assert [r["id"] for r in rows] == sorted(r["id"] for r in rows)
    assert listing(client, "search=absent&page=8")["page"] == 1


def test_distribution_boundaries_and_bounded_detail(client):
    a = _beer("A", style="Buckets")
    sid = style(a)
    ratings = [
        0,
        0.49,
        0.5,
        0.99,
        1,
        1.49,
        1.5,
        1.99,
        2,
        2.49,
        2.5,
        2.99,
        3,
        3.49,
        3.5,
        3.99,
        4,
        4.49,
        4.5,
        4.99,
        5,
        None,
    ]
    for i, rating in enumerate(ratings):
        _checkin(_user_id(), a, str(i), 0, rating)
    for i in range(7):
        extra = _beer(f"Extra {i}", brewery=f"Brewery {i}")
        attach(extra, sid)
        _checkin(_user_id(), extra, f"extra{i}", 0, 4)
    row = client.get(f"/api/v1/explore/styles/{sid}").json()
    assert [b["count"] for b in row["rating_distribution"]] == [2] * 8 + [9, 3]
    assert sum(b["count"] for b in row["rating_distribution"]) == row["rated_checkin_count"]
    assert len(row["highest_rated_beers"]) == len(row["most_explored_breweries"]) == 5
    assert [b["name"] for b in row["most_explored_breweries"]] == [f"Brewery {i}" for i in range(5)]


@pytest.mark.parametrize(
    "day,start,end",
    [
        ("2026-03-29", "2026-03-28T23:00:00", "2026-03-29T22:00:00"),
        ("2026-10-25", "2026-10-24T22:00:00", "2026-10-25T23:00:00"),
    ],
)
def test_lifetime_dates_and_dst(client, day, start, end):
    for i, timestamp in enumerate([start, end]):
        beer = _beer(str(i), style=str(i))
        _checkin(_user_id(), beer, str(i), 0, 4)
        with SessionLocal() as session:
            session.scalar(
                select(Checkin).where(Checkin.beer_id == beer)
            ).occurred_at_utc = datetime.fromisoformat(timestamp).replace(tzinfo=UTC)
            session.commit()
    for prefix in ["first_tried", "last_tried"]:
        result = listing(client, f"{prefix}_from={day}&{prefix}_to={day}")
        assert result["total"] == 1 and result["items"][0]["name"] == "0"
    beer = _beer("Lifetime", style="Lifetime")
    _checkin(_user_id(), beer, "old", -365, 0)
    _checkin(_user_id(), beer, "new", 300, 5)
    assert (
        listing(client, "last_tried_from=2026-10-01&search=Lifetime")["items"][0][
            "personal_average_rating"
        ]
        == 2.5
    )
    assert listing(client, "first_tried_from=2026-01-01&search=Lifetime")["total"] == 0


@pytest.mark.parametrize(
    "query",
    [
        "min_checkins=0",
        "min_unique_beers=-1",
        "min_breweries=-1",
        "min_breweries=1.5",
        "page=0",
        "page_size=101",
        "sort=abv_desc",
        "rating_min=-1",
        "rating_max=5.01",
        "rating_min=4.001",
        "rating_min=4&rating_max=3",
        "abv_min=NaN",
        "abv_max=inf",
        "abv_min=1.001",
        "abv_min=12&abv_max=10",
        "first_tried_from=2026-02-30",
        "last_tried_from=2026-02-02&last_tried_to=2026-01-01",
        "last_tried_to=9999-12-31",
    ],
)
def test_invalid_queries(client, query):
    assert client.get(f"/api/v1/explore/styles?{query}").status_code == 422


@pytest.mark.parametrize("identifier", ["0", "-1", "abc", "9223372036854775808"])
def test_invalid_ids(client, identifier):
    assert client.get(f"/api/v1/explore/styles/{identifier}").status_code == 422
