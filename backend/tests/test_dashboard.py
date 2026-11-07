import csv
from datetime import datetime
from io import StringIO
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, select, text

from backend.app.db import SessionLocal
from backend.app.models import ImportRun, InventoryItem, User
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
    assert after["import_deltas"] == before["import_deltas"]

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


def test_dashboard_import_deltas_use_latest_successful_import_including_noop(client):
    service = ImportService()
    user_id = local_user_id()
    assert client.get("/api/v1/dashboard").json()["import_deltas"] == {
        "total_checkins": None,
        "unique_beers": None,
        "unique_breweries": None,
        "unique_styles": None,
    }

    first_payload = checkin_csv(checkin_row("c1", "b1", "Beer One", "Brewery A", "Lager"))
    first = service.import_checkins(user_id, "first.csv", first_payload)
    assert first.status == "completed"
    assert client.get("/api/v1/dashboard").json()["import_deltas"]["unique_beers"] is None

    second_payload = checkin_csv(
        checkin_row("c1", "b1", "Beer One", "Brewery A", "Lager"),
        checkin_row("c2", "b2", "Beer Two", "Brewery B", "IPA"),
    )
    second = service.import_checkins(user_id, "second.csv", second_payload)
    assert second.status == "completed"
    assert client.get("/api/v1/dashboard").json()["import_deltas"] == {
        "total_checkins": 1,
        "unique_beers": 1,
        "unique_breweries": 1,
        "unique_styles": 1,
    }

    no_op = service.import_checkins(user_id, "same.csv", second_payload)
    assert (no_op.inserted_count, no_op.updated_count, no_op.unchanged_count) == (0, 0, 2)
    assert client.get("/api/v1/dashboard").json()["import_deltas"] == {
        "total_checkins": 0,
        "unique_beers": 0,
        "unique_breweries": 0,
        "unique_styles": 0,
    }

    with SessionLocal() as session:
        stored = session.get(ImportRun, second.id)
        assert (
            stored.total_checkins_before,
            stored.total_checkins_after,
            stored.unique_beers_before,
            stored.unique_beers_after,
            stored.unique_breweries_before,
            stored.unique_breweries_after,
            stored.unique_styles_before,
            stored.unique_styles_after,
        ) == (1, 2, 1, 2, 1, 2, 1, 2)


def test_dashboard_import_deltas_support_corrected_metadata_decreases(client):
    service = ImportService()
    user_id = local_user_id()
    original = checkin_csv(
        checkin_row("c1", "b1", "Beer One", "Brewery A", "Lager"),
        checkin_row("c2", "b2", "Beer Two", "Brewery B", "IPA"),
    )
    service.import_checkins(user_id, "original.csv", original)

    corrected = checkin_csv(
        checkin_row("c1", "b2", "Beer Two", "Brewery B", "IPA"),
        checkin_row("c2", "b2", "Beer Two", "Brewery B", "IPA"),
    )
    service.import_checkins(user_id, "corrected.csv", corrected)
    assert client.get("/api/v1/dashboard").json()["import_deltas"] == {
        "total_checkins": 0,
        "unique_beers": -1,
        "unique_breweries": -1,
        "unique_styles": -1,
    }


def test_failed_checkin_transaction_does_not_save_snapshot_or_change_baseline(client, monkeypatch):
    service = ImportService()
    user_id = local_user_id()
    service.import_checkins(
        user_id, "first.csv", checkin_csv(checkin_row("c1", "b1", "Beer One", "Brewery A"))
    )
    service.import_checkins(
        user_id,
        "second.csv",
        checkin_csv(
            checkin_row("c1", "b1", "Beer One", "Brewery A"),
            checkin_row("c2", "b2", "Beer Two", "Brewery B"),
        ),
    )
    before = client.get("/api/v1/dashboard").json()
    assert before["import_deltas"]["total_checkins"] == 1

    def fail_after_checkin_writes(_session, _user_id):
        raise RuntimeError("synthetic reconciliation failure")

    monkeypatch.setattr(
        "backend.app.services.inventory_snapshots.reconcile_inventory_matches",
        fail_after_checkin_writes,
    )
    failed = service.import_checkins(
        user_id, "second.csv", checkin_csv(checkin_row("c2", "b2", "Beer Two", "Brewery B"))
    )
    after = client.get("/api/v1/dashboard").json()

    assert failed.status == "failed"
    assert after["total_checkins"] == before["total_checkins"] == 2
    assert after["import_deltas"] == before["import_deltas"]
    with SessionLocal() as session:
        stored = session.get(ImportRun, failed.id)
        assert stored.status == "failed"
        assert stored.total_checkins_before is None
        assert stored.total_checkins_after is None


def test_dashboard_import_deltas_are_user_scoped(client):
    service = ImportService()
    owner_id = local_user_id()
    service.import_checkins(
        owner_id, "owner.csv", checkin_csv(checkin_row("owner-1", "b1", "Beer", "Brewery"))
    )
    service.import_checkins(
        owner_id,
        "owner-second.csv",
        checkin_csv(
            checkin_row("owner-1", "b1", "Beer", "Brewery"),
            checkin_row("owner-2", "b2", "Other Beer", "Other Brewery"),
        ),
    )
    owner_baseline = client.get("/api/v1/dashboard").json()["import_deltas"]
    assert owner_baseline["total_checkins"] == 1
    with SessionLocal() as session:
        other = User(username="delta-other")
        session.add(other)
        session.commit()
        other_id = other.id
    service.import_checkins(
        other_id, "other.csv", checkin_csv(checkin_row("other-1", "b2", "Other", "Other Brewery"))
    )
    assert client.get("/api/v1/dashboard").json()["import_deltas"] == owner_baseline


def test_dashboard_hides_incomplete_import_snapshot(client):
    run = ImportService().import_checkins(
        local_user_id(),
        "checkins.csv",
        checkin_csv(checkin_row("c1", "b1", "Beer", "Brewery", "Lager")),
    )
    with SessionLocal() as session:
        session.get(ImportRun, run.id).unique_styles_after = None
        session.commit()

    assert client.get("/api/v1/dashboard").json()["import_deltas"] == {
        "total_checkins": None,
        "unique_beers": None,
        "unique_breweries": None,
        "unique_styles": None,
    }


def test_dashboard_does_not_skip_incomplete_successful_import(client):
    service = ImportService()
    user_id = local_user_id()
    service.import_checkins(
        user_id, "first.csv", checkin_csv(checkin_row("c1", "b1", "Beer One", "Brewery A"))
    )
    intermediate = service.import_checkins(
        user_id,
        "intermediate.csv",
        checkin_csv(
            checkin_row("c1", "b1", "Beer One", "Brewery A"),
            checkin_row("c2", "b2", "Beer Two", "Brewery B"),
        ),
    )
    with SessionLocal() as session:
        session.get(ImportRun, intermediate.id).unique_styles_after = None
        session.commit()

    service.import_checkins(
        user_id,
        "latest.csv",
        checkin_csv(
            checkin_row("c1", "b1", "Beer One", "Brewery A"),
            checkin_row("c2", "b2", "Beer Two", "Brewery B"),
            checkin_row("c3", "b3", "Beer Three", "Brewery C"),
        ),
    )

    assert client.get("/api/v1/dashboard").json()["import_deltas"] == {
        "total_checkins": None,
        "unique_beers": None,
        "unique_breweries": None,
        "unique_styles": None,
    }


def test_dashboard_does_not_skip_preceding_legacy_import(client):
    service = ImportService()
    user_id = local_user_id()
    first = service.import_checkins(
        user_id, "first.csv", checkin_csv(checkin_row("c1", "b1", "Beer One", "Brewery A"))
    )
    with SessionLocal() as session:
        session.get(ImportRun, first.id).completed_at = datetime(2020, 1, 1)
        session.add(
            ImportRun(
                user_id=user_id,
                source_type="checkins",
                filename="legacy.csv",
                sha256="a" * 64,
                started_at=datetime(2021, 1, 1),
                completed_at=datetime(2021, 1, 1),
                status="completed",
            )
        )
        session.commit()

    service.import_checkins(
        user_id,
        "latest.csv",
        checkin_csv(
            checkin_row("c1", "b1", "Beer One", "Brewery A"),
            checkin_row("c2", "b2", "Beer Two", "Brewery B"),
        ),
    )

    assert client.get("/api/v1/dashboard").json()["import_deltas"] == {
        "total_checkins": None,
        "unique_beers": None,
        "unique_breweries": None,
        "unique_styles": None,
    }


def test_dashboard_import_order_uses_id_when_completion_timestamps_match(client):
    service = ImportService()
    user_id = local_user_id()
    first = service.import_checkins(
        user_id, "first.csv", checkin_csv(checkin_row("c1", "b1", "Beer One", "Brewery A"))
    )
    intermediate = service.import_checkins(
        user_id,
        "intermediate.csv",
        checkin_csv(
            checkin_row("c1", "b1", "Beer One", "Brewery A"),
            checkin_row("c2", "b2", "Beer Two", "Brewery B"),
        ),
    )
    latest = service.import_checkins(
        user_id,
        "latest.csv",
        checkin_csv(
            checkin_row("c1", "b1", "Beer One", "Brewery A"),
            checkin_row("c2", "b2", "Beer Two", "Brewery B"),
            checkin_row("c3", "b3", "Beer Three", "Brewery C"),
        ),
    )
    same_time = datetime(2026, 1, 1)
    with SessionLocal() as session:
        session.get(ImportRun, first.id).completed_at = same_time
        session.get(ImportRun, intermediate.id).completed_at = same_time
        session.get(ImportRun, latest.id).completed_at = same_time
        session.get(ImportRun, first.id).unique_beers_before = 0
        session.get(ImportRun, first.id).unique_beers_after = 10
        session.get(ImportRun, intermediate.id).unique_beers_before = 10
        session.get(ImportRun, intermediate.id).unique_beers_after = 30
        session.get(ImportRun, latest.id).unique_beers_before = 30
        session.get(ImportRun, latest.id).unique_beers_after = 55
        session.commit()

    assert client.get("/api/v1/dashboard").json()["import_deltas"] == {
        "total_checkins": 1,
        "unique_beers": 25,
        "unique_breweries": 1,
        "unique_styles": 0,
    }


def test_dashboard_metric_migration_leaves_legacy_imports_without_baseline(tmp_path):
    database_url = f"sqlite:///{tmp_path / 'legacy-imports.sqlite3'}"
    alembic_config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    alembic_config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(alembic_config, "011_personal_milestones")
    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            text("INSERT INTO users (id, username, created_at) VALUES (7, 'legacy', '2026-01-01')")
        )
        connection.execute(
            text(
                "INSERT INTO import_runs "
                "(id, user_id, source_type, filename, sha256, started_at, status, "
                "inserted_count, updated_count, unchanged_count, rejected_count) "
                "VALUES (8, 7, 'checkins', 'old.csv', 'hash', '2026-01-01', "
                "'completed', 1, 0, 0, 0)"
            )
        )

    command.upgrade(alembic_config, "head")
    with engine.connect() as connection:
        snapshot = connection.execute(
            text(
                "SELECT total_checkins_before, total_checkins_after, unique_beers_before, "
                "unique_beers_after, unique_breweries_before, unique_breweries_after, "
                "unique_styles_before, unique_styles_after FROM import_runs WHERE id = 8"
            )
        ).one()
    engine.dispose()
    assert snapshot == (None, None, None, None, None, None, None, None)


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
