from datetime import UTC, datetime
from decimal import Decimal

import pytest
from sqlalchemy import select, text

from backend.app.db import SessionLocal
from backend.app.models import Brewery, Checkin, InventoryItem, InventorySource, User, Venue
from backend.tests.test_explore_api import _beer, _checkin, _set_beer, _user_id


def test_complete_detail_and_history(client):
    beer_id = _beer("Precise beer", brewery="Local Brewery", style="IPA")
    _set_beer(beer_id, source_system="untappd", external_id="4509", abv=Decimal("6.50"), ibu=55)
    user = _user_id()
    for index, rating in enumerate([0, None, 4.1, 4.2]):
        _checkin(user, beer_id, str(100 + index), 0, rating)
    with SessionLocal() as session:
        brewery = session.scalar(select(Brewery))
        brewery.city, brewery.state, brewery.country = "Amsterdam", "NH", "Netherlands"
        venue = Venue(source_system="untappd", name="The taproom", city="Haarlem", country="NL")
        session.add(venue)
        session.flush()
        checkins = session.scalars(select(Checkin).order_by(Checkin.id)).all()
        for checkin in checkins:
            checkin.source_system = "untappd"
            checkin.source_payload_json = '{"secret": "bookkeeping"}'
        last = checkins[-1]
        last.venue_id = venue.id
        last.purchase_venue = "Bottle shop"
        last.serving_type = "Bottle"
        last.comment = "First line\n<script>alert('x')</script>"
        last.photo_url = "https://example.test/checkin.jpg"
        ids = [row.id for row in checkins]
        session.commit()
    detail = client.get(f"/api/v1/explore/beers/{beer_id}").json()
    assert detail["name"] == "Precise beer"
    assert detail["abv"] == 6.5 and detail["ibu"] == 55
    assert detail["brewery"]["city"] == "Amsterdam"
    assert detail["style"]["name"] == "IPA"
    assert detail["checkin_count"] == 4 and detail["rated_checkin_count"] == 3
    assert detail["personal_average_rating"] == float(Decimal(830) / 300)
    assert detail["highest_rating"] == 4.2 and detail["lowest_rating"] == 0
    assert detail["first_checked_in_at"] == detail["last_checked_in_at"]
    assert detail["first_checked_in_at"].endswith("+00:00")
    assert [point["id"] for point in detail["rating_history"]] == [ids[0], ids[2], ids[3]]
    assert [point["rating"] for point in detail["rating_history"]] == [0, 4.1, 4.2]
    assert all(
        set(point) == {"id", "rating", "occurred_at_utc"} for point in detail["rating_history"]
    )
    assert detail["untappd_url"] == "https://untappd.com/beer/4509"
    newest = client.get(f"/api/v1/explore/beers/{beer_id}/checkins?page_size=2").json()
    assert [item["id"] for item in newest["items"]] == list(reversed(ids[2:]))
    assert newest["total"] == 4 and newest["total_pages"] == 2
    entry = newest["items"][0]
    assert entry["venue"]["name"] == "The taproom" and entry["venue"]["city"] == "Haarlem"
    assert entry["purchase_venue"] == "Bottle shop"
    assert entry["comment"] == "First line\n<script>alert('x')</script>"
    assert entry["serving_type"] == "Bottle"
    assert entry["photo_url"].endswith("checkin.jpg")
    assert entry["untappd_url"] == "https://untappd.com/c/103"
    assert "user_id" not in entry and "source_payload_json" not in entry
    second = client.get(f"/api/v1/explore/beers/{beer_id}/checkins?page_size=2&page=2").json()
    assert [item["id"] for item in second["items"]] == list(reversed(ids[:2]))
    oldest = client.get(f"/api/v1/explore/beers/{beer_id}/checkins?page_size=2&sort=oldest").json()
    assert [item["id"] for item in oldest["items"]] == ids[:2]
    normalized = client.get(f"/api/v1/explore/beers/{beer_id}/checkins?page_size=2&page=999").json()
    assert normalized["page"] == 2
    assert client.get(f"/api/v1/explore/beers/{beer_id}").json() == detail


@pytest.mark.parametrize("ratings", [[None, None], [0], [3.75], [4.2, 4.1, 4.5]])
def test_rating_edges_and_sparse_metadata(client, ratings):
    beer = _beer("Sparse")
    for index, rating in enumerate(ratings):
        _checkin(_user_id(), beer, str(index), len(ratings) - index, rating)
    result = client.get(f"/api/v1/explore/beers/{beer}").json()
    rated = [Decimal(str(r)) for r in ratings if r is not None]
    expected = float(sum(rated) / len(rated)) if rated else None
    assert result["personal_average_rating"] == expected
    assert result["highest_rating"] == (float(max(rated)) if rated else None)
    assert result["lowest_rating"] == (float(min(rated)) if rated else None)
    assert result["rated_checkin_count"] == len(rated)
    assert result["brewery"] is None and result["style"] is None
    assert result["abv"] is None and result["ibu"] is None and result["photo_url"] is None
    assert result["untappd_url"] is None
    points = result["rating_history"]
    assert len(points) == len(rated)
    assert points == sorted(points, key=lambda p: (p["occurred_at_utc"], p["id"]))
    history = client.get(f"/api/v1/explore/beers/{beer}/checkins").json()["items"]
    assert all(
        row["venue"] is None and row["purchase_venue"] is None and row["photo_url"] is None
        for row in history
    )


def test_detail_isolation_and_inventory_only(client):
    own, other_only, inventory_only = [_beer(name) for name in ["Shared", "Other", "Inventory"]]
    local = _user_id()
    with SessionLocal() as session:
        other = User(username="other")
        session.add(other)
        session.flush()
        other_id = other.id
        source = InventorySource(user_id=local, source_system="test", name="stash")
        session.add(source)
        session.flush()
        session.add(
            InventoryItem(
                user_id=local,
                inventory_source_id=source.id,
                source_item_id="1",
                beer_id=inventory_only,
                quantity=1,
            )
        )
        session.commit()
    _checkin(local, own, "own", 0, 4)
    _checkin(other_id, own, "private", 5, 1)
    _checkin(other_id, other_only, "other-only", 5, 5)
    result = client.get(f"/api/v1/explore/beers/{own}").json()
    assert result["checkin_count"] == 1 and result["personal_average_rating"] == 4
    assert len(result["rating_history"]) == 1
    assert client.get(f"/api/v1/explore/beers/{own}/checkins").json()["total"] == 1
    for beer in [other_only, inventory_only, 9999]:
        for suffix in ["", "/checkins"]:
            assert client.get(f"/api/v1/explore/beers/{beer}{suffix}").status_code == 404
    client.cookies.clear()
    for suffix in ["", "/checkins"]:
        assert client.get(f"/api/v1/explore/beers/{own}{suffix}").status_code == 401


@pytest.mark.parametrize("identifier", ["0", "-1", "abc", "9223372036854775808"])
def test_invalid_detail_ids(client, identifier):
    for suffix in ["", "/checkins"]:
        assert client.get(f"/api/v1/explore/beers/{identifier}{suffix}").status_code == 422


@pytest.mark.parametrize(
    "query",
    [
        "page=0",
        "page=-1",
        "page=2147483648",
        "page=x",
        "page_size=0",
        "page_size=101",
        "sort=unknown",
    ],
)
def test_invalid_history_queries(client, query):
    assert client.get(f"/api/v1/explore/beers/1/checkins?{query}").status_code == 422


@pytest.mark.parametrize(
    "source,identifier,linked",
    [
        ("untappd", "12", True),
        ("untappd", "0", False),
        ("untappd", "12/evil", False),
        ("untappd", "１２", False),
        ("test", "12", False),
    ],
)
def test_source_link_validation(client, source, identifier, linked):
    beer = _beer("Original")
    _set_beer(beer, source_system=source, external_id=identifier)
    _checkin(_user_id(), beer, "checkin", 0)
    detail = client.get(f"/api/v1/explore/beers/{beer}").json()
    assert bool(detail["untappd_url"]) is linked


def test_chart_is_complete_and_query_uses_user_index(client):
    beer = _beer("Long history")
    with SessionLocal() as session:
        session.add_all(
            [
                Checkin(
                    user_id=_user_id(),
                    beer_id=beer,
                    source_system="test",
                    external_id=str(i),
                    occurred_at_utc=datetime(2026, 1, 1, tzinfo=UTC),
                    rating=Decimal("3.75"),
                )
                for i in range(103)
            ]
        )
        session.commit()
        plan = session.execute(
            text(
                "EXPLAIN QUERY PLAN SELECT id FROM checkins "
                "WHERE user_id=:user AND beer_id=:beer "
                "ORDER BY occurred_at_utc, id LIMIT 25"
            ),
            {"user": _user_id(), "beer": beer},
        ).all()
        assert any("INDEX" in str(row) and "user_id" in str(row) for row in plan)
    assert len(client.get(f"/api/v1/explore/beers/{beer}").json()["rating_history"]) == 103
    history = client.get(f"/api/v1/explore/beers/{beer}/checkins?page=5").json()
    assert history["page"] == 5 and len(history["items"]) == 3
