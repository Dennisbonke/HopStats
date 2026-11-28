"""Bounded SQL aggregates over the authenticated user's lifetime check-ins."""

from datetime import timedelta
from decimal import Decimal
from math import ceil

from fastapi import HTTPException
from sqlalchemy import Integer, String, asc, cast, desc, func, or_, select

from ..models import Beer, BeerStyle, Brewery, Checkin
from ..schemas.explore import (
    ExploreStyleDetailResponse,
    ExploreStyleListResponse,
    ExploreStyleResponse,
)
from .explore import ExploreService, _literal_search, _utc_boundary


class StyleExplorer:
    def __init__(self, session):
        self.session = session

    def aggregate(self, user_id):
        beers = (
            select(Beer.id, Beer.style_id, Beer.abv)
            .join(Checkin, Checkin.beer_id == Beer.id)
            .where(Checkin.user_id == user_id, Beer.style_id.is_not(None))
            .distinct()
            .subquery("personal_style_beers")
        )
        abv = (
            select(
                beers.c.style_id.label("id"),
                func.sum(cast(func.round(beers.c.abv * 100), Integer)).label("abv_sum"),
                func.count(beers.c.abv).label("known_abv_beer_count"),
            )
            .group_by(beers.c.style_id)
            .subquery("style_abv")
        )
        stats = (
            select(
                Beer.style_id.label("id"),
                func.count(func.distinct(Beer.id)).label("unique_beer_count"),
                func.count(func.distinct(Beer.brewery_id)).label("brewery_count"),
                func.count(Checkin.id).label("checkin_count"),
                func.count(Checkin.rating).label("rated_checkin_count"),
                func.sum(cast(func.round(Checkin.rating * 100), Integer)).label("rating_sum"),
                func.min(Checkin.rating).label("lowest_rating"),
                func.max(Checkin.rating).label("highest_rating"),
                func.min(Checkin.occurred_at_utc).label("first_checked_in_at"),
                func.max(Checkin.occurred_at_utc).label("last_checked_in_at"),
            )
            .join(Beer, Beer.id == Checkin.beer_id)
            .where(Checkin.user_id == user_id, Beer.style_id.is_not(None))
            .group_by(Beer.style_id)
            .subquery("personal_styles")
        )
        return (
            select(stats, abv.c.abv_sum, abv.c.known_abv_beer_count)
            .join(abv, abv.c.id == stats.c.id)
            .subquery()
        )

    def query(self, user_id):
        stats = self.aggregate(user_id)
        return select(stats, BeerStyle.name).join(BeerStyle, BeerStyle.id == stats.c.id)

    def summary(self, row):
        return ExploreStyleResponse(
            **{
                key: row[key]
                for key in ExploreStyleResponse.model_fields
                if key not in {"personal_average_rating", "average_abv"}
            },
            average_abv=(
                Decimal(row["abv_sum"]) / (100 * row["known_abv_beer_count"])
                if row["known_abv_beer_count"]
                else None
            ),
            personal_average_rating=(
                Decimal(row["rating_sum"]) / (100 * row["rated_checkin_count"])
                if row["rated_checkin_count"]
                else None
            ),
        )

    def catalogue(self, user_id, **filters):
        scoped = self.query(user_id).subquery()
        query = select(scoped)
        stats = scoped.c
        value = (filters.get("search") or "").strip()
        if value:
            query = query.where(
                or_(
                    *[
                        column.ilike(f"%{_literal_search(value)}%", escape="\\")
                        for column in [stats.name]
                    ]
                )
            )
        for key, column in [
            ("min_unique_beers", stats.unique_beer_count),
            ("min_checkins", stats.checkin_count),
            ("min_breweries", stats.brewery_count),
        ]:
            if filters.get(key) is not None:
                query = query.where(column >= filters[key])
        for key, operator in [("rating_min", "ge"), ("rating_max", "le")]:
            if filters.get(key) is not None:
                bound = int(filters[key] * 100) * stats.rated_checkin_count
                query = query.where(
                    stats.rating_sum >= bound if operator == "ge" else stats.rating_sum <= bound
                )
        for key, minimum in [("abv_min", True), ("abv_max", False)]:
            if filters.get(key) is not None:
                bound = int(filters[key] * 100) * stats.known_abv_beer_count
                query = query.where(stats.abv_sum >= bound if minimum else stats.abv_sum <= bound)
        for prefix, column in [
            ("first_tried", stats.first_checked_in_at),
            ("last_tried", stats.last_checked_in_at),
        ]:
            if filters.get(f"{prefix}_from"):
                query = query.where(column >= _utc_boundary(filters[f"{prefix}_from"]))
            if filters.get(f"{prefix}_to"):
                query = query.where(
                    column < _utc_boundary(filters[f"{prefix}_to"] + timedelta(days=1))
                )
        result = query.subquery()
        c = result.c
        field, direction = filters.get("sort", "unique_beers_desc").rsplit("_", 1)
        order = asc if direction == "asc" else desc
        fraction = (cast(c.rating_sum, String) + "/" + cast(c.rated_checkin_count, String)).collate(
            "rating_fraction"
        )
        columns = {
            "name": func.lower(c.name),
            "unique_beers": c.unique_beer_count,
            "breweries": c.brewery_count,
            "checkins": c.checkin_count,
            "rating": fraction,
            "first_tried": c.first_checked_in_at,
            "last_tried": c.last_checked_in_at,
        }
        column = columns[field]
        sorting = [column.is_(None), order(column)]
        total = self.session.scalar(select(func.count()).select_from(result)) or 0
        page_size = filters.get("page_size", 25)
        pages = ceil(total / page_size)
        page = min(filters.get("page", 1), pages) if pages else 1
        rows = self.session.execute(
            select(result).order_by(*sorting, c.id).offset((page - 1) * page_size).limit(page_size)
        ).mappings()
        return ExploreStyleListResponse(
            items=[self.summary(row) for row in rows],
            page=page,
            page_size=page_size,
            total=total,
            total_pages=pages,
        )

    def bounds(self, user_id):
        stats = self.query(user_id).subquery().c
        value = self.session.scalar(
            select(
                func.max(stats.abv_sum * 1.0 / (100 * func.nullif(stats.known_abv_beer_count, 0)))
            )
        )
        return {"abv_max": value or 0}

    def detail(self, user_id, style_id):
        scoped = self.query(user_id).subquery()
        row = (
            self.session.execute(select(scoped).where(scoped.c.id == style_id))
            .mappings()
            .one_or_none()
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Style not found")
        scope = [Checkin.user_id == user_id, Beer.style_id == style_id]
        # Integer hundredths make every boundary exact, including 0 and 5.
        bucket = func.min(cast(cast(func.round(Checkin.rating * 100), Integer) / 50, Integer), 9)
        counts = dict(
            self.session.execute(
                select(bucket, func.count(Checkin.id))
                .join(Beer, Beer.id == Checkin.beer_id)
                .where(*scope, Checkin.rating.is_not(None))
                .group_by(bucket)
            ).all()
        )
        breweries = (
            self.session.execute(
                select(
                    Brewery.id,
                    Brewery.name,
                    func.count(func.distinct(Beer.id)).label("unique_beer_count"),
                )
                .select_from(Checkin)
                .join(Beer, Beer.id == Checkin.beer_id)
                .join(Brewery, Beer.brewery_id == Brewery.id)
                .where(*scope)
                .group_by(Brewery.id, Brewery.name)
                .order_by(desc("unique_beer_count"), func.lower(Brewery.name), Brewery.id)
                .limit(5)
            )
            .mappings()
            .all()
        )
        beers = ExploreService(self.session).beers(
            user_id, style_id=[style_id], rating_min=Decimal(0), sort="rating_desc", page_size=5
        )
        return ExploreStyleDetailResponse(
            **self.summary(row).model_dump(),
            highest_rating=row["highest_rating"],
            lowest_rating=row["lowest_rating"],
            rating_distribution=[
                dict(lower=i / 2, upper=(i + 1) / 2, count=counts.get(i, 0)) for i in range(10)
            ],
            most_explored_breweries=breweries,
            highest_rated_beers=beers.items,
        )
