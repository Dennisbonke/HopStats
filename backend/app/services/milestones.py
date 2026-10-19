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

    def list(self, user_id: int, archived: bool | None = False):
        statement = select(Milestone).where(Milestone.user_id == user_id)
        if archived is not None:
            statement = statement.where(
                Milestone.archived_at.is_not(None) if archived else Milestone.archived_at.is_(None)
            )
        items = self.session.scalars(statement.order_by(Milestone.created_at, Milestone.id)).all()
        return self._calculate(user_id, items)

    def get(self, user_id: int, milestone_id: int):
        milestone = self.session.scalar(
            select(Milestone).where(Milestone.id == milestone_id, Milestone.user_id == user_id)
        )
        return self._calculate(user_id, [milestone])[0] if milestone else None

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

    def _calculate(self, user_id: int, milestones: list[Milestone]):
        if not milestones:
            return []
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
        return [self._one(m, events) for m in milestones]

    @staticmethod
    def _one(m: Milestone, events):
        tz = ZoneInfo(m.timezone)
        now = datetime.now(UTC)
        today = now.astimezone(tz).date()
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
        selected = [
            e
            for e in events
            if (start_utc is None or e[0] >= start_utc) and (end_utc is None or e[0] < end_utc)
        ]
        if m.metric == "discoveries":
            selected = [e for e in selected if e[3]]
        elif m.metric == "unique_beers":
            seen: set[int] = set()
            selected = [e for e in selected if not (e[2] in seen or seen.add(e[2]))]
        count = len(selected)
        completed_at = selected[m.target - 1][0] if count >= m.target else None
        scheduled = start is not None and today < start
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
        elapsed_days = (
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
            count - m.target * elapsed_days / duration_days
            if elapsed_days and duration_days and not completed
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
