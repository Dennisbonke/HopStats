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
    assert client.get("/api/v1/explore/beers?sort=unknown_desc").status_code == 422


def _set_beer(beer_id, **values):
    with SessionLocal() as session:
        row = session.get(Beer, beer_id)
        for key, value in values.items():
            setattr(row, key, value)
        session.commit()


def test_advanced_filters_precision_combination_and_missing_data(client):
    user = _user_id()
    ids = []
    for index, rating in enumerate([0, 3.70, 3.75, 4.10, 5.00, None]):
        beer_id = _beer(f"Beer {index}", brewery=f"Brewery {index}", style=f"Style {index}")
        ids.append(beer_id)
        _set_beer(beer_id, abv=Decimal(str(index + 4)))
        _checkin(user, beer_id, f"advanced-{index}", index, rating)
    missing = _beer("Missing")
    _checkin(user, missing, "missing", 10)
    precise = _beer("Precise")
    _set_beer(precise, abv=Decimal("67.50"))
    for index, rating in enumerate([4.00, 4.20, 4.50, None]):
        _checkin(user, precise, f"precise-{index}", index, rating)
    zero_average = _beer("Zero included")
    _checkin(user, zero_average, "zero-0", 0, 0)
    _checkin(user, zero_average, "zero-5", 1, 5)

    def get(**params):
        response = client.get("/api/v1/explore/beers", params=params)
        assert response.status_code == 200, response.text
        return response.json()

    for index, rating in enumerate([0, 3.70, 3.75, 4.10, 5.00]):
        assert [i["id"] for i in get(rating_min=rating, rating_max=rating)["items"]] == [ids[index]]
    assert [i["id"] for i in get(rating_min=4.23, rating_max=4.24)["items"]] == [precise]
    assert precise not in [i["id"] for i in get(rating_max=4.23)["items"]]
    result = get(search="Precise")["items"][0]
    assert abs(result["personal_average_rating"] - 4.233333333333) < 1e-10
    assert result["rated_checkin_count"] == 3 and result["checkin_count"] == 4
    assert get(search="Zero included")["items"][0]["personal_average_rating"] == 2.5
    assert get()["total"] == 9
    assert get(abv_min=0)["total"] == 7
    assert get(rating_min=0)["total"] == 7
    assert [i["id"] for i in get(abv_min=5, abv_max=6)["items"]] == [ids[2], ids[1]]
    assert get(abv_min=67.5, abv_max=67.5)["items"][0]["id"] == precise
    with SessionLocal() as session:
        rows = [session.get(Beer, id) for id in ids]
        breweries = [b.brewery_id for b in rows]
        styles = [b.style_id for b in rows]
    assert get(brewery_id=breweries[:2])["total"] == 2
    assert get(style_id=styles[:2])["total"] == 2
    combined = get(
        brewery_id=breweries[:3],
        style_id=styles[1:4],
        rating_min=3.7,
        abv_max=6,
        search="beer",
        page_size=1,
        page=2,
    )
    assert combined["total"] == 2 and combined["total_pages"] == 2
    assert combined["items"][0]["id"] == ids[1]
    assert get(brewery_id=breweries[:1], style_id=styles[1:2])["total"] == 0


def test_advanced_sort_modes_nulls_and_ties(client):
    user = _user_id()
    a = _beer("alpha", brewery="alpha brewery", style="alpha style")
    b = _beer("Beta", brewery="Beta brewery", style="Beta style")
    missing = _beer("zz missing")
    twin = _beer("ALPHA")
    _set_beer(a, abv=Decimal("4.10"))
    _set_beer(b, abv=Decimal("5.00"))
    _checkin(user, a, "sort-a", 0, 3.7)
    _checkin(user, b, "sort-b", 1, 4.1)
    _checkin(user, b, "sort-b-repeat", 2, 5)
    _checkin(user, missing, "sort-missing", 3)
    _checkin(user, twin, "sort-twin", 4)
    for field in [
        "name",
        "brewery",
        "style",
        "abv",
        "rating",
        "first_tried",
        "last_tried",
        "checkins",
    ]:
        for direction in ["asc", "desc"]:
            data = client.get(f"/api/v1/explore/beers?sort={field}_{direction}").json()
            items = data["items"]
            key = {
                "name": "name",
                "brewery": "brewery",
                "style": "style",
                "abv": "abv",
                "rating": "personal_average_rating",
                "first_tried": "first_checked_in_at",
                "last_tried": "last_checked_in_at",
                "checkins": "checkin_count",
            }[field]

            def value(item, key=key):
                v = item[key]
                if isinstance(v, dict):
                    v = v["name"]
                return v.lower() if isinstance(v, str) else v

            expected = sorted(items, key=lambda i: i["id"])
            expected = sorted(
                [i for i in expected if value(i) is not None],
                key=value,
                reverse=direction == "desc",
            ) + [i for i in expected if value(i) is None]
            assert [i["id"] for i in items] == [i["id"] for i in expected]


def test_filter_dates_inclusive_amsterdam_and_dst(client):
    user = _user_id()
    ids = [_beer(f"Boundary {i}") for i in range(4)]
    # Amsterdam DST start: local 2026-03-29 has 23 hours.
    moments = [
        "2026-03-28T22:59:59",
        "2026-03-28T23:00:00",
        "2026-03-29T21:59:59",
        "2026-03-29T22:00:00",
    ]
    with SessionLocal() as session:
        for id, moment in zip(ids, moments, strict=True):
            session.add(
                Checkin(
                    user_id=user,
                    source_system="test",
                    external_id=f"boundary-{id}",
                    beer_id=id,
                    occurred_at_utc=datetime.fromisoformat(moment),
                )
            )
        session.commit()
    for field in ["first_tried", "last_tried"]:
        result = client.get(
            "/api/v1/explore/beers",
            params={f"{field}_from": "2026-03-29", f"{field}_to": "2026-03-29"},
        ).json()
        assert {i["id"] for i in result["items"]} == set(ids[1:3])
    _checkin(user, ids[1], "boundary-repeat", 200)
    assert client.get("/api/v1/explore/beers?first_tried_to=2026-03-29").json()["total"] == 3
    assert client.get("/api/v1/explore/beers?last_tried_to=2026-03-29").json()["total"] == 2


def test_filter_options_scoped_bounded_searchable_and_authenticated(client):
    local = _beer("Local", brewery="Local brewery", style="Local style")
    _set_beer(local, abv=Decimal("67.50"))
    _checkin(_user_id(), local, "options-local", 0)
    with SessionLocal() as session:
        other = User(username="other")
        session.add(other)
        session.commit()
        other_id = other.id
    other_beer = _beer("Other", brewery="Secret brewery", style="Secret style")
    _checkin(other_id, other_beer, "options-other", 0)
    for category in ["breweries", "styles"]:
        url = f"/api/v1/explore/filter-options/{category}"
        result = client.get(url).json()
        assert len(result["items"]) == 1
        assert result["items"][0]["name"].startswith("Local")
        assert client.get(url, params={"search": "SECRET"}).json()["items"] == []
        assert len(client.get(url, params={"search": "LOCAL"}).json()["items"]) == 1
        assert client.get(url, params={"selected_id": 99999}).json()["items"] == []
        assert client.get(url, params={"offset": 1}).json()["items"] == []
        assert client.get(url, params={"limit": 101}).status_code == 422
    # Multiple beers/check-ins sharing an entity must not duplicate options.
    shared = _beer("Another local beer")
    with SessionLocal() as session:
        source = session.get(Beer, local)
        brewery_id, style_id = source.brewery_id, source.style_id
    _set_beer(shared, brewery_id=brewery_id, style_id=style_id)
    _checkin(_user_id(), shared, "options-shared-1", 0)
    _checkin(_user_id(), shared, "options-shared-2", 1)
    another = _beer("Additional", brewery="Additional brewery", style="Additional style")
    _checkin(_user_id(), another, "options-additional", 0)
    for category in ["breweries", "styles"]:
        url = f"/api/v1/explore/filter-options/{category}"
        first = client.get(url, params={"limit": 1}).json()
        second = client.get(url, params={"limit": 1, "offset": 1}).json()
        assert first["has_more"] is True and second["has_more"] is False
        assert first["items"][0]["name"].startswith("Additional")
        assert second["items"][0]["name"].startswith("Local")
        assert client.get(url, params={"offset": 2}).json()["items"] == []
        assert client.get(url, params={"offset": 9223372036854775808}).status_code == 422
    assert client.get("/api/v1/explore/filter-bounds").json()["abv_max"] == 67.5
    client.cookies.clear()
    for path in ["beers", "filter-options/styles", "filter-options/breweries", "filter-bounds"]:
        assert client.get(f"/api/v1/explore/{path}").status_code == 401


def test_invalid_advanced_parameters(client):
    for query in [
        "brewery_id=0",
        "style_id=-1",
        "style_id=no",
        "abv_min=-1",
        "abv_min=nan",
        "abv_max=inf",
        "abv_min=10&abv_max=5",
        "rating_min=-0.01",
        "rating_max=5.01",
        "rating_min=4&rating_max=3",
        "first_tried_from=invalid",
        "first_tried_from=2026-05-01&first_tried_to=2026-01-01",
        "last_tried_from=2026-05-01&last_tried_to=2026-01-01",
        "last_tried_to=9999-12-31",
        "sort=invalid",
    ]:
        assert client.get(f"/api/v1/explore/beers?{query}").status_code == 422, query
