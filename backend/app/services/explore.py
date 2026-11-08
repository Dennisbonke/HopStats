from math import ceil
from typing import Literal

from sqlalchemy import Select, asc, desc, func, or_, select
from sqlalchemy.orm import Session

from ..models import Beer, BeerStyle, Brewery, Checkin
from ..schemas.explore import ExploreBeerListResponse, ExploreBeerResponse, ExploreEntity

ExploreBeerSort = Literal[
    "name_asc",
    "name_desc",
    "last_tried_desc",
    "last_tried_asc",
    "checkins_desc",
    "checkins_asc",
]


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
    ) -> ExploreBeerListResponse:
        stats = (
            select(
                Checkin.beer_id.label("beer_id"),
                func.count(Checkin.id).label("checkin_count"),
                func.count(Checkin.rating).label("rated_checkin_count"),
                func.avg(Checkin.rating).label("personal_average_rating"),
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
                stats.c.personal_average_rating,
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
                personal_average_rating=row["personal_average_rating"],
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


def _sort_order(sort: ExploreBeerSort, query: Select):
    name = func.lower(query.c.name)
    if sort == "name_asc":
        primary = asc(name)
    elif sort == "name_desc":
        primary = desc(name)
    elif sort == "last_tried_asc":
        primary = asc(query.c.last_checked_in_at)
    elif sort == "last_tried_desc":
        primary = desc(query.c.last_checked_in_at)
    elif sort == "checkins_asc":
        primary = asc(query.c.checkin_count)
    else:
        primary = desc(query.c.checkin_count)
    return [primary, asc(query.c.id)]


def _literal_search(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
