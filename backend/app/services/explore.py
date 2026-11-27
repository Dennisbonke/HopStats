import re
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from math import ceil
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import Integer, Select, String, asc, cast, desc, func, or_, select
from sqlalchemy.orm import Session

from ..models import Beer, BeerStyle, Brewery, Checkin, Venue
from ..schemas.explore import (
    ExploreBeerDetailResponse,
    ExploreBeerListResponse,
    ExploreBeerResponse,
    ExploreBeerSort,
    ExploreBoundsResponse,
    ExploreCheckinListResponse,
    ExploreCheckinResponse,
    ExploreEntity,
    ExploreLocation,
    ExploreOptionsResponse,
    ExploreRatingPoint,
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

    def _personal_history(self, user_id: int, beer_id: int):
        return (Checkin.user_id == user_id, Checkin.beer_id == beer_id)

    def detail(self, user_id: int, beer_id: int) -> ExploreBeerDetailResponse:
        scope = self._personal_history(user_id, beer_id)
        stats = self.session.execute(
            select(
                func.count(Checkin.id),
                func.count(Checkin.rating),
                func.sum(cast(func.round(Checkin.rating * 100), Integer)),
                func.min(Checkin.rating),
                func.max(Checkin.rating),
                func.min(Checkin.occurred_at_utc),
                func.max(Checkin.occurred_at_utc),
            ).where(*scope)
        ).one()
        count, rated, total, low, high, first, last = stats
        if not count:
            raise HTTPException(status_code=404, detail="Beer not found")
        beer, brewery, style = self.session.execute(
            select(Beer, Brewery, BeerStyle)
            .outerjoin(Brewery, Beer.brewery_id == Brewery.id)
            .outerjoin(BeerStyle, Beer.style_id == BeerStyle.id)
            .where(Beer.id == beer_id)
        ).one()
        points = self.session.execute(
            select(Checkin.id, Checkin.occurred_at_utc, Checkin.rating)
            .where(*scope, Checkin.rating.is_not(None))
            .order_by(Checkin.occurred_at_utc, Checkin.id)
        )
        return ExploreBeerDetailResponse(
            id=beer.id,
            name=beer.name,
            brewery=_location(brewery),
            style=ExploreEntity(id=style.id, name=style.name) if style else None,
            abv=beer.abv,
            ibu=beer.ibu,
            photo_url=beer.photo_url,
            checkin_count=count,
            rated_checkin_count=rated,
            personal_average_rating=Decimal(total) / (100 * rated) if rated else None,
            highest_rating=high,
            lowest_rating=low,
            first_checked_in_at=first,
            last_checked_in_at=last,
            rating_history=[
                ExploreRatingPoint(id=p.id, occurred_at_utc=p.occurred_at_utc, rating=p.rating)
                for p in points
            ],
            untappd_url=_untappd_url(beer.source_system, beer.external_id, "beer"),
        )

    def checkins(
        self, user_id: int, beer_id: int, *, page=1, page_size=25, sort="newest"
    ) -> ExploreCheckinListResponse:
        scope = self._personal_history(user_id, beer_id)
        total = self.session.scalar(select(func.count(Checkin.id)).where(*scope)) or 0
        if not total:
            raise HTTPException(status_code=404, detail="Beer not found")
        total_pages = ceil(total / page_size)
        page = min(page, total_pages)
        direction = desc if sort == "newest" else asc
        # Select presentation columns explicitly: never load raw import payloads.
        rows = self.session.execute(
            select(
                Checkin.id,
                Checkin.occurred_at_utc,
                Checkin.rating,
                Checkin.comment,
                Checkin.serving_type,
                Checkin.purchase_venue,
                Checkin.photo_url,
                Checkin.source_system,
                Checkin.external_id,
                Venue,
            )
            .outerjoin(Venue, Checkin.venue_id == Venue.id)
            .where(*scope)
            .order_by(direction(Checkin.occurred_at_utc), direction(Checkin.id))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return ExploreCheckinListResponse(
            items=[
                ExploreCheckinResponse(
                    id=r.id,
                    occurred_at_utc=r.occurred_at_utc,
                    rating=r.rating,
                    comment=r.comment,
                    serving_type=r.serving_type,
                    purchase_venue=r.purchase_venue,
                    photo_url=r.photo_url,
                    venue=_location(r.Venue),
                    untappd_url=_untappd_url(r.source_system, r.external_id, "checkin"),
                )
                for r in rows
            ],
            page=page,
            page_size=page_size,
            total=total,
            total_pages=total_pages,
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


def _location(entity):
    return (
        ExploreLocation(
            id=entity.id,
            name=entity.name,
            city=entity.city,
            state=entity.state,
            country=entity.country,
        )
        if entity
        else None
    )


def _untappd_url(source, identifier, kind):
    if source != "untappd" or not identifier or not re.fullmatch(r"[1-9][0-9]{0,19}", identifier):
        return None
    prefix = {"beer": "beer", "checkin": "c", "brewery": "brewery"}[kind]
    return f"https://untappd.com/{prefix}/{identifier}"
