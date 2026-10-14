import json
from math import ceil
from typing import Any

from sqlalchemy import Select, asc, desc, func, or_, select
from sqlalchemy.orm import Session

from ..models import Beer, BeerStyle, Brewery, InventoryItem, InventorySource, Location
from ..schemas.inventory import (
    InventoryItemResponse,
    InventoryListResponse,
    InventoryStyleResponse,
    LocationPathResponse,
)


class InventoryLocationNotFound(ValueError):
    pass


class InventoryFilterError(ValueError):
    pass


SORT_COLUMNS = {
    "beer_name": Beer.name,
    "brewery": Brewery.name,
    "style": BeerStyle.name,
    "quantity": InventoryItem.quantity,
    "best_before": InventoryItem.best_before,
    "match_status": InventoryItem.match_status,
    "location": Location.name,
    "imported": InventoryItem.imported_at,
}


class InventoryService:
    """SQL-backed, record-level inventory browsing for one authenticated user."""

    def __init__(self, session: Session):
        self.session = session

    def list_inventory(
        self,
        user_id: int,
        *,
        search: str | None = None,
        location_id: int | None = None,
        include_descendants: bool = True,
        unresolved: bool = False,
        match_status: str | None = None,
        style_id: int | None = None,
        page: int = 1,
        page_size: int = 25,
        sort: str = "beer_name_asc",
    ) -> InventoryListResponse:
        if location_id is not None and unresolved:
            raise InventoryFilterError("location_id and unresolved cannot be combined")

        source_id = self._source_id(user_id)
        query = self._base_query(user_id, source_id)
        query = self._apply_filters(
            query,
            user_id=user_id,
            search=search,
            location_id=location_id,
            include_descendants=include_descendants,
            unresolved=unresolved,
            match_status=match_status,
            style_id=style_id,
        )
        total = self.session.scalar(select(func.count()).select_from(query.subquery())) or 0
        order_column, descending = self._sort(sort)
        query = query.order_by(
            (desc(order_column) if descending else asc(order_column)),
            asc(InventoryItem.id),
        )
        rows = self.session.execute(query.offset((page - 1) * page_size).limit(page_size)).all()
        locations = self._location_paths(user_id)
        items = [self._response(row, locations, include_metadata=False) for row in rows]
        return InventoryListResponse(
            items=items,
            page=page,
            page_size=page_size,
            total=int(total),
            total_pages=ceil(total / page_size) if total else 0,
        )

    def get_inventory(self, user_id: int, item_id: int) -> InventoryItemResponse | None:
        source_id = self._source_id(user_id)
        if source_id is None:
            return None
        row = self.session.execute(
            self._base_query(user_id, source_id).where(InventoryItem.id == item_id)
        ).first()
        if row is None:
            return None
        return self._response(row, self._location_paths(user_id), include_metadata=True)

    def styles(self, user_id: int) -> list[InventoryStyleResponse]:
        source_id = self._source_id(user_id)
        if source_id is None:
            return []
        rows = self.session.execute(
            select(BeerStyle.id, BeerStyle.name)
            .join(Beer, Beer.style_id == BeerStyle.id)
            .join(InventoryItem, InventoryItem.beer_id == Beer.id)
            .where(
                InventoryItem.user_id == user_id,
                InventoryItem.inventory_source_id == source_id,
            )
            .distinct()
            .order_by(asc(BeerStyle.name), asc(BeerStyle.id))
        ).all()
        return [InventoryStyleResponse(id=row.id, name=row.name) for row in rows]

    def _source_id(self, user_id: int) -> int | None:
        return self.session.scalar(
            select(InventorySource.id)
            .where(
                InventorySource.user_id == user_id,
                InventorySource.is_authoritative.is_(True),
            )
            .order_by(InventorySource.created_at.desc(), InventorySource.id.desc())
            .limit(1)
        )

    def _base_query(self, user_id: int, source_id: int | None) -> Select[Any]:
        query = (
            select(InventoryItem, Beer, Brewery, BeerStyle, Location, InventorySource)
            .join(Beer, Beer.id == InventoryItem.beer_id)
            .outerjoin(Brewery, Brewery.id == Beer.brewery_id)
            .outerjoin(BeerStyle, BeerStyle.id == Beer.style_id)
            .outerjoin(
                Location,
                (Location.id == InventoryItem.location_id) & (Location.user_id == user_id),
            )
            .join(InventorySource, InventorySource.id == InventoryItem.inventory_source_id)
            .where(
                InventoryItem.user_id == user_id,
                InventorySource.user_id == user_id,
                InventorySource.is_authoritative.is_(True),
            )
        )
        if source_id is not None:
            query = query.where(InventoryItem.inventory_source_id == source_id)
        else:
            query = query.where(False)
        return query

    def _apply_filters(
        self,
        query: Select[Any],
        *,
        user_id: int,
        search: str | None,
        location_id: int | None,
        include_descendants: bool,
        unresolved: bool,
        match_status: str | None,
        style_id: int | None,
    ) -> Select[Any]:
        if search and search.strip():
            value = _literal_search(search.strip())
            query = query.where(
                or_(
                    Beer.name.ilike(f"%{value}%", escape="\\"),
                    Brewery.name.ilike(f"%{value}%", escape="\\"),
                    InventoryItem.notes.ilike(f"%{value}%", escape="\\"),
                )
            )
        if location_id is not None:
            location = self.session.scalar(
                select(Location.id).where(Location.id == location_id, Location.user_id == user_id)
            )
            if location is None:
                raise InventoryLocationNotFound("location not found")
            if include_descendants:
                tree = select(Location.id.label("id")).where(
                    Location.id == location_id, Location.user_id == user_id
                )
                tree = tree.cte("inventory_location_tree", recursive=True)
                tree = tree.union_all(
                    select(Location.id)
                    .join(tree, Location.parent_id == tree.c.id)
                    .where(Location.user_id == user_id)
                )
                query = query.where(InventoryItem.location_id.in_(select(tree.c.id)))
            else:
                query = query.where(InventoryItem.location_id == location_id)
        elif unresolved:
            query = query.where(InventoryItem.location_id.is_(None))
        if match_status:
            query = query.where(InventoryItem.match_status == match_status)
        if style_id is not None:
            query = query.where(Beer.style_id == style_id)
        return query

    def _sort(self, sort: str):
        if sort.startswith("-"):
            descending = True
            key = sort[1:]
        elif sort.endswith("_desc"):
            descending = True
            key = sort[:-5]
        elif sort.endswith("_asc"):
            descending = False
            key = sort[:-4]
        else:
            descending = False
            key = sort
        if key not in SORT_COLUMNS:
            raise InventoryFilterError("unsupported inventory sort")
        return SORT_COLUMNS[key], descending

    def _location_paths(self, user_id: int) -> dict[int, LocationPathResponse]:
        locations = self.session.scalars(select(Location).where(Location.user_id == user_id)).all()
        by_id = {location.id: location for location in locations}
        paths: dict[int, LocationPathResponse] = {}

        def build(location: Location, visiting: set[int] | None = None) -> str:
            if location.id in paths:
                return paths[location.id].path
            visiting = visiting or set()
            if location.id in visiting:
                return location.name
            visiting.add(location.id)
            if location.parent_id is None or location.parent_id not in by_id:
                path = location.name
            else:
                path = f"{build(by_id[location.parent_id], visiting)} → {location.name}"
            paths[location.id] = LocationPathResponse(id=location.id, name=location.name, path=path)
            return path

        for location in locations:
            build(location)
        return paths

    def _response(
        self,
        row: tuple[Any, ...],
        locations: dict[int, LocationPathResponse],
        *,
        include_metadata: bool,
    ) -> InventoryItemResponse:
        item, beer, brewery, style, location, source = row
        metadata = None
        if include_metadata and item.source_payload_json:
            try:
                decoded = json.loads(item.source_payload_json)
                if isinstance(decoded, dict):
                    metadata = decoded
            except (TypeError, ValueError):
                metadata = None
        return InventoryItemResponse(
            id=item.id,
            source_item_id=item.source_item_id,
            source_system=source.source_system,
            source_name=source.name,
            beer_id=beer.id,
            beer_name=beer.name,
            brewery_name=brewery.name if brewery else None,
            style_id=style.id if style else None,
            style_name=style.name if style else None,
            abv=beer.abv,
            ibu=beer.ibu,
            photo_url=item.photo_url or beer.photo_url,
            quantity=item.quantity,
            container=item.container,
            notes=item.notes,
            purchase_date=item.purchase_date,
            bottled_date=item.bottled_date,
            best_before=item.best_before,
            raw_best_before=item.raw_best_before,
            best_before_suspicious=item.best_before_suspicious,
            purchase_location=item.purchase_location,
            purchase_price=item.purchase_price,
            created_at_source=item.created_at_source,
            imported_at=item.imported_at,
            location=locations.get(item.location_id) if item.location_id else None,
            location_resolution_status=getattr(item, "location_resolution_status", "unresolved"),
            location_resolution_source=getattr(item, "location_resolution_source", None),
            location_resolution_detail=getattr(item, "location_resolution_detail", None),
            match_status=item.match_status,
            matched_checkin_beer_id=item.matched_checkin_beer_id,
            source_metadata=metadata,
        )


def _literal_search(value: str) -> str:
    """Escape LIKE syntax so the public search field remains literal text."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
