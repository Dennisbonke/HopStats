import csv
from io import StringIO

from sqlalchemy import select

from backend.app.db import SessionLocal
from backend.app.models import InventoryItem, User
from backend.app.services.import_service import ImportService


def checkin_csv(*rows: dict[str, str]) -> bytes:
    fields = [
        "beer_name",
        "brewery_name",
        "beer_type",
        "beer_abv",
        "beer_ibu",
        "rating_score",
        "created_at",
        "timezone_offset",
        "checkin_id",
        "bid",
        "brewery_id",
    ]
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue().encode()


def checkin_row(
    checkin_id: str,
    bid: str,
    name: str,
    brewery: str,
    style: str = "",
    rating: str = "",
    brewery_id: str | None = None,
) -> dict[str, str]:
    return {
        "beer_name": name,
        "brewery_name": brewery,
        "beer_type": style,
        "beer_abv": "5.00",
        "beer_ibu": "25",
        "rating_score": rating,
        "created_at": "2026-09-29T20:00:00-07:00",
        "timezone_offset": "-420",
        "checkin_id": checkin_id,
        "bid": bid,
        "brewery_id": brewery_id or f"brew-{brewery.casefold().replace(' ', '-')}",
    }


def stash_csv(*rows: dict[str, str]) -> bytes:
    fields = [
        "item_id",
        "beer_name",
        "brewery_name",
        "beer_type",
        "beer_abv",
        "beer_ibu",
        "quantity",
    ]
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue().encode()


def stash_row(item_id: str, name: str, brewery: str, quantity: str = "1") -> dict[str, str]:
    return {
        "item_id": item_id,
        "beer_name": name,
        "brewery_name": brewery,
        "beer_type": "Lager",
        "beer_abv": "5.00",
        "beer_ibu": "25",
        "quantity": quantity,
    }


def local_user_id() -> int:
    with SessionLocal() as session:
        return session.scalar(select(User.id).where(User.username == "local"))


def test_empty_dashboard(client):
    response = client.get("/api/v1/dashboard")
    assert response.status_code == 200
    data = response.json()
    assert data["total_checkins"] == 0
    assert data["average_personal_rating"] is None
    assert data["rated_checkins"] == 0
    assert data["inventory_units"] == 0
    assert data["unique_inventory_beers"] == 0
    assert data["not_confirmed_checked_in"] == 0
    assert data["match_coverage"] == {
        "external_id": 0,
        "exact": 0,
        "ambiguous": 0,
        "unmatched": 0,
    }
    assert data["freshness"]["checkins_last_imported_at"] is None
    assert data["freshness"]["inventory_last_imported_at"] is None


def test_dashboard_freshness_timestamps_include_utc_offset(client):
    service = ImportService()
    user_id = local_user_id()
    service.import_checkins(
        user_id,
        "checkins.csv",
        checkin_csv(checkin_row("c1", "b1", "Beer One", "Brewery A", "Lager")),
    )
    service.import_inventory(
        user_id,
        "stash.csv",
        stash_csv(stash_row("i1", "Beer One", "Brewery A")),
        True,
    )

    freshness = client.get("/api/v1/dashboard").json()["freshness"]
    assert freshness["checkins_last_imported_at"].endswith("+00:00")
    assert freshness["inventory_last_imported_at"].endswith("+00:00")


def test_dashboard_aggregates_checkins_and_inventory_identities(client):
    service = ImportService()
    user_id = local_user_id()
    service.import_checkins(
        user_id,
        "checkins.csv",
        checkin_csv(
            checkin_row("c1", "b1", "Beer One", "Brewery A", "Lager", "4.0"),
            checkin_row("c2", "b1", "Beer One", "Brewery A", "Lager"),
            checkin_row("c3", "b2", "Beer Two", "Brewery B", "IPA", "5.0", brewery_id="brew-b"),
            checkin_row("c4", "b3", "Beer Three", "Brewery B", brewery_id="brew-b"),
            checkin_row("c5", "ambig-1", "Ambig", "Brewery C", "Lager"),
            checkin_row("c6", "ambig-2", "Ambig", "Brewery C", "Lager"),
        ),
    )
    service.import_inventory(
        user_id,
        "stash.csv",
        stash_csv(
            stash_row("i1", "Beer One", "Brewery A", "2"),
            stash_row("i2", "Beer One", "Brewery A", "3"),
            stash_row("i3", "Ambig", "Brewery C"),
            stash_row("i4", "No Match", "Unknown Brewery"),
        ),
        True,
    )
    with SessionLocal() as session:
        shared = session.scalars(
            select(InventoryItem).where(InventoryItem.source_item_id.in_(["i1", "i2"]))
        ).all()
        shared[0].match_status = "ambiguous"
        shared[1].match_status = "exact"
        unmatched = session.scalar(
            select(InventoryItem).where(InventoryItem.source_item_id == "i4")
        )
        unmatched.match_status = "external_id"
        session.commit()

    data = client.get("/api/v1/dashboard").json()
    assert data["total_checkins"] == 6
    assert data["unique_beers"] == 5
    assert data["unique_breweries"] == 3
    assert data["unique_styles"] == 2
    assert data["average_personal_rating"] == 4.5
    assert data["rated_checkins"] == 2
    assert data["inventory_units"] == 7
    assert data["unique_inventory_beers"] == 3
    assert data["not_confirmed_checked_in"] == 1
    assert data["match_coverage"] == {
        "external_id": 1,
        "exact": 1,
        "ambiguous": 1,
        "unmatched": 0,
    }


def test_dashboard_isolation_freshness_and_failed_imports(client):
    service = ImportService()
    user_id = local_user_id()
    service.import_checkins(
        user_id,
        "checkins.csv",
        checkin_csv(checkin_row("c1", "b1", "Beer One", "Brewery A", "Lager", "4.0")),
    )
    before = client.get("/api/v1/dashboard").json()
    failed = service.import_checkins(
        user_id,
        "bad.csv",
        checkin_csv(
            checkin_row("c2", "b2", "Beer Two", "Brewery B"),
            checkin_row("c2", "b3", "Beer Three", "Brewery C"),
        ),
    )
    assert failed.status == "failed"
    after = client.get("/api/v1/dashboard").json()
    assert after["total_checkins"] == before["total_checkins"]
    assert after["freshness"] == before["freshness"]

    with SessionLocal() as session:
        other = User(username="other")
        session.add(other)
        session.commit()
        other_id = other.id
    service.import_checkins(
        other_id,
        "other.csv",
        checkin_csv(checkin_row("other-1", "other-b", "Other", "Other Brewery", "IPA")),
    )
    assert client.get("/api/v1/dashboard").json()["total_checkins"] == 1


def test_snapshot_replacement_updates_dashboard_inventory_counts(client):
    service = ImportService()
    user_id = local_user_id()
    service.import_inventory(
        user_id,
        "stash.csv",
        stash_csv(
            stash_row("i1", "Beer One", "Brewery A", "4"), stash_row("i2", "Beer Two", "Brewery B")
        ),
        True,
    )
    first = client.get("/api/v1/dashboard").json()
    assert (first["inventory_units"], first["unique_inventory_beers"]) == (5, 2)
    service.import_inventory(
        user_id,
        "stash.csv",
        stash_csv(stash_row("i1", "Beer One", "Brewery A", "1")),
        True,
        allow_undated=True,
    )
    second = client.get("/api/v1/dashboard").json()
    assert (second["inventory_units"], second["unique_inventory_beers"]) == (1, 1)
