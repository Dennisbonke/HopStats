from datetime import UTC, date, datetime

from backend.app.db import SessionLocal
from backend.app.models import Beer, Checkin, Milestone
from backend.app.services.milestones import MilestoneService


def _add_history(session, records):
    beers = {}
    for name, _timestamp in records:
        if name not in beers:
            beers[name] = Beer(source_system="untappd", external_id=f"test-{name}", name=name)
            session.add(beers[name])
    session.flush()
    for index, (name, timestamp) in enumerate(records):
        session.add(
            Checkin(
                user_id=1,
                source_system="test",
                external_id=f"event-{index}",
                beer_id=beers[name].id,
                occurred_at_utc=timestamp,
            )
        )
    session.flush()
    return beers


def _milestone(session, metric, goal_type, target, **dates):
    item = Milestone(
        user_id=1,
        name=f"{metric}-{goal_type}-{target}",
        metric=metric,
        goal_type=goal_type,
        target=target,
        timezone="Europe/Amsterdam",
        **dates,
    )
    session.add(item)
    session.flush()
    return item


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


def test_windowed_unique_beers_only_counts_first_ever_discoveries(client):
    with SessionLocal() as session:
        _add_history(
            session,
            [
                ("A", datetime(2025, 6, 1, tzinfo=UTC)),
                ("A", datetime(2026, 3, 1, tzinfo=UTC)),
                ("B", datetime(2026, 4, 1, tzinfo=UTC)),
                ("B", datetime(2026, 5, 1, tzinfo=UTC)),
            ],
        )
        incremental = _milestone(
            session, "unique_beers", "incremental", 20, start_date=date(2026, 1, 1)
        )
        calendar = _milestone(session, "unique_beers", "calendar_year", 20, calendar_year=2026)
        discovery = _milestone(
            session, "discoveries", "incremental", 20, start_date=date(2026, 1, 1)
        )
        absolute = _milestone(session, "unique_beers", "absolute", 20)
        states = MilestoneService(session)._calculate(
            1,
            [incremental, calendar, discovery, absolute],
            datetime(2026, 12, 1, tzinfo=UTC),
        )
        assert [state.current for state in states] == [1, 1, 1, 2]


def test_scheduled_goals_hide_future_events_until_local_start(client):
    with SessionLocal() as session:
        _add_history(session, [("future", datetime(2027, 1, 1, 10, tzinfo=UTC))])
        yearly = _milestone(session, "discoveries", "calendar_year", 1, calendar_year=2027)
        incremental = _milestone(session, "checkins", "incremental", 1, start_date=date(2027, 1, 1))
        before_start = datetime(2026, 12, 31, 22, 59, tzinfo=UTC)
        scheduled = MilestoneService(session)._calculate(1, [yearly, incremental], before_start)
        assert [(state.status, state.current, state.completed_at) for state in scheduled] == [
            ("scheduled", 0, None),
            ("scheduled", 0, None),
        ]
        started = MilestoneService(session)._calculate(
            1, [yearly, incremental], datetime(2027, 1, 1, 10, tzinfo=UTC)
        )
        assert [state.current for state in started] == [1, 1]


def test_future_events_are_excluded_and_completion_reconstructs_deterministically(client):
    with SessionLocal() as session:
        _add_history(
            session,
            [
                ("tie-first", datetime(2026, 6, 1, tzinfo=UTC)),
                ("tie-second", datetime(2026, 6, 1, tzinfo=UTC)),
                ("future", datetime(2026, 12, 1, tzinfo=UTC)),
            ],
        )
        checkins = _milestone(session, "checkins", "absolute", 3)
        future = datetime(2026, 7, 1, tzinfo=UTC)
        state = MilestoneService(session)._calculate(1, [checkins], future)[0]
        assert state.current == 2
        assert state.completed_at is None
        later = MilestoneService(session)._calculate(
            1, [checkins], datetime(2026, 12, 2, tzinfo=UTC)
        )[0]
        assert later.current == 3
        assert later.completed_at == datetime(2026, 12, 1, tzinfo=UTC)
        target_one = _milestone(session, "discoveries", "absolute", 1)
        first = MilestoneService(session)._calculate(
            1, [target_one], datetime(2026, 7, 1, tzinfo=UTC)
        )[0]
        assert first.completed_at == datetime(2026, 6, 1, tzinfo=UTC)


def test_summary_is_bounded_compact_and_excludes_archived(client):
    with SessionLocal() as session:
        for index in range(7):
            _milestone(session, "checkins", "absolute", 100 + index)
        archived = _milestone(session, "checkins", "absolute", 1)
        archived.archived_at = datetime.now(UTC)
        session.commit()
    response = client.get("/api/v1/milestones/summary")
    assert response.status_code == 200
    body = response.json()
    assert body["active_count"] == 7
    assert body["completed_count"] == 0
    assert body["overdue_count"] == 0
    assert len(body["milestones"]) == 5
    assert "created_at" not in body["milestones"][0]


def test_local_calendar_boundaries_leap_year_and_dst(client):
    with SessionLocal() as session:
        _add_history(
            session,
            [
                # 23:00 UTC on March 28 is midnight at the start of the DST date.
                ("dst-start", datetime(2026, 3, 28, 23, tzinfo=UTC)),
                ("leap-day", datetime(2024, 2, 29, 12, tzinfo=UTC)),
                # 23:00 UTC on December 31 is midnight on January 1 in Amsterdam.
                ("year-end", datetime(2023, 12, 31, 23, tzinfo=UTC)),
            ],
        )
        dst = _milestone(
            session,
            "discoveries",
            "incremental",
            10,
            start_date=date(2026, 3, 29),
        )
        leap = _milestone(session, "discoveries", "calendar_year", 10, calendar_year=2024)
        states = MilestoneService(session)._calculate(
            1, [dst, leap], datetime(2026, 4, 1, tzinfo=UTC)
        )
        assert states[0].current == 1
        assert states[1].current == 2


def test_deadline_outcome_progress_pace_and_period_end(client):
    with SessionLocal() as session:
        _add_history(
            session,
            [
                ("first", datetime(2026, 1, 1, 10, tzinfo=UTC)),
                ("second", datetime(2026, 1, 2, 10, tzinfo=UTC)),
                # After the local deadline day, but incremental progress continues.
                ("late", datetime(2026, 1, 3, 0, 30, tzinfo=UTC)),
            ],
        )
        goal = _milestone(
            session,
            "checkins",
            "incremental",
            3,
            start_date=date(2026, 1, 1),
            deadline_date=date(2026, 1, 2),
        )
        late = MilestoneService(session)._calculate(1, [goal], datetime(2026, 1, 4, tzinfo=UTC))[0]
        assert late.current == 3
        assert late.status == "completed"
        assert late.deadline_outcome == "late"
        assert late.completed_before_deadline is False
        on_time_goal = _milestone(
            session,
            "checkins",
            "incremental",
            2,
            start_date=date(2026, 1, 1),
            deadline_date=date(2026, 1, 2),
        )
        on_time = MilestoneService(session)._calculate(
            1, [on_time_goal], datetime(2026, 1, 4, tzinfo=UTC)
        )[0]
        assert on_time.status == "completed"
        assert on_time.deadline_outcome == "on_time"
        overdue_goal = _milestone(
            session,
            "checkins",
            "incremental",
            4,
            start_date=date(2026, 1, 1),
            deadline_date=date(2026, 1, 2),
        )
        overdue = MilestoneService(session)._calculate(
            1, [overdue_goal], datetime(2026, 1, 4, tzinfo=UTC)
        )[0]
        assert overdue.status == "overdue"
        assert overdue.deadline_outcome == "missed"

        pace_goal = _milestone(
            session,
            "checkins",
            "incremental",
            10,
            start_date=date(2026, 1, 1),
            deadline_date=date(2026, 1, 10),
        )
        pace = MilestoneService(session)._calculate(
            1, [pace_goal], datetime(2026, 1, 2, 23, 30, tzinfo=UTC)
        )[0]
        assert pace.required_per_day == 1.0
        assert pace.required_per_week == 7.0
        assert pace.elapsed_per_day == 0.67
        assert pace.elapsed_per_week == 4.67
        assert pace.trajectory_difference == -1.0

        ended = _milestone(session, "checkins", "calendar_year", 100, calendar_year=2025)
        period = MilestoneService(session)._calculate(1, [ended], datetime(2026, 1, 2, tzinfo=UTC))[
            0
        ]
        assert period.status == "period_ended"


def test_patch_validation_rolls_back_and_owner_scope_is_enforced(client):
    created = client.post(
        "/api/v1/milestones",
        json={"name": "Owner scoped", "metric": "checkins", "goal_type": "absolute", "target": 5},
    )
    assert created.status_code == 201
    milestone_id = created.json()["id"]
    invalid_patch = client.patch(
        f"/api/v1/milestones/{milestone_id}", json={"goal_type": "calendar_year"}
    )
    assert invalid_patch.status_code == 422
    assert client.get(f"/api/v1/milestones/{milestone_id}").json()["goal_type"] == "absolute"
    with SessionLocal() as session:
        assert MilestoneService(session).get(999, milestone_id) is None
        assert MilestoneService(session).get(1, milestone_id) is not None
