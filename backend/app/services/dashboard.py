from datetime import datetime
from decimal import Decimal

from sqlalchemy import case, distinct, func, select
from sqlalchemy.orm import Session

from ..models import Beer, Brewery, Checkin, ImportRun, InventoryItem, InventorySource
from ..schemas.dashboard import (
    DashboardFreshnessResponse,
    DashboardResponse,
    MatchCoverageResponse,
)


class DashboardService:
    """Read-only SQL aggregates for the current user's dashboard."""

    def __init__(self, session: Session):
        self.session = session

    def get_dashboard(self, user_id: int) -> DashboardResponse:
        checkins = self._checkin_metrics(user_id)
        inventory = self._inventory_metrics(user_id)
        freshness = self._freshness(user_id)
        return DashboardResponse(
            total_checkins=checkins["total"],
            unique_beers=checkins["beers"],
            unique_breweries=checkins["breweries"],
            unique_styles=checkins["styles"],
            average_personal_rating=checkins["average"],
            rated_checkins=checkins["rated"],
            inventory_units=inventory["units"],
            unique_inventory_beers=inventory["unique_beers"],
            not_confirmed_checked_in=inventory["not_confirmed"],
            match_coverage=MatchCoverageResponse(**inventory["coverage"]),
            freshness=DashboardFreshnessResponse(**freshness),
        )

    def _checkin_metrics(self, user_id: int) -> dict[str, int | Decimal | None]:
        row = self.session.execute(
            select(
                func.count(Checkin.id),
                func.count(distinct(Checkin.beer_id)),
                func.count(distinct(Brewery.id)),
                func.count(distinct(Beer.style_id)),
                func.sum(Checkin.rating),
                func.count(Checkin.rating),
            )
            .select_from(Checkin)
            .join(Beer, Beer.id == Checkin.beer_id)
            .outerjoin(Brewery, Brewery.id == Beer.brewery_id)
            .where(Checkin.user_id == user_id)
        ).one()
        total, beers, breweries, styles, rating_sum, rated = row
        average = None
        if rated:
            average = Decimal(str(rating_sum)) / Decimal(rated)
        return {
            "total": total,
            "beers": beers,
            "breweries": breweries,
            "styles": styles,
            "average": average,
            "rated": rated,
        }

    def _inventory_metrics(self, user_id: int) -> dict:
        source_id = self.session.scalar(
            select(InventorySource.id)
            .where(
                InventorySource.user_id == user_id,
                InventorySource.is_authoritative.is_(True),
            )
            .order_by(InventorySource.created_at.desc(), InventorySource.id.desc())
            .limit(1)
        )
        coverage = {"external_id": 0, "exact": 0, "ambiguous": 0, "unmatched": 0}
        if source_id is None:
            return {"units": 0, "unique_beers": 0, "not_confirmed": 0, "coverage": coverage}

        rank = case(
            (InventoryItem.match_status == "external_id", 4),
            (InventoryItem.match_status == "exact", 3),
            (InventoryItem.match_status == "ambiguous", 2),
            else_=1,
        )
        identity_states = (
            select(InventoryItem.beer_id.label("beer_id"), func.max(rank).label("rank"))
            .where(
                InventoryItem.user_id == user_id,
                InventoryItem.inventory_source_id == source_id,
            )
            .group_by(InventoryItem.beer_id)
            .subquery()
        )
        for state_rank, count in self.session.execute(
            select(identity_states.c.rank, func.count())
            .select_from(identity_states)
            .group_by(identity_states.c.rank)
        ):
            coverage[{4: "external_id", 3: "exact", 2: "ambiguous", 1: "unmatched"}[state_rank]] = (
                count
            )

        units = self.session.scalar(
            select(func.coalesce(func.sum(InventoryItem.quantity), 0)).where(
                InventoryItem.user_id == user_id,
                InventoryItem.inventory_source_id == source_id,
            )
        )
        unique_beers = sum(coverage.values())
        return {
            "units": int(units or 0),
            "unique_beers": unique_beers,
            "not_confirmed": coverage["ambiguous"] + coverage["unmatched"],
            "coverage": coverage,
        }

    def _freshness(self, user_id: int) -> dict[str, datetime | None]:
        result: dict[str, datetime | None] = {}
        for source_type, key in (("checkins", "checkins"), ("inventory", "inventory")):
            latest = self.session.scalar(
                select(ImportRun)
                .where(
                    ImportRun.user_id == user_id,
                    ImportRun.source_type == source_type,
                    ImportRun.status == "completed",
                )
                .order_by(ImportRun.completed_at.desc())
            )
            result[f"{key}_last_imported_at"] = latest.completed_at if latest else None
            result[f"{key}_source_exported_at"] = latest.source_exported_at if latest else None
        return result
