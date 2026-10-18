from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import Integer, and_, case, cast, func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Checkin
from ..schemas.analytics import (
    AnalyticsBucket,
    AnalyticsSummary,
    CheckinAnalyticsResponse,
    DrinkingTrendDay,
    DrinkingTrendHour,
    DrinkingTrendsResponse,
    DrinkingTrendWeekday,
    DrinkingTrendWeekdayHour,
)


class AnalyticsValidationError(ValueError):
    pass


def _utc_boundary(day: date, tz: ZoneInfo) -> datetime:
    return datetime.combine(day, time.min, tzinfo=tz).astimezone(UTC).replace(tzinfo=None)


def _bucket_start(day: date, granularity: str) -> date:
    if granularity == "day":
        return day
    if granularity == "week":
        return day - timedelta(days=day.weekday())
    if granularity == "month":
        return day.replace(day=1)
    return day.replace(month=1, day=1)


def _next_bucket(day: date, granularity: str) -> date:
    if granularity == "day":
        return day + timedelta(days=1)
    if granularity == "week":
        return day + timedelta(days=7)
    if granularity == "month":
        return (day.replace(day=28) + timedelta(days=4)).replace(day=1)
    return day.replace(year=day.year + 1, month=1, day=1)


def _make_buckets(
    start: date, end: date, granularity: str, tz: ZoneInfo, max_buckets: int
) -> list[dict]:
    current = _bucket_start(start, granularity)
    result = []
    while current <= end:
        following = _next_bucket(current, granularity)
        shown_start = max(current, start)
        shown_end = min(following - timedelta(days=1), end)
        if granularity == "week":
            iso = current.isocalendar()
            key = f"{iso.year}-W{iso.week:02d}"
            label = f"Week {iso.week:02d}, {iso.year}"
        elif granularity == "month":
            key = current.strftime("%Y-%m")
            label = current.strftime("%b %Y")
        elif granularity == "year":
            key = str(current.year)
            label = str(current.year)
        else:
            key = current.isoformat()
            label = current.strftime("%d %b %Y")
        result.append(
            {
                "key": key,
                "label": label,
                "start": shown_start,
                "end": shown_end,
                "utc_start": _utc_boundary(current, tz),
                "utc_end": _utc_boundary(following, tz),
            }
        )
        current = following
        if len(result) > max_buckets:
            raise AnalyticsValidationError(
                f"range creates more than {max_buckets} buckets; choose a coarser granularity"
            )
    return result


class AnalyticsService:
    def __init__(self, session: Session, max_buckets: int | None = None):
        self.session = session
        self.max_buckets = (
            max_buckets if max_buckets is not None else get_settings().analytics_max_buckets
        )

    def checkins(
        self,
        user_id: int,
        start: date | None,
        end: date | None,
        granularity: str,
        timezone_name: str,
    ) -> CheckinAnalyticsResponse:
        if granularity not in {"auto", "day", "week", "month", "year"}:
            raise AnalyticsValidationError("granularity must be auto, day, week, month, or year")
        if (start is None) != (end is None):
            raise AnalyticsValidationError("start and end must be provided together")
        if start and end and start > end:
            raise AnalyticsValidationError("start date must not be after end date")
        try:
            tz = ZoneInfo(timezone_name)
        except (ZoneInfoNotFoundError, ValueError):
            raise AnalyticsValidationError("timezone must be a valid IANA timezone") from None

        today = datetime.now(tz).date()
        if start is None:
            earliest, latest = self.session.execute(
                select(func.min(Checkin.occurred_at_utc), func.max(Checkin.occurred_at_utc)).where(
                    Checkin.user_id == user_id
                )
            ).one()
            if earliest is None:
                return CheckinAnalyticsResponse(
                    start=None,
                    end=None,
                    timezone=timezone_name,
                    granularity="month" if granularity == "auto" else granularity,
                    summary=AnalyticsSummary(
                        total_checkins=0, new_discoveries=0, repeat_checkins=0, distinct_beers=0
                    ),
                    cumulative_baseline_checkins=0,
                    cumulative_baseline_discoveries=0,
                    buckets=[],
                )
            start = earliest.replace(tzinfo=UTC).astimezone(tz).date()
            latest_date = latest.replace(tzinfo=UTC).astimezone(tz).date()
            end = max(today, latest_date)
        assert end is not None
        if granularity == "auto":
            duration = (end - start).days + 1
            spans_years = start.year < end.year
            granularity = (
                "year"
                if spans_years
                else "day"
                if duration <= 45
                else "week"
                if duration <= 180
                else "month"
            )
        buckets = _make_buckets(start, end, granularity, tz, self.max_buckets)
        start_utc = _utc_boundary(start, tz)
        end_utc = _utc_boundary(end + timedelta(days=1), tz)

        ranked = (
            select(
                Checkin.id.label("checkin_id"),
                Checkin.beer_id.label("beer_id"),
                Checkin.occurred_at_utc.label("occurred_at_utc"),
                func.row_number()
                .over(
                    partition_by=(Checkin.user_id, Checkin.beer_id),
                    order_by=(Checkin.occurred_at_utc, Checkin.id),
                )
                .label("discovery_rank"),
            )
            .where(Checkin.user_id == user_id)
            .cte("ranked_checkins")
        )

        bucket_case = case(
            (ranked.c.occurred_at_utc < start_utc, -1),
            *[
                (
                    and_(
                        ranked.c.occurred_at_utc >= bucket["utc_start"],
                        ranked.c.occurred_at_utc < bucket["utc_end"],
                    ),
                    index,
                )
                for index, bucket in enumerate(buckets)
            ],
            else_=-1,
        )
        grouped = self.session.execute(
            select(
                bucket_case.label("bucket_index"),
                func.count().label("total"),
                func.sum(case((ranked.c.discovery_rank == 1, 1), else_=0)).label("new"),
            )
            .where(
                ranked.c.occurred_at_utc < end_utc,
            )
            .group_by(bucket_case)
        ).all()

        by_index = {int(row.bucket_index): row for row in grouped}
        baseline = by_index.pop(-1, None)
        baseline_total = int(baseline.total or 0) if baseline else 0
        baseline_new = int(baseline.new or 0) if baseline else 0
        cumulative_total, cumulative_new = baseline_total, baseline_new
        output = []
        summary_total = summary_new = 0
        for index, bucket in enumerate(buckets):
            row = by_index.get(index)
            total = int(row.total or 0) if row else 0
            new = int(row.new or 0) if row else 0
            summary_total += total
            summary_new += new
            cumulative_total += total
            cumulative_new += new
            output.append(
                AnalyticsBucket(
                    key=bucket["key"],
                    label=bucket["label"],
                    start=bucket["start"],
                    end=bucket["end"],
                    new_discoveries=new,
                    repeat_checkins=total - new,
                    total_checkins=total,
                    cumulative_checkins=cumulative_total,
                    cumulative_discoveries=cumulative_new,
                )
            )
        return CheckinAnalyticsResponse(
            start=start,
            end=end,
            timezone=timezone_name,
            granularity=granularity,
            summary=AnalyticsSummary(
                total_checkins=summary_total,
                new_discoveries=summary_new,
                repeat_checkins=summary_total - summary_new,
                distinct_beers=int(
                    self.session.scalar(
                        select(func.count(func.distinct(Checkin.beer_id))).where(
                            Checkin.user_id == user_id,
                            Checkin.occurred_at_utc >= start_utc,
                            Checkin.occurred_at_utc < end_utc,
                        )
                    )
                    or 0
                ),
            ),
            cumulative_baseline_checkins=baseline_total,
            cumulative_baseline_discoveries=baseline_new,
            buckets=output,
        )

    def drinking_trends(
        self, user_id: int, start: date, end: date, timezone_name: str
    ) -> DrinkingTrendsResponse:
        if start > end:
            raise AnalyticsValidationError("start date must not be after end date")
        try:
            tz = ZoneInfo(timezone_name)
        except (ZoneInfoNotFoundError, ValueError):
            raise AnalyticsValidationError("timezone must be a valid IANA timezone") from None
        days = (end - start).days + 1
        if days > self.max_buckets:
            raise AnalyticsValidationError(
                f"range creates more than {self.max_buckets} buckets; choose a shorter range"
            )

        # SQL windowing preserves M7's global discovery rank, but only the compact
        # local-day/hour groups for the selected period cross into Python.
        connection = self.session.connection().connection.driver_connection

        def local_bucket(value: str) -> str:
            moment = datetime.fromisoformat(value).replace(tzinfo=UTC).astimezone(tz)
            return f"{moment.date().isoformat()}T{moment.hour:02d}"

        connection.create_function("trend_local_bucket", 1, local_bucket)

        ranked = (
            select(
                Checkin.id.label("checkin_id"),
                Checkin.occurred_at_utc.label("occurred_at_utc"),
                func.row_number()
                .over(
                    partition_by=(Checkin.user_id, Checkin.beer_id),
                    order_by=(Checkin.occurred_at_utc, Checkin.id),
                )
                .label("discovery_rank"),
            )
            .where(Checkin.user_id == user_id)
            .cte("ranked_trend_checkins")
        )
        start_utc, end_utc = _utc_boundary(start, tz), _utc_boundary(end + timedelta(days=1), tz)
        in_period = (
            select(
                ranked.c.checkin_id,
                ranked.c.occurred_at_utc,
                ranked.c.discovery_rank,
            )
            .where(
                ranked.c.occurred_at_utc >= start_utc,
                ranked.c.occurred_at_utc < end_utc,
            )
            .cte("period_trend_checkins")
        )
        # MATERIALIZED makes SQLite evaluate the timezone conversion once per
        # in-period check-in rather than re-running the Python UDF for SELECT/GROUP BY.
        localized = (
            select(
                in_period.c.checkin_id,
                in_period.c.discovery_rank,
                func.trend_local_bucket(in_period.c.occurred_at_utc).label("local_bucket"),
            )
            .cte("localized_trend_checkins")
            .prefix_with("MATERIALIZED", dialect="sqlite")
        )
        local_date = func.substr(localized.c.local_bucket, 1, 10)
        local_hour = cast(func.substr(localized.c.local_bucket, 12, 2), Integer)
        grouped = self.session.execute(
            select(
                local_date.label("local_date"),
                local_hour.label("local_hour"),
                func.count().label("total"),
                func.sum(case((localized.c.discovery_rank == 1, 1), else_=0)).label("discoveries"),
            )
            .select_from(localized)
            .group_by(local_date, local_hour)
        ).all()

        daily_counts = {}
        weekday_counts = [[0, 0] for _ in range(7)]
        hourly_counts = [[0, 0] for _ in range(24)]
        matrix = [[[0, 0] for _ in range(24)] for _ in range(7)]
        for row in grouped:
            day = date.fromisoformat(row.local_date)
            weekday, hour = day.weekday(), int(row.local_hour)
            total, discoveries = int(row.total), int(row.discoveries or 0)
            daily_counts.setdefault(day, [0, 0])
            daily_counts[day][0] += total
            daily_counts[day][1] += discoveries
            for bucket in (weekday_counts[weekday], hourly_counts[hour], matrix[weekday][hour]):
                bucket[0] += total
                bucket[1] += discoveries

        weekday_days = [0] * 7
        current = start
        while current <= end:
            weekday_days[current.weekday()] += 1
            current += timedelta(days=1)

        def values(bucket):
            return {
                "total": bucket[0],
                "discoveries": bucket[1],
                "repeats": bucket[0] - bucket[1],
            }

        daily = []
        current = start
        while current <= end:
            daily.append(
                DrinkingTrendDay(date=current, **values(daily_counts.get(current, [0, 0])))
            )
            current += timedelta(days=1)
        return DrinkingTrendsResponse(
            start=start,
            end=end,
            timezone=timezone_name,
            daily=daily,
            weekday=[
                DrinkingTrendWeekday(
                    weekday=i, days_in_period=weekday_days[i], **values(weekday_counts[i])
                )
                for i in range(7)
            ],
            hourly=[DrinkingTrendHour(hour=i, **values(hourly_counts[i])) for i in range(24)],
            weekday_hour=[
                DrinkingTrendWeekdayHour(weekday=day, hour=hour, **values(matrix[day][hour]))
                for day in range(7)
                for hour in range(24)
            ],
        )
