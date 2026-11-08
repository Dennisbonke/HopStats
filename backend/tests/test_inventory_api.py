import csv
from datetime import date
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


def test_inventory_api_sorts_new_fields_and_keeps_missing_values_last(client):
    from backend.app.db import SessionLocal
    from backend.app.models import Beer, BeerStyle, Brewery, InventoryItem

    ImportService().import_inventory(
        local_user_id(),
        "stash.csv",
        stash_csv(
            stash_row("item-low", "Low", brewery="zeta", style="pilsner"),
            stash_row("item-high", "High", brewery="Alpha", style="Ale"),
            stash_row("item-mid", "Mid", brewery="Malt", style="Lager"),
        ),
        confirmed=True,
    )
    with SessionLocal() as session:
        records = session.query(InventoryItem).all()
        abvs = {"item-low": 2.5, "item-high": 12.0, "item-mid": 6.0}
        dates = {
            "item-low": date(2025, 1, 1),
            "item-high": date(2028, 1, 1),
            "item-mid": None,
        }
        for record in records:
            beer = session.get(Beer, record.beer_id)
            beer.abv = abvs[record.source_item_id]
            record.best_before = dates[record.source_item_id]
            brewery = session.get(Brewery, beer.brewery_id)
            brewery.name = {
                "item-low": "zeta",
                "item-high": "Alpha",
                "item-mid": "Malt",
            }[record.source_item_id]
            style = session.get(BeerStyle, beer.style_id)
            style.name = {
                "item-low": "pilsner",
                "item-high": "Ale",
                "item-mid": "Lager",
            }[record.source_item_id]
        session.commit()

    def ids(sort: str, page: int = 1, page_size: int = 25):
        response = client.get(f"/api/v1/inventory?sort={sort}&page={page}&page_size={page_size}")
        assert response.status_code == 200
        return [row["source_item_id"] for row in response.json()["items"]]

    assert ids("abv_asc") == ["item-low", "item-mid", "item-high"]
    assert ids("abv_desc") == ["item-high", "item-mid", "item-low"]
    assert ids("best_before_asc") == ["item-low", "item-high", "item-mid"]
    assert ids("best_before_desc") == ["item-high", "item-low", "item-mid"]
    assert ids("brewery_asc") == ["item-high", "item-mid", "item-low"]
    assert ids("brewery_desc") == ["item-low", "item-mid", "item-high"]
    assert ids("style_asc") == ["item-high", "item-mid", "item-low"]
    assert ids("style_desc") == ["item-low", "item-mid", "item-high"]
    assert ids("abv_asc", page=1, page_size=2) == ["item-low", "item-mid"]
    assert ids("abv_asc", page=2, page_size=2) == ["item-high"]
    assert ids("abv_asc") == ids("abv_asc", page=1, page_size=25)


def test_inventory_api_grouped_pagination_keeps_complete_group_counts(client):
    rows = [
        stash_row(f"item-{index:02d}", f"Beer {index:02d}", style="Pilsner") for index in range(27)
    ]
    rows.extend(
        [
            stash_row("item-legitimate-unknown", "Beer Unknown", style="Unknown style"),
            stash_row("item-unknown-a", "Unknown A", style=""),
            stash_row("item-unknown-b", "Unknown B", style=""),
        ]
    )
    ImportService().import_inventory(
        local_user_id(),
        "stash.csv",
        stash_csv(*rows),
        confirmed=True,
    )

    pages = [
        client.get(
            f"/api/v1/inventory?group_by=style&sort=beer_name_asc&page={page}&page_size=25&search=back%20shelf"
        )
        for page in (1, 2)
    ]
    assert all(response.status_code == 200 for response in pages)
    first, second = [response.json() for response in pages]
    combined = first["items"] + second["items"]
    assert first["total"] == 30
    assert first["total_pages"] == 2
    assert len(first["items"]) == 25
    assert len(second["items"]) == 5
    assert len({item["id"] for item in combined}) == 30
    assert [item["beer_name"] for item in combined] == sorted(
        item["beer_name"] for item in combined
    )
    pilsner = next(group for group in first["style_groups"] if group["style_name"] == "Pilsner")
    legitimate_unknown = next(
        group
        for group in first["style_groups"]
        if group["style_name"] == "Unknown style" and group["style_id"] is not None
    )
    missing_style = next(group for group in first["style_groups"] if group["style_id"] is None)
    assert pilsner["total"] == 27
    assert legitimate_unknown["total"] == 1
    assert missing_style["total"] == 2
    assert first["style_groups"][-1]["style_id"] is None
    assert first["style_groups"] == second["style_groups"]
    assert client.get("/api/v1/inventory?group_by=other").status_code == 422
    assert client.get("/api/v1/inventory?group_by=style&page_size=101").status_code == 422


def test_inventory_api_sorts_displayed_location_paths_and_paginates(client):
    from backend.app.db import SessionLocal
    from backend.app.models import InventoryItem, Location

    ImportService().import_inventory(
        local_user_id(),
        "stash.csv",
        stash_csv(
            stash_row("at-alpha-b", "Beta", notes="location test"),
            stash_row("at-alpha-a", "Alpha", notes="location test"),
            stash_row("at-beta", "Gamma", notes="location test"),
            stash_row("at-missing", "Delta", notes="location test"),
        ),
        confirmed=True,
    )
    with SessionLocal() as session:
        user_id = local_user_id()
        alpha = Location(user_id=user_id, name="alpha")
        beta = Location(user_id=user_id, name="Beta")
        session.add_all([alpha, beta])
        session.flush()
        alpha_shelf = Location(user_id=user_id, parent_id=alpha.id, name="Shelf")
        beta_shelf = Location(user_id=user_id, parent_id=beta.id, name="Shelf")
        session.add_all([alpha_shelf, beta_shelf])
        session.flush()
        assignments = {
            "at-alpha-a": alpha_shelf.id,
            "at-alpha-b": alpha_shelf.id,
            "at-beta": beta_shelf.id,
            "at-missing": None,
        }
        for record in session.query(InventoryItem).all():
            record.location_id = assignments[record.source_item_id]
        session.commit()

    def ids(sort: str, page: int, page_size: int):
        response = client.get(
            f"/api/v1/inventory?sort={sort}&page={page}&page_size={page_size}&search=location%20test"
        )
        assert response.status_code == 200
        return [item["source_item_id"] for item in response.json()["items"]]

    assert ids("location_asc", 1, 2) == ["at-alpha-a", "at-alpha-b"]
    assert ids("location_asc", 2, 2) == ["at-beta", "at-missing"]
    assert ids("location_desc", 1, 3) == ["at-beta", "at-alpha-a", "at-alpha-b"]
    assert ids("location_desc", 2, 3) == ["at-missing"]
