"""Bounded SQL aggregates over the authenticated user's lifetime check-ins."""

from datetime import timedelta
from decimal import Decimal
from math import ceil

from fastapi import HTTPException
from sqlalchemy import Integer, String, asc, cast, desc, func, or_, select

from ..models import Beer, BeerStyle, Brewery, Checkin
from ..schemas.explore import (
    ExploreBreweryDetailResponse,
    ExploreBreweryListResponse,
    ExploreBreweryResponse,
    ExploreCountryOptions,
)
from .explore import ExploreService, _literal_search, _untappd_url, _utc_boundary


class BreweryExplorer:
    def __init__(self, session):
        self.session = session

    def aggregate(self, user_id):
        return (
            select(
                Beer.brewery_id.label("id"),
                func.count(func.distinct(Beer.id)).label("unique_beer_count"),
                func.count(Checkin.id).label("checkin_count"),
                func.count(Checkin.rating).label("rated_checkin_count"),
                func.sum(cast(func.round(Checkin.rating * 100), Integer)).label("rating_sum"),
                func.count(func.distinct(Beer.style_id)).label("style_count"),
                func.min(Checkin.rating).label("lowest_rating"),
                func.max(Checkin.rating).label("highest_rating"),
                func.min(Checkin.occurred_at_utc).label("first_checked_in_at"),
                func.max(Checkin.occurred_at_utc).label("last_checked_in_at"),
            )
            .join(Beer, Beer.id == Checkin.beer_id)
            .where(Checkin.user_id == user_id, Beer.brewery_id.is_not(None))
            .group_by(Beer.brewery_id)
            .subquery("personal_breweries")
        )

    def query(self, user_id):
        stats = self.aggregate(user_id)
        return select(
            stats,
            Brewery.name,
            Brewery.city,
            Brewery.state,
            Brewery.country,
            Brewery.source_system,
            Brewery.external_id,
        ).join(Brewery, Brewery.id == stats.c.id)

    def summary(self, row):
        return ExploreBreweryResponse(
            **{
                key: row[key]
                for key in ExploreBreweryResponse.model_fields
                if key != "personal_average_rating"
            },
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
                        for column in [stats.name, stats.city, stats.state, stats.country]
                    ]
                )
            )
        countries = []
        if filters.get("country"):
            countries.append(stats.country.in_(filters["country"]))
        if filters.get("unknown_country"):
            countries.append(or_(stats.country.is_(None), stats.country == ""))
        if countries:
            query = query.where(or_(*countries))
        for key, column in [
            ("min_unique_beers", stats.unique_beer_count),
            ("min_checkins", stats.checkin_count),
        ]:
            if filters.get(key) is not None:
                query = query.where(column >= filters[key])
        for key, operator in [("rating_min", "ge"), ("rating_max", "le")]:
            if filters.get(key) is not None:
                bound = int(filters[key] * 100) * stats.rated_checkin_count
                query = query.where(
                    stats.rating_sum >= bound if operator == "ge" else stats.rating_sum <= bound
                )
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
            "checkins": c.checkin_count,
            "rating": fraction,
            "first_tried": c.first_checked_in_at,
            "last_tried": c.last_checked_in_at,
        }
        if field == "location":
            # Empty imported location fields are missing too. Missing components sort last.
            location = [
                func.nullif(func.lower(column), "") for column in [c.country, c.state, c.city]
            ]
            sorting = [
                expression
                for column in location
                for expression in [column.is_(None), order(column)]
            ]
        else:
            column = columns[field]
            sorting = [column.is_(None), order(column)]
        total = self.session.scalar(select(func.count()).select_from(result)) or 0
        page_size = filters.get("page_size", 25)
        pages = ceil(total / page_size)
        page = min(filters.get("page", 1), pages) if pages else 1
        rows = self.session.execute(
            select(result).order_by(*sorting, c.id).offset((page - 1) * page_size).limit(page_size)
        ).mappings()
        return ExploreBreweryListResponse(
            items=[self.summary(row) for row in rows],
            page=page,
            page_size=page_size,
            total=total,
            total_pages=pages,
        )

    def countries(self, user_id, search="", offset=0, limit=25):
        scoped = self.query(user_id).subquery()
        column = scoped.c.country
        unknown = bool(
            self.session.scalar(
                select(func.count()).select_from(scoped).where(or_(column.is_(None), column == ""))
            )
        )
        query = select(column).distinct().where(column.is_not(None), column != "")
        if search.strip():
            query = query.where(column.ilike(f"%{_literal_search(search.strip())}%", escape="\\"))
        rows = self.session.scalars(
            query.order_by(func.lower(column), column).offset(offset).limit(limit + 1)
        ).all()
        return ExploreCountryOptions(
            items=rows[:limit], unknown_available=unknown, has_more=len(rows) > limit
        )

    def detail(self, user_id, brewery_id):
        scoped = self.query(user_id).subquery()
        row = (
            self.session.execute(select(scoped).where(scoped.c.id == brewery_id))
            .mappings()
            .one_or_none()
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Brewery not found")
        scope = [Checkin.user_id == user_id, Beer.brewery_id == brewery_id]
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
        styles = (
            self.session.execute(
                select(
                    BeerStyle.id,
                    BeerStyle.name,
                    func.count(func.distinct(Beer.id)).label("unique_beer_count"),
                )
                .select_from(Checkin)
                .join(Beer, Beer.id == Checkin.beer_id)
                .join(BeerStyle, Beer.style_id == BeerStyle.id)
                .where(*scope)
                .group_by(BeerStyle.id, BeerStyle.name)
                .order_by(desc("unique_beer_count"), func.lower(BeerStyle.name), BeerStyle.id)
                .limit(5)
            )
            .mappings()
            .all()
        )
        beers = ExploreService(self.session).beers(
            user_id, brewery_id=[brewery_id], rating_min=Decimal(0), sort="rating_desc", page_size=5
        )
        return ExploreBreweryDetailResponse(
            **self.summary(row).model_dump(),
            style_count=row["style_count"],
            highest_rating=row["highest_rating"],
            lowest_rating=row["lowest_rating"],
            untappd_url=_untappd_url(row["source_system"], row["external_id"], "brewery"),
            rating_distribution=[
                dict(lower=i / 2, upper=(i + 1) / 2, count=counts.get(i, 0)) for i in range(10)
            ],
            most_explored_styles=styles,
            highest_rated_beers=beers.items,
        )
