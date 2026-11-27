from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from backend.app.db import SessionLocal
from backend.app.models import Beer, Brewery, Checkin, InventoryItem, InventorySource, User
from backend.tests.test_explore_api import _beer, _checkin, _user_id


def brewery(beer):
    with SessionLocal() as session:
        return session.get(Beer, beer).brewery_id


def attach(beer, brewery_id):
    with SessionLocal() as session:
        session.get(Beer, beer).brewery_id = brewery_id
        session.commit()


def listing(client, query=""):
    response = client.get(f"/api/v1/explore/breweries?{query}")
    assert response.status_code == 200, response.text
    return response.json()


def test_brewery_scope_and_weighted_detail(client):
    a = _beer("A", brewery="Personal", style="IPA")
    b = _beer("B", style="Stout")
    missing = _beer("Missing style")
    own = brewery(a)
    attach(b, own)
    attach(missing, own)
    for index, rating in enumerate([4, 4.5, 4.25]):
        _checkin(_user_id(), a, f"a{index}", index, rating)
    _checkin(_user_id(), b, "b", 5, 3)
    detail = client.get(f"/api/v1/explore/breweries/{own}").json()
    assert detail["personal_average_rating"] == 3.9375
    _checkin(_user_id(), missing, "missing", 6)
    other_only = _beer("Other", brewery="Private country")
    inventory = _beer("Inventory", brewery="Inventory")
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
        row = session.get(Brewery, own)
        row.city, row.state, row.country = "Amsterdam", "Noord-Holland", "Netherlands"
        row.source_system, row.external_id = "untappd", "765"
        session.get(Brewery, brewery(other_only)).country = "Private"
        session.commit()
    _checkin(other_id, a, "other-shared", 20, 0)
    _checkin(other_id, other_only, "other-only", 0, 5)
    result = listing(client)
    assert result["total"] == 1
    item = result["items"][0]
    assert item["unique_beer_count"] == 3
    assert item["checkin_count"] == 5 and item["rated_checkin_count"] == 4
    assert item["personal_average_rating"] == 3.9375
    detail = client.get(f"/api/v1/explore/breweries/{own}").json()
    assert detail["style_count"] == 2
    assert detail["highest_rating"] == 4.5 and detail["lowest_rating"] == 3
    assert detail["untappd_url"] == "https://untappd.com/brewery/765"
    assert [b["id"] for b in detail["highest_rated_beers"]] == [a, b]
    assert {s["name"]: s["unique_beer_count"] for s in detail["most_explored_styles"]} == {
        "IPA": 1,
        "Stout": 1,
    }
    assert sum(b["count"] for b in detail["rating_distribution"]) == 4
    assert client.get("/api/v1/explore/brewery-countries").json()["items"] == ["Netherlands"]
    for identifier in [brewery(other_only), brewery(inventory), 99999]:
        assert client.get(f"/api/v1/explore/breweries/{identifier}").status_code == 404
    client.cookies.clear()
    for path in ["breweries", f"breweries/{own}", "brewery-countries"]:
        assert client.get(f"/api/v1/explore/{path}").status_code == 401


def test_exact_rating_and_null_ordering(client):
    ids = []
    for name, ratings in [
        ("Lower", [4.1, 4.2]),
        ("Higher", [4.15, 4.16]),
        ("Unrated", [None]),
        ("Zero", [0]),
    ]:
        beer = _beer(name, brewery=name)
        ids.append(brewery(beer))
        for i, rating in enumerate(ratings):
            _checkin(_user_id(), beer, f"{name}{i}", 0, rating)
    assert [r["id"] for r in listing(client, "sort=rating_desc")["items"]] == [
        ids[1],
        ids[0],
        ids[3],
        ids[2],
    ]
    assert [r["id"] for r in listing(client, "sort=rating_asc")["items"]] == [
        ids[3],
        ids[0],
        ids[1],
        ids[2],
    ]
    assert [r["id"] for r in listing(client, "rating_min=4.15&rating_max=4.15")["items"]] == [
        ids[0]
    ]
    assert [r["id"] for r in listing(client, "rating_max=0")["items"]] == [ids[3]]
    assert listing(client, "min_checkins=2")["total"] == 2
    assert listing(client, "min_unique_beers=2")["total"] == 0
    for sort in ["unique_beers_desc", "checkins_desc", "first_tried_asc", "last_tried_desc"]:
        rows = listing(client, f"sort={sort}&page_size=1")
        assert rows["total_pages"] == 4
        assert listing(client, f"sort={sort}&page_size=1&page=999")["page"] == 4
    assert listing(client, "search=absent&page=9")["page"] == 1


def test_search_location_countries_and_ties(client):
    for index, (name, city, state, country) in enumerate(
        [
            ("A%_\\ brewery", "Amsterdam", "Noord", "NL"),
            ("A normal", "Haarlem", "Zuid", "BE"),
            ("Unknown", None, None, None),
            ("Empty", "", "", ""),
        ]
    ):
        beer = _beer(name, brewery=name)
        _checkin(_user_id(), beer, str(index), 0)
        with SessionLocal() as session:
            row = session.get(Brewery, brewery(beer))
            row.city, row.state, row.country = city, state, country
            session.commit()
    for search in ["amSTERdam", "noORD", "nl", "%25", "%5F", "%5C"]:
        assert listing(client, f"search={search}")["total"] == 1
    assert listing(client, "country=NL&country=BE")["total"] == 2
    assert listing(client, "unknown_country=true")["total"] == 2
    assert listing(client, "country=NL&unknown_country=true&search=Unknown")["total"] == 1
    options = client.get("/api/v1/explore/brewery-countries?limit=1").json()
    assert options == {"items": ["BE"], "has_more": True, "unknown_available": True}
    assert client.get("/api/v1/explore/brewery-countries?search=%25").json()["items"] == []
    assert [r["country"] for r in listing(client, "sort=location_asc")["items"]][:2] == ["BE", "NL"]
    assert [r["country"] for r in listing(client, "sort=location_desc")["items"]][:2] == [
        "NL",
        "BE",
    ]
    rows = listing(client, "sort=checkins_desc")["items"]
    assert [r["id"] for r in rows] == sorted(r["id"] for r in rows)


def test_distribution_boundaries_and_style_ranking(client):
    beer = _beer("Boundaries", brewery="Buckets", style="IPA")
    for index, rating in enumerate(
        [
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
    ):
        _checkin(_user_id(), beer, str(index), 0, rating)
    for index in range(7):
        extra = _beer(f"Extra {index}", style=f"Style {index}")
        attach(extra, brewery(beer))
        _checkin(_user_id(), extra, f"extra{index}", 0, 4)
    result = client.get(f"/api/v1/explore/breweries/{brewery(beer)}").json()
    assert [b["count"] for b in result["rating_distribution"]] == [2] * 8 + [9, 3]
    assert sum(b["count"] for b in result["rating_distribution"]) == result["rated_checkin_count"]
    assert len(result["highest_rated_beers"]) == 5
    assert len(result["most_explored_styles"]) == 5
    assert [s["name"] for s in result["most_explored_styles"]] == [
        "IPA",
        "Style 0",
        "Style 1",
        "Style 2",
        "Style 3",
    ]


@pytest.mark.parametrize(
    "day,start,end",
    [
        ("2026-03-29", "2026-03-28T23:00:00", "2026-03-29T22:00:00"),
        ("2026-10-25", "2026-10-24T22:00:00", "2026-10-25T23:00:00"),
    ],
)
def test_lifetime_dates_and_dst(client, day, start, end):
    for i, timestamp in enumerate([start, end]):
        beer = _beer(str(i), brewery=str(i))
        _checkin(_user_id(), beer, str(i), 0, 4)
        with SessionLocal() as session:
            session.scalar(
                select(Checkin).where(Checkin.beer_id == beer)
            ).occurred_at_utc = datetime.fromisoformat(timestamp).replace(tzinfo=UTC)
            session.commit()
    for prefix in ["first_tried", "last_tried"]:
        result = listing(client, f"{prefix}_from={day}&{prefix}_to={day}")
        assert result["total"] == 1 and result["items"][0]["name"] == "0"
    beer = _beer("Lifetime", brewery="Lifetime")
    _checkin(_user_id(), beer, "old", -365, 0)
    _checkin(_user_id(), beer, "new", 300, 5)
    result = listing(client, "last_tried_from=2026-10-01&search=Lifetime")
    assert result["items"][0]["personal_average_rating"] == 2.5
    assert listing(client, "first_tried_from=2026-01-01&search=Lifetime")["total"] == 0


@pytest.mark.parametrize(
    "query",
    [
        "min_checkins=0",
        "min_unique_beers=-1",
        "min_checkins=1.5",
        "page=0",
        "page_size=101",
        "sort=abv_desc",
        "rating_min=-1",
        "rating_max=5.01",
        "rating_min=4.001",
        "rating_min=4&rating_max=3",
        "first_tried_from=2026-02-30",
        "last_tried_from=2026-02-02&last_tried_to=2026-01-01",
        "last_tried_to=9999-12-31",
    ],
)
def test_invalid_brewery_queries(client, query):
    assert client.get(f"/api/v1/explore/breweries?{query}").status_code == 422


@pytest.mark.parametrize("identifier", ["0", "-1", "abc", "9223372036854775808"])
def test_invalid_brewery_ids(client, identifier):
    assert client.get(f"/api/v1/explore/breweries/{identifier}").status_code == 422


@pytest.mark.parametrize("identifier", ["0", "-1", "../x", "765?x=1", "abc"])
def test_invalid_external_link_and_unrated_detail(client, identifier):
    beer = _beer("Unrated", brewery="Unrated")
    _checkin(_user_id(), beer, "unrated", 0)
    with SessionLocal() as session:
        row = session.get(Brewery, brewery(beer))
        row.source_system, row.external_id = "untappd", identifier
        session.commit()
    result = client.get(f"/api/v1/explore/breweries/{brewery(beer)}").json()
    assert result["untappd_url"] is None
    assert result["personal_average_rating"] is None
    assert result["lowest_rating"] is None and result["highest_rating"] is None
    assert result["highest_rated_beers"] == []
    assert [b["count"] for b in result["rating_distribution"]] == [0] * 10
