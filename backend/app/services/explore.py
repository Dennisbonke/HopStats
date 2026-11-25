from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from math import ceil
from zoneinfo import ZoneInfo

from sqlalchemy import Integer, Select, String, asc, cast, desc, func, or_, select
from sqlalchemy.orm import Session

from ..models import Beer, BeerStyle, Brewery, Checkin
from ..schemas.explore import (
    ExploreBeerListResponse,
    ExploreBeerResponse,
    ExploreBeerSort,
    ExploreBoundsResponse,
    ExploreEntity,
    ExploreOptionsResponse,
)


class ExploreService:
    """User-scoped beer catalogue derived only from that user's check-ins."""

    def __init__(self, session: Session):
        self.session = session

    def beers(
        self,
        user_id: int,
        *,
        search: str | None = None,
        sort: ExploreBeerSort = "last_tried_desc",
        page: int = 1,
        page_size: int = 25,
        brewery_id: list[int] | None = None,
        style_id: list[int] | None = None,
        abv_min: Decimal | None = None,
        abv_max: Decimal | None = None,
        rating_min: Decimal | None = None,
        rating_max: Decimal | None = None,
        first_tried_from: date | None = None,
        first_tried_to: date | None = None,
        last_tried_from: date | None = None,
        last_tried_to: date | None = None,
    ) -> ExploreBeerListResponse:
        stats = (
            select(
                Checkin.beer_id.label("beer_id"),
                func.count(Checkin.id).label("checkin_count"),
                func.count(Checkin.rating).label("rated_checkin_count"),
                # Import and Numeric(3, 2) store individual ratings to hundredths.
                # Recover those integers from SQLite's numeric storage, including 0.
                func.sum(cast(func.round(Checkin.rating * 100), Integer)).label("rating_sum"),
                func.min(Checkin.occurred_at_utc).label("first_checked_in_at"),
                func.max(Checkin.occurred_at_utc).label("last_checked_in_at"),
            )
            .where(Checkin.user_id == user_id)
            .group_by(Checkin.beer_id)
            .subquery("user_beer_stats")
        )
        query = (
            select(
                Beer.id.label("id"),
                Beer.name.label("name"),
                Brewery.id.label("brewery_id"),
                Brewery.name.label("brewery_name"),
                BeerStyle.id.label("style_id"),
                BeerStyle.name.label("style_name"),
                Beer.abv.label("abv"),
                Beer.ibu.label("ibu"),
                Beer.photo_url.label("photo_url"),
                stats.c.checkin_count,
                stats.c.rated_checkin_count,
                stats.c.rating_sum,
                stats.c.first_checked_in_at,
                stats.c.last_checked_in_at,
            )
            .join(stats, stats.c.beer_id == Beer.id)
            .outerjoin(Brewery, Brewery.id == Beer.brewery_id)
            .outerjoin(BeerStyle, BeerStyle.id == Beer.style_id)
        )
        cleaned_search = (search or "").strip()
        if cleaned_search:
            value = _literal_search(cleaned_search)
            query = query.where(
                or_(
                    Beer.name.ilike(f"%{value}%", escape="\\"),
                    Brewery.name.ilike(f"%{value}%", escape="\\"),
                )
            )

        if brewery_id:
            query = query.where(Beer.brewery_id.in_(brewery_id))
        if style_id:
            query = query.where(Beer.style_id.in_(style_id))
        if abv_min is not None:
            query = query.where(Beer.abv >= abv_min)
        if abv_max is not None:
            query = query.where(Beer.abv <= abv_max)
        # Compare rational means exactly, without division or rounded averages.
        if rating_min is not None:
            query = query.where(
                stats.c.rating_sum >= int(rating_min * 100) * stats.c.rated_checkin_count
            )
        if rating_max is not None:
            query = query.where(
                stats.c.rating_sum <= int(rating_max * 100) * stats.c.rated_checkin_count
            )
        # Inclusive Amsterdam calendar days, converted to half-open UTC bounds.
        # Convert each midnight separately so DST days can contain 23 or 25 hours.
        for column, low, high in [
            (stats.c.first_checked_in_at, first_tried_from, first_tried_to),
            (stats.c.last_checked_in_at, last_tried_from, last_tried_to),
        ]:
            if low is not None:
                query = query.where(column >= _utc_boundary(low))
            if high is not None:
                query = query.where(column < _utc_boundary(high + timedelta(days=1)))

        filtered = query.subquery("filtered_user_beers")
        total = self.session.scalar(select(func.count()).select_from(filtered)) or 0
        rows = self.session.execute(
            select(filtered)
            .order_by(*_sort_order(sort, filtered))
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).mappings()
        items = [
            ExploreBeerResponse(
                id=row["id"],
                name=row["name"],
                brewery=(
                    ExploreEntity(id=row["brewery_id"], name=row["brewery_name"])
                    if row["brewery_id"] is not None
                    else None
                ),
                style=(
                    ExploreEntity(id=row["style_id"], name=row["style_name"])
                    if row["style_id"] is not None
                    else None
                ),
                abv=row["abv"],
                ibu=row["ibu"],
                photo_url=row["photo_url"],
                checkin_count=row["checkin_count"],
                rated_checkin_count=row["rated_checkin_count"],
                personal_average_rating=(
                    Decimal(row["rating_sum"]) / (100 * row["rated_checkin_count"])
                    if row["rated_checkin_count"]
                    else None
                ),
                first_checked_in_at=row["first_checked_in_at"],
                last_checked_in_at=row["last_checked_in_at"],
            )
            for row in rows
        ]
        return ExploreBeerListResponse(
            items=items,
            page=page,
            page_size=page_size,
            total=int(total),
            total_pages=ceil(total / page_size) if total else 0,
        )

    def options(self, user_id, category, *, search="", selected_ids=None, offset=0, limit=25):
        entity = Brewery if category == "breweries" else BeerStyle
        foreign_key = Beer.brewery_id if category == "breweries" else Beer.style_id
        # Resolve user membership once, using the user-prefixed unique index.
        user_beers = select(Checkin.beer_id).where(Checkin.user_id == user_id).distinct()
        query = (
            select(entity.id, entity.name)
            .join(Beer, foreign_key == entity.id)
            .where(Beer.id.in_(user_beers))
            .distinct()
        )
        if selected_ids is not None:
            query = query.where(entity.id.in_(selected_ids))
        elif search.strip():
            query = query.where(
                entity.name.ilike(f"%{_literal_search(search.strip())}%", escape="\\")
            )
        rows = self.session.execute(
            query.order_by(func.lower(entity.name), entity.id).offset(offset).limit(limit + 1)
        ).all()
        return ExploreOptionsResponse(
            items=[ExploreEntity(id=row.id, name=row.name) for row in rows[:limit]],
            has_more=len(rows) > limit,
        )

    def bounds(self, user_id):
        user_beers = select(Checkin.beer_id).where(Checkin.user_id == user_id).distinct()
        maximum = self.session.scalar(select(func.max(Beer.abv)).where(Beer.id.in_(user_beers)))
        return ExploreBoundsResponse(abv_max=max(20, float(maximum or 0)))


def _utc_boundary(day: date) -> datetime:
    return (
        datetime.combine(day, time.min, tzinfo=ZoneInfo("Europe/Amsterdam"))
        .astimezone(UTC)
        .replace(tzinfo=None)
    )


def _sort_order(sort: ExploreBeerSort, query: Select):
    field, direction = sort.rsplit("_", 1)
    columns = {
        "name": func.lower(query.c.name),
        "brewery": func.lower(query.c.brewery_name),
        "style": func.lower(query.c.style_name),
        "abv": query.c.abv,
        "rating": (
            cast(query.c.rating_sum, String) + "/" + cast(query.c.rated_checkin_count, String)
        ).collate("rating_fraction"),
        "first_tried": query.c.first_checked_in_at,
        "last_tried": query.c.last_checked_in_at,
        "checkins": query.c.checkin_count,
    }
    column = columns[field]
    return [column.is_(None), asc(column) if direction == "asc" else desc(column), asc(query.c.id)]


def _literal_search(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
