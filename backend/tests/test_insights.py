from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from sqlalchemy import delete, event

from backend.app.db import SessionLocal
from backend.app.models import Beer, Checkin, Milestone, User
from backend.app.schemas.insights import Insight
from backend.app.services.insights import InsightsService, _Candidate

AMSTERDAM = ZoneInfo("Europe/Amsterdam")


def _local(day: date, hour: int = 12, minute: int = 0) -> datetime:
    return (
        datetime.combine(day, datetime.min.time(), AMSTERDAM)
        .replace(hour=hour, minute=minute)
        .astimezone(UTC)
    )


def _add_events(session, events):
    beers = {}
    for _user_id, name, _occurred in events:
        if name not in beers:
            beers[name] = Beer(
                source_system="insight-test",
                external_id=name,
                name=name,
            )
            session.add(beers[name])
    session.flush()
    for index, (user_id, name, occurred) in enumerate(events):
        session.add(
            Checkin(
                user_id=user_id,
                source_system="insight-test",
                external_id=f"insight-{user_id}-{index}",
                beer_id=beers[name].id,
                occurred_at_utc=occurred,
            )
        )
    session.flush()


def _add_milestone(
    session,
    name,
    metric="checkins",
    goal_type="incremental",
    target=100,
    **dates,
):
    milestone = Milestone(
        user_id=1,
        name=name,
        metric=metric,
        goal_type=goal_type,
        target=target,
        timezone="Europe/Amsterdam",
        **dates,
    )
    session.add(milestone)
    session.flush()
    return milestone


def test_milestone_completion_14_local_day_window_and_archived_exclusion(client):
    evaluation = _local(date(2026, 4, 20))
    with SessionLocal() as session:
        _add_events(
            session,
            [
                (1, "inside", evaluation - timedelta(days=13)),
                (1, "boundary", evaluation - timedelta(days=14)),
                (1, "archived", evaluation - timedelta(days=1)),
                (1, "today", evaluation),
            ],
        )
        _add_milestone(session, "Recent", metric="discoveries", goal_type="absolute", target=2)
        _add_milestone(session, "Old", metric="discoveries", goal_type="absolute", target=1)
        archived = _add_milestone(
            session, "Archived", metric="discoveries", goal_type="absolute", target=3
        )
        _add_milestone(
            session, "Completed today", metric="discoveries", goal_type="absolute", target=4
        )
        archived.archived_at = evaluation
        session.commit()

        result = InsightsService(session).get(1, evaluation)
        assert [item.data["milestone_id"] for item in result.insights] == [1, 4]
        assert all(item.type == "milestone_completed" for item in result.insights)
        assert "on-time" not in result.insights[0].description
        assert result.insights[0].href == "/milestones/1"

        # Correcting/removing recent imported events recomputes the historic
        # completion timestamp and can remove the insight on the next request.
        session.execute(
            delete(Checkin).where(
                Checkin.user_id == 1,
                Checkin.external_id.in_(["insight-1-0", "insight-1-2", "insight-1-3"]),
            )
        )
        session.flush()
        assert InsightsService(session).get(1, evaluation).insights == []


def test_near_completion_threshold_and_excludes_other_statuses(client):
    evaluation = _local(date(2026, 4, 20))
    with SessionLocal() as session:
        events = [
            (1, f"near-{index}", _local(date(2026, 4, 1)) + timedelta(hours=index))
            for index in range(90)
        ]
        _add_events(session, events)
        _add_milestone(
            session,
            "At ninety percent",
            metric="discoveries",
            target=100,
            start_date=date(2026, 1, 1),
        )
        _add_milestone(
            session,
            "Below ninety",
            metric="discoveries",
            target=101,
            start_date=date(2026, 1, 1),
        )
        _add_milestone(
            session,
            "Scheduled",
            metric="discoveries",
            target=1,
            start_date=date(2027, 1, 1),
        )
        _add_milestone(
            session,
            "Overdue",
            metric="discoveries",
            target=100,
            start_date=date(2026, 1, 1),
            deadline_date=date(2026, 4, 1),
        )
        _add_milestone(
            session,
            "Ended",
            metric="discoveries",
            goal_type="calendar_year",
            target=100,
            calendar_year=2025,
        )
        session.commit()

        result = InsightsService(session).get(1, evaluation)
        near = [item for item in result.insights if item.type == "milestone_near"]
        assert len(near) == 1
        assert near[0].data["current"] == 90
        assert near[0].data["remaining"] == 10
        assert "90%" in near[0].description
        assert not any(item.data.get("milestone_id") in {3, 4, 5} for item in near)


def test_trajectory_threshold_boundaries_and_near_completion_precedence(client):
    evaluation = _local(date(2026, 4, 5))

    def milestone_state(milestone_id, current, target, progress, status="active", deviation=5):
        return SimpleNamespace(
            id=milestone_id,
            metric="checkins",
            current=current,
            target=target,
            remaining=max(0, target - current),
            progress_percent=progress,
            status=status,
            completed_at=None,
            timezone="Europe/Amsterdam",
            trajectory_difference=deviation,
        )

    ahead = InsightsService._milestone_candidate(
        milestone_state(1, 55, 100, 55, deviation=5), evaluation
    )
    below = InsightsService._milestone_candidate(
        milestone_state(2, 45, 100, 45, deviation=-5), evaluation
    )
    near = InsightsService._milestone_candidate(
        milestone_state(3, 95, 100, 95, deviation=45), evaluation
    )
    just_below_count_threshold = InsightsService._milestone_candidate(
        milestone_state(4, 55, 100, 55, deviation=4.99), evaluation
    )
    just_below_target_threshold = InsightsService._milestone_candidate(
        milestone_state(5, 56, 101, 55.4, deviation=5), evaluation
    )
    no_trajectory = InsightsService._milestone_candidate(
        milestone_state(6, 55, 100, 55, deviation=None), evaluation
    )
    assert ahead.insight.type == "milestone_ahead"
    assert ahead.insight.data["trajectory_difference"] == 5
    assert below.insight.type == "milestone_below"
    assert below.insight.data["trajectory_difference"] == -5
    assert near.insight.type == "milestone_near"
    assert just_below_count_threshold is None
    assert just_below_target_threshold is None
    assert no_trajectory is None
    selected = InsightsService._select([ahead, below, near])
    assert selected[0].type == "milestone_near"
    assert "above the linear trajectory" in ahead.insight.description
    assert "below the linear trajectory" in below.insight.description


def test_deadline_passed_is_current_state_not_an_event_and_is_lower_priority(client):
    evaluation = _local(date(2026, 4, 20))
    with SessionLocal() as session:
        _add_events(
            session,
            [(1, f"deadline-{index}", _local(date(2026, 4, 1))) for index in range(85)],
        )
        _add_milestone(
            session,
            "Deadline goal",
            target=100,
            start_date=date(2026, 4, 1),
            deadline_date=date(2026, 4, 10),
        )
        session.commit()
        result = InsightsService(session).get(1, evaluation)
        deadline = next(
            item for item in result.insights if item.type == "milestone_deadline_passed"
        )
        assert deadline.data["current"] == 85
        assert "85 of 100 check-ins recorded" in deadline.description
        assert "Progress can still continue" in deadline.description
        assert deadline.href == "/milestones/1"
        assert deadline.id == "milestone-deadline-passed-1"


def test_activity_trends_use_first_discoveries_repeats_and_exclude_future_events(client):
    evaluation = _local(date(2026, 3, 15), 12)
    events = []
    # Ten new discoveries and ten check-ins in the previous-month comparison.
    for index in range(10):
        events.append((1, f"previous-{index}", _local(date(2026, 2, 1)) + timedelta(days=index)))
    # Fifteen discoveries in the current month-to-date.
    for index in range(15):
        events.append((1, f"current-{index}", _local(date(2026, 3, 1)) + timedelta(days=index)))
    # Repeats of previous discoveries affect check-ins, never discoveries.
    for index in range(5):
        events.append((1, "previous-0", _local(date(2026, 3, 10)) + timedelta(minutes=index)))
    # Same timestamp tie: one canonical beer has one first-ever event.
    tied_time = _local(date(2026, 3, 12), 10)
    events.extend([(1, "tied-beer", tied_time), (1, "tied-beer", tied_time)])
    events.append((1, "future-beer", evaluation + timedelta(minutes=1)))
    with SessionLocal() as session:
        _add_events(session, events)
        session.commit()
        result = InsightsService(session).get(1, evaluation)
        by_type = {item.type: item for item in result.insights}
        discovery = by_type["discovery_trend"]
        checkins = by_type["checkin_trend"]
        assert discovery.data["current_count"] == 16
        assert discovery.data["previous_count"] == 10
        assert checkins.data["current_count"] == 22
        assert checkins.data["previous_count"] == 10
        assert "16 unique beers this month" in discovery.description
        assert "22 check-ins this month" in checkins.description
        assert InsightsService(session).get(1, evaluation) == result


def test_milestone_and_activity_insights_share_one_ordered_history_load(client):
    evaluation = _local(date(2026, 3, 20))
    with SessionLocal() as session:
        _add_events(session, [(1, "shared-history", _local(date(2026, 3, 10)))])
        _add_milestone(
            session,
            "Shared history milestone",
            metric="discoveries",
            target=10,
            start_date=date(2026, 1, 1),
        )
        session.commit()

        statement_log = []
        connection = session.connection()

        def record_statement(_conn, _cursor, statement, _parameters, _context, _many):
            if "from checkins" in statement.lower():
                statement_log.append(statement)

        event.listen(connection, "before_cursor_execute", record_statement)
        try:
            result = InsightsService(session).get(1, evaluation)
        finally:
            event.remove(connection, "before_cursor_execute", record_statement)

        assert result.insights == []
        assert len(statement_log) == 1


def test_trend_thresholds_and_previous_month_clamping_for_leap_february(client):
    eval_local = datetime(2024, 3, 31, 12, tzinfo=AMSTERDAM)
    current_start, previous_start, previous_end = InsightsService._period_boundaries(
        eval_local.astimezone(UTC), AMSTERDAM
    )
    assert current_start.astimezone(AMSTERDAM) == datetime(2024, 3, 1, tzinfo=AMSTERDAM)
    assert previous_start.astimezone(AMSTERDAM) == datetime(2024, 2, 1, tzinfo=AMSTERDAM)
    assert previous_end.astimezone(AMSTERDAM) == datetime(2024, 2, 29, 12, tzinfo=AMSTERDAM)

    # DST switches the UTC offset of local month boundaries without shifting dates.
    dst_eval = datetime(2026, 3, 29, 12, tzinfo=AMSTERDAM).astimezone(UTC)
    dst_current, dst_previous, _ = InsightsService._period_boundaries(dst_eval, AMSTERDAM)
    assert dst_current == datetime(2026, 2, 28, 23, tzinfo=UTC)
    assert dst_previous == datetime(2026, 1, 31, 23, tzinfo=UTC)


def test_trends_suppress_small_samples_zero_baselines_and_subthreshold_change(client):
    evaluation = _local(date(2026, 3, 15))
    with SessionLocal() as session:
        # Both periods have a sample, but the difference is below five and 20%.
        events = []
        for index in range(10):
            events.append((1, f"base-{index}", _local(date(2026, 2, 1)) + timedelta(days=index)))
        for index in range(11):
            events.append((1, f"small-{index}", _local(date(2026, 3, 1)) + timedelta(days=index)))
        _add_events(session, events)
        session.commit()
        assert InsightsService(session).get(1, evaluation).insights == []


def test_trends_suppress_zero_baselines_and_periods_with_fewer_than_ten_events(client):
    evaluation = _local(date(2026, 3, 20))
    events = [
        (1, f"zero-current-{index}", _local(date(2026, 3, 1)) + timedelta(days=index))
        for index in range(10)
    ]
    events.extend(
        (2, f"small-previous-{index}", _local(date(2026, 2, 1)) + timedelta(days=index))
        for index in range(9)
    )
    events.extend(
        (2, f"small-current-{index}", _local(date(2026, 3, 1)) + timedelta(days=index))
        for index in range(15)
    )
    with SessionLocal() as session:
        second_user = User(username="small-sample-user")
        session.add(second_user)
        session.flush()
        events = [
            (second_user.id if user_id == 2 else user_id, name, timestamp)
            for user_id, name, timestamp in events
        ]
        _add_events(session, events)
        session.commit()
        assert InsightsService(session).get(1, evaluation).insights == []
        assert InsightsService(session).get(second_user.id, evaluation).insights == []


def test_activity_trend_exact_twenty_percent_and_five_event_threshold(client):
    evaluation = _local(date(2026, 3, 31), 12)
    events = []
    for index in range(25):
        events.append((1, f"exact-base-{index}", _local(date(2026, 2, 1)) + timedelta(days=index)))
    for index in range(30):
        events.append(
            (1, f"exact-current-{index}", _local(date(2026, 3, 1)) + timedelta(days=index))
        )
    with SessionLocal() as session:
        _add_events(session, events)
        session.commit()
        result = InsightsService(session).get(1, evaluation)
        discovery = next(item for item in result.insights if item.type == "discovery_trend")
        assert discovery.data["current_count"] == 30
        assert discovery.data["previous_count"] == 25
        assert discovery.data["difference"] == 5
        assert discovery.data["relative_change_percent"] == 20.0


def test_decreasing_trend_is_factual_and_neutral(client):
    evaluation = _local(date(2026, 3, 15))
    events = []
    for index in range(15):
        events.append((1, f"more-before-{index}", _local(date(2026, 2, 1)) + timedelta(days=index)))
    for index in range(10):
        events.append((1, f"less-now-{index}", _local(date(2026, 3, 1)) + timedelta(days=index)))
    with SessionLocal() as session:
        _add_events(session, events)
        session.commit()
        result = InsightsService(session).get(1, evaluation)
        trend = next(item for item in result.insights if item.type == "discovery_trend")
        assert trend.data["difference"] == -5
        assert trend.title == "Discovery activity comparison"
        assert "below your" not in trend.description.lower()


def test_candidate_selection_is_deterministic_diverse_and_limits_same_milestone(client):
    def candidate(insight_type, category, priority, milestone_id):
        return Insight(
            id=f"{insight_type}-{milestone_id}",
            type=insight_type,
            category=category,
            priority=priority,
            title=insight_type,
            description="fact",
            href=f"/milestones/{milestone_id}" if category == "milestone" else None,
            data={"milestone_id": milestone_id} if category == "milestone" else {},
        )

    service_candidates = [
        (candidate("milestone_near", "milestone", 90, 1), 1),
        (candidate("milestone_ahead", "milestone", 80, 1), 1),
        (candidate("milestone_below", "milestone", 70, 2), 2),
        (candidate("milestone_deadline_passed", "milestone", 40, 3), 3),
        (candidate("discovery_trend", "activity", 60, None), None),
        (candidate("checkin_trend", "activity", 50, None), None),
    ]
    wrapped = [_Candidate(item, id) for item, id in service_candidates]
    first = InsightsService._select(wrapped)
    second = InsightsService._select(list(reversed(wrapped)))
    assert first == second
    assert [item.type for item in first] == [
        "milestone_near",
        "milestone_below",
        "discovery_trend",
        "checkin_trend",
    ]


def test_insights_endpoint_is_authenticated_and_user_scoped(client):
    with SessionLocal() as session:
        other = User(username="other-insights-user")
        session.add(other)
        session.flush()
        _add_events(session, [(other.id, "private-other-beer", _local(date(2026, 3, 1)))])
        session.add(
            Milestone(
                user_id=other.id,
                name="Other person's goal",
                metric="checkins",
                goal_type="absolute",
                target=1,
                timezone="Europe/Amsterdam",
            )
        )
        session.commit()
        own = InsightsService(session).get(1, _local(date(2026, 3, 20)))
        assert all("other" not in item.description.lower() for item in own.insights)

    response = client.get("/api/v1/insights")
    assert response.status_code == 200
    assert "insights" in response.json()
    client.cookies.pop("hopstats_session", None)
    assert client.get("/api/v1/insights").status_code == 401
