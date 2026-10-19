from datetime import UTC, datetime

from backend.app.db import SessionLocal
from backend.app.models import Beer, Checkin


def test_milestone_crud_and_computed_counts(client):
    with SessionLocal() as session:
        beer = Beer(source_system="untappd", external_id="mile-1", name="Milestone beer")
        session.add(beer)
        session.flush()
        for index, occurred in enumerate(("2026-01-01T10:00:00", "2026-01-02T10:00:00")):
            session.add(
                Checkin(
                    user_id=1,
                    source_system="test",
                    external_id=f"mile-{index}",
                    beer_id=beer.id,
                    occurred_at_utc=datetime.fromisoformat(occurred).replace(tzinfo=UTC),
                )
            )
        session.commit()
    created = client.post(
        "/api/v1/milestones",
        json={
            "name": "Beer goal",
            "metric": "discoveries",
            "goal_type": "incremental",
            "target": 1,
            "start_date": "2026-01-01",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["current"] == 1
    assert body["status"] == "completed"
    assert body["completed_at"].startswith("2026-01-01")
    assert client.get("/api/v1/milestones").json()["milestones"][0]["id"] == body["id"]
    assert (
        client.patch(f"/api/v1/milestones/{body['id']}", json={"archived": True}).json()["status"]
        == "archived"
    )
    assert client.get("/api/v1/milestones").json()["milestones"] == []
    assert (
        client.get("/api/v1/milestones?archived=true").json()["milestones"][0]["status"]
        == "archived"
    )
    assert (
        client.patch(f"/api/v1/milestones/{body['id']}", json={"archived": False}).json()["status"]
        == "completed"
    )
    assert client.delete(f"/api/v1/milestones/{body['id']}").status_code == 204


def test_validation_and_scheduled_calendar_goal(client):
    invalid = client.post(
        "/api/v1/milestones",
        json={"name": "bad", "metric": "unique_styles", "goal_type": "absolute", "target": 1},
    )
    assert invalid.status_code == 422
    invalid = client.post(
        "/api/v1/milestones",
        json={
            "name": "bad",
            "metric": "checkins",
            "goal_type": "calendar_year",
            "target": 0,
            "calendar_year": 2027,
        },
    )
    assert invalid.status_code == 422
    valid = client.post(
        "/api/v1/milestones",
        json={
            "name": "Future",
            "metric": "checkins",
            "goal_type": "calendar_year",
            "target": 5,
            "calendar_year": 2099,
        },
    )
    assert valid.status_code == 201
    assert valid.json()["status"] == "scheduled"
    assert valid.json()["current"] == 0
    assert valid.json()["required_per_day"] is None
