from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Checkin, Milestone
from ..schemas.milestones import MilestoneResponse, MilestoneWrite


class MilestoneNotFound(ValueError):
    pass


class MilestoneService:
    def __init__(self, session: Session):
        self.session = session

    def list(
        self,
        user_id: int,
        archived: bool | None = False,
        evaluation_time: datetime | None = None,
    ):
        statement = select(Milestone).where(Milestone.user_id == user_id)
        if archived is not None:
            statement = statement.where(
                Milestone.archived_at.is_not(None) if archived else Milestone.archived_at.is_(None)
            )
        items = self.session.scalars(statement.order_by(Milestone.created_at, Milestone.id)).all()
        return self._calculate(user_id, items, evaluation_time)

    def get(self, user_id: int, milestone_id: int, evaluation_time: datetime | None = None):
        milestone = self.session.scalar(
            select(Milestone).where(Milestone.id == milestone_id, Milestone.user_id == user_id)
        )
        return self._calculate(user_id, [milestone], evaluation_time)[0] if milestone else None

    def summary(self, user_id: int, evaluation_time: datetime | None = None):
        items = self.session.scalars(
            select(Milestone)
            .where(Milestone.user_id == user_id, Milestone.archived_at.is_(None))
            .order_by(Milestone.created_at, Milestone.id)
        ).all()
        calculated = self._calculate(user_id, items, evaluation_time)
        priority = {"overdue": 0, "active": 1, "scheduled": 2, "completed": 3, "period_ended": 4}
        by_id = {item.id: state for item, state in zip(items, calculated, strict=True)}
        ordered = sorted(
            items,
            key=lambda item: (
                priority.get(by_id[item.id].status, 5),
                item.deadline_date or date.max,
                item.created_at,
                item.id,
            ),
        )
        relevant = [item for item in ordered if by_id[item.id].status != "period_ended"][:5]
        return {
            "active_count": sum(state.status in {"active", "scheduled"} for state in calculated),
            "completed_count": sum(state.status == "completed" for state in calculated),
            "overdue_count": sum(state.status == "overdue" for state in calculated),
            "milestones": [
                {
                    field: getattr(by_id[item.id], field)
                    for field in (
                        "id",
                        "name",
                        "metric",
                        "goal_type",
                        "target",
                        "current",
                        "remaining",
                        "progress_percent",
                        "status",
                        "deadline_date",
                        "deadline_outcome",
                        "completed_at",
                    )
                }
                for item in relevant
            ],
        }

    def create(self, user_id: int, definition: MilestoneWrite):
        item = Milestone(user_id=user_id, **definition.model_dump())
        self.session.add(item)
        self.session.commit()
        self.session.refresh(item)
        return self.get(user_id, item.id)

    def update(self, user_id: int, milestone_id: int, changes: dict):
        item = self.session.scalar(
            select(Milestone).where(Milestone.id == milestone_id, Milestone.user_id == user_id)
        )
        if item is None:
            raise MilestoneNotFound("milestone not found")
        archived = changes.pop("archived", None)
        for key, value in changes.items():
            setattr(item, key, value)
        if archived is not None:
            item.archived_at = datetime.now(UTC) if archived else None
        definition = {key: getattr(item, key) for key in MilestoneWrite.model_fields}
        MilestoneWrite.model_validate(definition)
        item.updated_at = datetime.now(UTC)
        self.session.commit()
        return self.get(user_id, item.id)

    def delete(self, user_id: int, milestone_id: int):
        item = self.session.scalar(
            select(Milestone).where(Milestone.id == milestone_id, Milestone.user_id == user_id)
        )
        if item is None:
            raise MilestoneNotFound("milestone not found")
        self.session.delete(item)
        self.session.commit()

    def _calculate(
        self,
        user_id: int,
        milestones: list[Milestone],
        evaluation_time: datetime | None = None,
    ):
        if not milestones:
            return []
        evaluated_at = evaluation_time or datetime.now(UTC)
        if evaluated_at.tzinfo is None:
            evaluated_at = evaluated_at.replace(tzinfo=UTC)
        else:
            evaluated_at = evaluated_at.astimezone(UTC)
        rows = self.session.execute(
            select(Checkin.id, Checkin.beer_id, Checkin.occurred_at_utc)
            .where(Checkin.user_id == user_id)
            .order_by(Checkin.occurred_at_utc, Checkin.id)
        ).all()
        # One ordered history read per response. The same canonical beer_id and (time,id)
        # first-ever discovery rule as analytics applies to every milestone.
        first_seen: set[int] = set()
        events = []
        for row in rows:
            moment = (
                row.occurred_at_utc.replace(tzinfo=UTC)
                if row.occurred_at_utc.tzinfo is None
                else row.occurred_at_utc.astimezone(UTC)
            )
            discovery = row.beer_id not in first_seen
            first_seen.add(row.beer_id)
            events.append((moment, row.id, row.beer_id, discovery))
        return [self._one(m, events, evaluated_at) for m in milestones]

    @staticmethod
    def _one(m: Milestone, events, evaluated_at: datetime):
        tz = ZoneInfo(m.timezone)
        today = evaluated_at.astimezone(tz).date()
        if m.goal_type == "absolute":
            start = None
            end = None
        elif m.goal_type == "calendar_year":
            start = date(m.calendar_year, 1, 1)
            end = date(m.calendar_year, 12, 31)
        else:
            start, end = m.start_date, None
        start_utc = datetime.combine(start, time.min, tzinfo=tz).astimezone(UTC) if start else None
        cutoff = end
        end_utc = (
            datetime.combine(cutoff + timedelta(days=1), time.min, tzinfo=tz).astimezone(UTC)
            if cutoff
            else None
        )
        scheduled = start is not None and today < start
        eligible_events = [event for event in events if event[0] <= evaluated_at]
        selected = [
            e
            for e in eligible_events
            if (start_utc is None or e[0] >= start_utc) and (end_utc is None or e[0] < end_utc)
        ]
        if m.metric in {"discoveries", "unique_beers"}:
            selected = [e for e in selected if e[3]]
        if scheduled:
            selected = []
        count = len(selected)
        completed_at = selected[m.target - 1][0] if count >= m.target else None
        period_ended = m.goal_type == "calendar_year" and today > end
        completed = completed_at is not None or count >= m.target
        if m.archived_at is not None:
            status = "archived"
        elif completed:
            status = "completed"
        elif scheduled:
            status = "scheduled"
        elif period_ended:
            status = "period_ended"
        elif m.deadline_date and today > m.deadline_date:
            status = "overdue"
        else:
            status = "active"
        deadline_outcome = None
        if m.deadline_date:
            deadline_outcome = (
                "on_time"
                if completed_at and completed_at.astimezone(tz).date() <= m.deadline_date
                else "late"
                if completed_at
                else "missed"
                if today > m.deadline_date
                else "pending"
            )
        boundary_day = m.deadline_date or end
        duration_days = (boundary_day - start).days + 1 if start and boundary_day else None
        elapsed_boundary = end if m.goal_type == "calendar_year" else today
        elapsed_days = (
            max(0, (min(today, elapsed_boundary) - start).days + 1)
            if start and today >= start
            else None
        )
        trajectory_days = (
            max(0, (min(today, boundary_day) - start).days + 1)
            if start and boundary_day and today >= start
            else None
        )
        required_day = (
            (max(0, m.target - count) / max(1, (boundary_day - today).days + 1))
            if boundary_day and today <= boundary_day and not completed and not scheduled
            else None
        )
        elapsed_day = count / elapsed_days if elapsed_days and not scheduled else None
        trajectory = (
            count - m.target * trajectory_days / duration_days
            if trajectory_days and duration_days and not completed
            else None
        )
        return MilestoneResponse(
            id=m.id,
            name=m.name,
            metric=m.metric,
            goal_type=m.goal_type,
            target=m.target,
            calendar_year=m.calendar_year,
            start_date=m.start_date,
            deadline_date=m.deadline_date,
            timezone=m.timezone,
            archived_at=m.archived_at,
            created_at=m.created_at,
            updated_at=m.updated_at,
            current=count,
            remaining=max(0, m.target - count),
            progress_percent=round(count * 100 / m.target, 1),
            status=status,
            deadline_outcome=deadline_outcome,
            completed_at=completed_at,
            completed_before_deadline=(completed_at.astimezone(tz).date() <= m.deadline_date)
            if completed_at and m.deadline_date
            else None,
            required_per_day=round(required_day, 2) if required_day is not None else None,
            required_per_week=round(required_day * 7, 2) if required_day is not None else None,
            elapsed_per_day=round(elapsed_day, 2) if elapsed_day is not None else None,
            elapsed_per_week=round(elapsed_day * 7, 2) if elapsed_day is not None else None,
            trajectory_difference=round(trajectory, 2) if trajectory is not None else None,
        )
