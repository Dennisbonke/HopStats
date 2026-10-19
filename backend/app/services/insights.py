from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Checkin
from ..schemas.insights import Insight, InsightsResponse
from .milestones import MilestoneService

EVALUATION_TIMEZONE = "Europe/Amsterdam"
INSIGHT_LIMIT = 5
MILESTONE_LIMIT = 2
ACTIVITY_LIMIT = 2


@dataclass(frozen=True)
class _Candidate:
    insight: Insight
    milestone_id: int | None


def _number(value: int | float) -> str:
    if isinstance(value, int) or value.is_integer():
        return f"{int(value):,}"
    return f"{value:,.2f}".rstrip("0").rstrip(".")


class InsightsService:
    def __init__(self, session: Session):
        self.session = session

    def get(self, user_id: int, evaluation_time: datetime | None = None) -> InsightsResponse:
        evaluated_at = evaluation_time or datetime.now(UTC)
        if evaluated_at.tzinfo is None:
            evaluated_at = evaluated_at.replace(tzinfo=UTC)
        else:
            evaluated_at = evaluated_at.astimezone(UTC)

        # Use M9.1 as the sole source of milestone status, qualifying counts,
        # reconstructed completion timestamps, and trajectory calculations.
        milestones = MilestoneService(self.session).list(
            user_id, archived=False, evaluation_time=evaluated_at
        )
        candidates = [
            candidate
            for milestone in milestones
            if (candidate := self._milestone_candidate(milestone, evaluated_at)) is not None
        ]
        candidates.extend(self._activity_candidates(user_id, evaluated_at))
        return InsightsResponse(insights=self._select(candidates))

    @staticmethod
    def _milestone_candidate(milestone, evaluated_at: datetime) -> _Candidate | None:
        milestone_id = milestone.id
        href = f"/milestones/{milestone_id}"
        metric = (
            "unique beer discoveries"
            if milestone.metric in {"discoveries", "unique_beers"}
            else "check-ins"
        )
        base_data = {
            "milestone_id": milestone_id,
            "current": milestone.current,
            "target": milestone.target,
            "remaining": milestone.remaining,
            "progress_percent": milestone.progress_percent,
        }

        if milestone.completed_at is not None:
            timezone = ZoneInfo(milestone.timezone)
            completion_day = milestone.completed_at.astimezone(timezone).date()
            today = evaluated_at.astimezone(timezone).date()
            if 0 <= (today - completion_day).days < 14:
                return _Candidate(
                    Insight(
                        id=f"milestone-completed-{milestone_id}",
                        type="milestone_completed",
                        category="milestone",
                        priority=100,
                        title="Another milestone in the books!",
                        description=(
                            f"You've reached your goal of {_number(milestone.target)} {metric}."
                        ),
                        href=href,
                        data=base_data,
                    ),
                    milestone_id,
                )

        if (
            milestone.status == "active"
            and milestone.current < milestone.target
            and milestone.progress_percent >= 90
        ):
            return _Candidate(
                Insight(
                    id=f"milestone-near-{milestone_id}",
                    type="milestone_near",
                    category="milestone",
                    priority=90,
                    title="The finish line is in sight!",
                    description=(
                        f"You've reached {_number(milestone.progress_percent)}% of your milestone. "
                        f"{_number(milestone.remaining)} {metric} remain."
                    ),
                    href=href,
                    data=base_data,
                ),
                milestone_id,
            )

        deviation = milestone.trajectory_difference
        threshold = max(5, milestone.target * 0.05)
        if (
            milestone.status == "active"
            and deviation is not None
            and abs(deviation) >= 5
            and abs(deviation) >= threshold
        ):
            ahead = deviation > 0
            insight_type = "milestone_ahead" if ahead else "milestone_below"
            return _Candidate(
                Insight(
                    id=f"{insight_type.replace('_', '-')}-{milestone_id}",
                    type=insight_type,
                    category="milestone",
                    priority=80 if ahead else 70,
                    title="Making great progress!" if ahead else "Below your target pace",
                    description=(
                        f"You're {_number(abs(deviation))} {metric} "
                        f"{'above' if ahead else 'below'} the linear trajectory for your milestone."
                    ),
                    href=href,
                    data={**base_data, "trajectory_difference": deviation},
                ),
                milestone_id,
            )

        if milestone.status == "overdue":
            return _Candidate(
                Insight(
                    id=f"milestone-deadline-passed-{milestone_id}",
                    type="milestone_deadline_passed",
                    category="milestone",
                    priority=40,
                    title="Milestone deadline passed",
                    description=(
                        f"The deadline has passed with {_number(milestone.current)} of "
                        f"{_number(milestone.target)} {metric} recorded. "
                        "Progress can still continue."
                    ),
                    href=href,
                    data=base_data,
                ),
                milestone_id,
            )
        return None

    @staticmethod
    def _period_boundaries(evaluated_at: datetime, timezone: ZoneInfo):
        local_now = evaluated_at.astimezone(timezone)
        current_start = datetime.combine(local_now.date().replace(day=1), time.min, timezone)
        previous_month_last_day = current_start.date() - timedelta(days=1)
        previous_start_date = previous_month_last_day.replace(day=1)
        previous_day = min(local_now.day, previous_month_last_day.day)
        previous_end = local_now.replace(
            year=previous_month_last_day.year,
            month=previous_month_last_day.month,
            day=previous_day,
        )
        previous_start = datetime.combine(previous_start_date, time.min, timezone)
        return (
            current_start.astimezone(UTC),
            previous_start.astimezone(UTC),
            previous_end.astimezone(UTC),
        )

    def _activity_candidates(self, user_id: int, evaluated_at: datetime) -> list[_Candidate]:
        timezone = ZoneInfo(EVALUATION_TIMEZONE)
        current_start, previous_start, previous_end = self._period_boundaries(
            evaluated_at, timezone
        )
        current_checkins = previous_checkins = 0
        current_discoveries = previous_discoveries = 0
        seen_beers: set[int] = set()
        rows = self.session.execute(
            select(Checkin.id, Checkin.beer_id, Checkin.occurred_at_utc)
            .where(Checkin.user_id == user_id)
            .order_by(Checkin.occurred_at_utc, Checkin.id)
        ).all()
        for row in rows:
            occurred_at = (
                row.occurred_at_utc.replace(tzinfo=UTC)
                if row.occurred_at_utc.tzinfo is None
                else row.occurred_at_utc.astimezone(UTC)
            )
            is_discovery = row.beer_id not in seen_beers
            seen_beers.add(row.beer_id)
            if occurred_at > evaluated_at:
                continue
            if current_start <= occurred_at <= evaluated_at:
                current_checkins += 1
                current_discoveries += int(is_discovery)
            elif previous_start <= occurred_at <= previous_end:
                previous_checkins += 1
                previous_discoveries += int(is_discovery)

        candidates = []
        for insight_type, current, previous in (
            ("discovery_trend", current_discoveries, previous_discoveries),
            ("checkin_trend", current_checkins, previous_checkins),
        ):
            difference = current - previous
            if (
                min(current, previous) < 10
                or abs(difference) < 5
                or previous == 0
                or abs(difference) * 100 < previous * 20
            ):
                continue
            is_discovery = insight_type == "discovery_trend"
            metric = "unique beers" if is_discovery else "check-ins"
            if difference > 0:
                title = "An interesting month!" if is_discovery else "Your activity at a glance"
            else:
                title = (
                    "Discovery activity comparison"
                    if is_discovery
                    else "Check-in activity comparison"
                )
            candidates.append(
                _Candidate(
                    Insight(
                        id=(
                            f"{insight_type.replace('_', '-')}-"
                            f"{evaluated_at.astimezone(timezone):%Y-%m}"
                        ),
                        type=insight_type,
                        category="activity",
                        priority=60 if is_discovery else 50,
                        title=title,
                        description=(
                            f"You've recorded {_number(current)} {metric} this month, "
                            "compared with "
                            f"{_number(previous)} over the equivalent portion of last month."
                        ),
                        href=None,
                        data={
                            "current_count": current,
                            "previous_count": previous,
                            "difference": difference,
                            "relative_change_percent": round(difference * 100 / previous, 1),
                        },
                    ),
                    None,
                )
            )
        return candidates

    @staticmethod
    def _select(candidates: list[_Candidate]) -> list[Insight]:
        ordered = sorted(
            candidates,
            key=lambda item: (
                -item.insight.priority,
                item.milestone_id or 0,
                item.insight.type,
            ),
        )
        selected: list[Insight] = []
        milestone_ids: set[int] = set()
        milestone_count = activity_count = 0
        for candidate in ordered:
            insight = candidate.insight
            if len(selected) >= INSIGHT_LIMIT:
                break
            if insight.category == "milestone":
                if milestone_count >= MILESTONE_LIMIT:
                    continue
                if candidate.milestone_id in milestone_ids:
                    continue
                milestone_ids.add(candidate.milestone_id)
                milestone_count += 1
            else:
                if activity_count >= ACTIVITY_LIMIT:
                    continue
                activity_count += 1
            selected.append(insight)
        return selected
