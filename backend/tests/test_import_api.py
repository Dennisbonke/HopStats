from backend.tests.test_inventory_snapshots import stash_csv, stash_row


def checkin_csv() -> bytes:
    return (
        b"beer_name,brewery_name,created_at,checkin_id,bid,brewery_id\n"
        b"Pilsner,Hop Works,2026-09-29T20:00:00-07:00,check-1,bid-1,brew-1\n"
    )


def upload(client, path: str, content: bytes, **data):
    return client.post(
        path,
        files={"file": ("export.csv", content, "text/csv")},
        data=data,
    )


def test_checkin_upload_and_import_history(client):
    response = upload(client, "/api/v1/imports/checkins", checkin_csv())
    assert response.status_code == 200
    assert response.json()["status"] == "completed"
    assert response.json()["inserted_count"] == 1

    history = client.get("/api/v1/imports")
    assert history.status_code == 200
    assert history.json()[0]["filename"] == "export.csv"
    detail = client.get(f"/api/v1/imports/{history.json()[0]['id']}")
    assert detail.status_code == 200
    assert detail.json()["errors"] == []


def test_inventory_requires_explicit_replacement_confirmation(client):
    content = stash_csv(stash_row("item-1"))
    unconfirmed = upload(client, "/api/v1/imports/inventory", content)
    assert unconfirmed.status_code == 409
    assert unconfirmed.json()["error_code"] == "confirmation_required"

    confirmed = upload(client, "/api/v1/imports/inventory", content, confirm_replacement="true")
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "completed"


def test_unsupported_schema_returns_structured_error(client):
    response = upload(client, "/api/v1/imports/checkins", b"foo,bar\n1,2\n")
    assert response.status_code == 415
    body = response.json()
    assert body["status"] == "failed"
    assert body["error_code"] == "unsupported_schema"


def test_upload_size_limit_is_enforced(client, monkeypatch):
    from backend.app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "max_upload_bytes", 10)
    response = upload(client, "/api/v1/imports/checkins", b"01234567890")
    assert response.status_code == 413
