import csv
from io import StringIO

from sqlalchemy import select

from backend.app.db import SessionLocal
from backend.app.models import User
from backend.app.services.import_service import ImportService


def local_user_id() -> int:
    with SessionLocal() as session:
        return session.scalar(select(User.id).where(User.username == "local"))


def stash_csv(*rows: dict[str, str]) -> bytes:
    fields = [
        "item_id",
        "beer_name",
        "brewery_name",
        "beer_type",
        "beer_abv",
        "beer_ibu",
        "created_at",
        "notes",
        "quantity",
        "container",
        "purchase_date",
        "bottled_date",
        "best_by_date",
        "best_by_date_iso",
        "purchase_location",
        "purchase_price",
        "photo",
    ]
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue().encode()


def stash_row(
    item_id: str,
    name: str,
    brewery: str = "Brewery",
    style: str = "Pilsner",
    notes: str = "back shelf",
    quantity: str = "1",
) -> dict[str, str]:
    return {
        "item_id": item_id,
        "beer_name": name,
        "brewery_name": brewery,
        "beer_type": style,
        "beer_abv": "5.0",
        "beer_ibu": "25",
        "created_at": "2026-10-06T12:00:00+00:00",
        "notes": notes,
        "quantity": quantity,
        "container": "Bottle",
        "purchase_date": "2026-09-01",
        "bottled_date": "0000-00-00 00:00:00",
        "best_by_date_iso": "2100-01-01",
        "purchase_location": "Shop",
        "purchase_price": "4.50",
        "photo": "https://image.example/beer.jpg",
    }


def test_inventory_api_paginates_and_keeps_records_distinct(client):
    ImportService().import_inventory(
        local_user_id(),
        "stash.csv",
        stash_csv(
            stash_row("item-1", "Alpha", quantity="2"),
            stash_row("item-2", "Alpha", quantity="3", notes="cellar"),
            stash_row("item-3", "Beta"),
        ),
        confirmed=True,
    )

    first = client.get("/api/v1/inventory?page=1&page_size=2&sort=beer_name_asc")
    second = client.get("/api/v1/inventory?page=2&page_size=2&sort=beer_name_asc")

    assert first.status_code == 200
    assert first.json()["total"] == 3
    assert first.json()["total_pages"] == 2
    assert [item["source_item_id"] for item in first.json()["items"]] == ["item-1", "item-2"]
    assert [item["source_item_id"] for item in second.json()["items"]] == ["item-3"]
    assert first.json()["items"][0]["quantity"] == 2
    assert first.json()["items"][0]["best_before_suspicious"] is True


def test_inventory_api_searches_beer_brewery_and_notes(client):
    ImportService().import_inventory(
        local_user_id(),
        "stash.csv",
        stash_csv(
            stash_row("item-1", "Alpha", brewery="North Works", notes="garden box"),
            stash_row("item-2", "Beta", brewery="South Works", notes="cellar shelf"),
        ),
        confirmed=True,
    )

    assert client.get("/api/v1/inventory?search=alpha").json()["total"] == 1
    assert client.get("/api/v1/inventory?search=north%20works").json()["total"] == 1
    assert client.get("/api/v1/inventory?search=cellar").json()["total"] == 1
    assert client.get("/api/v1/inventory?match_status=unmatched").json()["total"] == 2


def test_inventory_api_detail_and_validation(client):
    ImportService().import_inventory(
        local_user_id(), "stash.csv", stash_csv(stash_row("item-1", "Alpha")), True
    )

    detail = client.get("/api/v1/inventory/1")
    assert detail.status_code == 200
    assert detail.json()["source_item_id"] == "item-1"
    assert detail.json()["source_metadata"] is None
    assert client.get("/api/v1/inventory/999").status_code == 404
    assert client.get("/api/v1/inventory?page_size=101").status_code == 422
    assert client.get("/api/v1/inventory?sort=not_a_column").status_code == 422
