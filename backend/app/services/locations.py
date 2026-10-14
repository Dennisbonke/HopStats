import json
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import InventoryItem, InventorySource, Location, LocationAlias, LocationResolutionRule
from ..schemas.locations import (
    LocationDetailResponse,
    LocationListResponse,
    LocationNodeResponse,
    UnresolvedLocationResponse,
)
from .location_resolution import LocationResolution, LocationResolver, normalize_location


class LocationConfigurationError(ValueError):
    pass


class LocationNotFound(ValueError):
    pass


@dataclass(frozen=True)
class LocationCounts:
    records: int = 0
    units: int = 0


class LocationService:
    def __init__(self, session: Session):
        self.session = session

    def create_location(
        self,
        user_id: int,
        name: str,
        parent_id: int | None = None,
        description: str | None = None,
    ) -> Location:
        name = " ".join(name.split()).strip()
        if not name:
            raise LocationConfigurationError("location name cannot be empty")
        if (
            parent_id is not None
            and self.session.scalar(
                select(Location.id).where(Location.id == parent_id, Location.user_id == user_id)
            )
            is None
        ):
            raise LocationConfigurationError("parent location not found for this user")
        sibling = self.session.scalars(
            select(Location).where(Location.user_id == user_id, Location.parent_id == parent_id)
        ).all()
        if any(normalize_location(item.name) == normalize_location(name) for item in sibling):
            raise LocationConfigurationError("location name must be unique among siblings")
        location = Location(
            user_id=user_id, parent_id=parent_id, name=name, description=description
        )
        self.session.add(location)
        self.session.flush()
        return location

    def move_location(self, user_id: int, location_id: int, parent_id: int | None) -> Location:
        location = self.session.scalar(
            select(Location).where(Location.id == location_id, Location.user_id == user_id)
        )
        if location is None:
            raise LocationNotFound("location not found")
        if parent_id == location_id:
            raise LocationConfigurationError("location cannot be its own parent")
        if parent_id is not None:
            if (
                self.session.scalar(
                    select(Location.id).where(Location.id == parent_id, Location.user_id == user_id)
                )
                is None
            ):
                raise LocationConfigurationError("parent location not found for this user")
            if parent_id in self._descendant_ids(user_id, location_id):
                raise LocationConfigurationError("location parent change would create a cycle")
        sibling = self.session.scalars(
            select(Location).where(
                Location.user_id == user_id,
                Location.parent_id == parent_id,
                Location.id != location_id,
            )
        ).all()
        if any(
            normalize_location(item.name) == normalize_location(location.name) for item in sibling
        ):
            raise LocationConfigurationError("location name must be unique among siblings")
        location.parent_id = parent_id
        self.session.flush()
        return location

    def create_alias(self, user_id: int, location_id: int, alias: str) -> LocationAlias:
        if (
            self.session.scalar(
                select(Location.id).where(Location.id == location_id, Location.user_id == user_id)
            )
            is None
        ):
            raise LocationConfigurationError("location not found for this user")
        normalized = normalize_location(alias)
        if not normalized:
            raise LocationConfigurationError("alias cannot be empty")
        existing = self.session.scalar(
            select(LocationAlias).where(
                LocationAlias.user_id == user_id, LocationAlias.normalized_alias == normalized
            )
        )
        if existing is not None:
            if existing.location_id != location_id:
                raise LocationConfigurationError("alias conflicts with another location")
            existing.alias = alias.strip()
            return existing
        result = LocationAlias(
            user_id=user_id,
            location_id=location_id,
            alias=alias.strip(),
            normalized_alias=normalized,
        )
        self.session.add(result)
        self.session.flush()
        return result

    def create_rule(
        self,
        user_id: int,
        location_id: int,
        pattern: str,
        match_kind: str,
        priority: int = 0,
    ) -> LocationResolutionRule:
        if match_kind not in {"exact", "line", "prefix"}:
            raise LocationConfigurationError("unsupported location rule kind")
        if (
            self.session.scalar(
                select(Location.id).where(Location.id == location_id, Location.user_id == user_id)
            )
            is None
        ):
            raise LocationConfigurationError("location not found for this user")
        normalized = " ".join(pattern.split()).strip()
        existing = self.session.scalar(
            select(LocationResolutionRule).where(
                LocationResolutionRule.user_id == user_id,
                LocationResolutionRule.pattern == normalized,
                LocationResolutionRule.match_kind == match_kind,
            )
        )
        if existing is not None:
            if existing.location_id != location_id:
                raise LocationConfigurationError("rule conflicts with another location")
            existing.priority = priority
            return existing
        result = LocationResolutionRule(
            user_id=user_id,
            location_id=location_id,
            pattern=normalized,
            match_kind=match_kind,
            priority=priority,
        )
        self.session.add(result)
        self.session.flush()
        return result

    def resolve_item(
        self, user_id: int, item: InventoryItem, resolver: LocationResolver | None = None
    ) -> LocationResolution:
        if item.location_assignment_kind == "explicit" and item.location_id is not None:
            return LocationResolution(
                "resolved", item.location_id, "manual", "Explicit assignment preserved."
            )
        resolver = resolver or LocationResolver(self.session, user_id)
        return resolver.resolve(item.notes)

    def reconcile(self, user_id: int) -> int:
        resolver = LocationResolver(self.session, user_id)
        source_ids = select(InventorySource.id).where(
            InventorySource.user_id == user_id, InventorySource.is_authoritative.is_(True)
        )
        items = self.session.scalars(
            select(InventoryItem).where(
                InventoryItem.user_id == user_id, InventoryItem.inventory_source_id.in_(source_ids)
            )
        ).all()
        changed = 0
        for item in items:
            result = self.resolve_item(user_id, item, resolver)
            changed += self._apply_resolution(item, result)
        return changed

    @staticmethod
    def _apply_resolution(item: InventoryItem, result: LocationResolution) -> int:
        values: dict[str, Any] = {
            "location_id": result.location_id,
            "location_resolution_status": result.status,
            "location_resolution_source": result.source,
            "location_resolution_detail": result.detail,
            "location_assignment_kind": "automatic",
        }
        if item.location_assignment_kind == "explicit" and item.location_id is not None:
            values["location_assignment_kind"] = "explicit"
        changed = any(getattr(item, key) != value for key, value in values.items())
        for key, value in values.items():
            setattr(item, key, value)
        return int(changed)

    def tree(self, user_id: int) -> LocationListResponse:
        locations = self.session.scalars(
            select(Location).where(Location.user_id == user_id).order_by(Location.id)
        ).all()
        counts = self._counts(user_id)
        aliases: dict[int, list[str]] = defaultdict(list)
        for alias in self.session.scalars(
            select(LocationAlias)
            .where(LocationAlias.user_id == user_id)
            .order_by(LocationAlias.alias)
        ):
            aliases[alias.location_id].append(alias.alias)
        by_id = {location.id: location for location in locations}
        paths = self._paths(by_id)
        children: dict[int | None, list[Location]] = defaultdict(list)
        for location in locations:
            children[location.parent_id].append(location)

        def node(location: Location) -> LocationNodeResponse:
            count = counts.get(location.id, LocationCounts())
            return LocationNodeResponse(
                id=location.id,
                name=location.name,
                parent_id=location.parent_id,
                description=location.description,
                path=paths[location.id],
                aliases=aliases[location.id],
                record_count=count.records,
                total_units=count.units,
                children=[node(child) for child in children[location.id]],
            )

        unresolved = self._unresolved_counts(user_id)
        return LocationListResponse(
            locations=[node(location) for location in children[None]],
            unresolved=UnresolvedLocationResponse(
                record_count=unresolved[0], total_units=unresolved[1]
            ),
        )

    def detail(self, user_id: int, location_id: int) -> LocationDetailResponse | None:
        response = self.tree(user_id)

        def find(nodes: list[LocationNodeResponse]) -> LocationNodeResponse | None:
            for node in nodes:
                if node.id == location_id:
                    return node
                found = find(node.children)
                if found:
                    return found
            return None

        found = find(response.locations)
        return LocationDetailResponse(**found.model_dump()) if found else None

    def _counts(self, user_id: int) -> dict[int, LocationCounts]:
        source_ids = select(InventorySource.id).where(
            InventorySource.user_id == user_id, InventorySource.is_authoritative.is_(True)
        )
        descendants = (
            select(Location.id.label("root_id"), Location.id.label("descendant_id"))
            .where(Location.user_id == user_id)
            .cte("location_descendants", recursive=True)
        )
        descendants = descendants.union_all(
            select(descendants.c.root_id, Location.id)
            .join(descendants, Location.parent_id == descendants.c.descendant_id)
            .where(Location.user_id == user_id)
        )
        rows = self.session.execute(
            select(
                descendants.c.root_id,
                func.count(InventoryItem.id),
                func.coalesce(func.sum(InventoryItem.quantity), 0),
            )
            .select_from(descendants)
            .outerjoin(
                InventoryItem,
                (InventoryItem.location_id == descendants.c.descendant_id)
                & (InventoryItem.user_id == user_id)
                & InventoryItem.inventory_source_id.in_(source_ids),
            )
            .group_by(descendants.c.root_id)
        ).all()
        return {row[0]: LocationCounts(int(row[1]), int(row[2] or 0)) for row in rows}

    def _unresolved_counts(self, user_id: int) -> tuple[int, int]:
        source_ids = select(InventorySource.id).where(
            InventorySource.user_id == user_id, InventorySource.is_authoritative.is_(True)
        )
        records, units = self.session.execute(
            select(
                func.count(InventoryItem.id), func.coalesce(func.sum(InventoryItem.quantity), 0)
            ).where(
                InventoryItem.user_id == user_id,
                InventoryItem.location_id.is_(None),
                InventoryItem.inventory_source_id.in_(source_ids),
            )
        ).one()
        return int(records), int(units or 0)

    def _descendant_ids(self, user_id: int, location_id: int) -> set[int]:
        tree = (
            select(Location.id.label("id"))
            .where(Location.user_id == user_id, Location.id == location_id)
            .cte("location_descendants", recursive=True)
        )
        tree = tree.union_all(
            select(Location.id)
            .join(tree, Location.parent_id == tree.c.id)
            .where(Location.user_id == user_id)
        )
        return set(self.session.scalars(select(tree.c.id)).all())

    @staticmethod
    def _paths(by_id: dict[int, Location]) -> dict[int, str]:
        paths: dict[int, str] = {}

        def build(location: Location, visiting: set[int] | None = None) -> str:
            if location.id in paths:
                return paths[location.id]
            visiting = visiting or set()
            if location.id in visiting:
                return location.name
            visiting.add(location.id)
            if location.parent_id is None or location.parent_id not in by_id:
                path = location.name
            else:
                path = f"{build(by_id[location.parent_id], visiting)} → {location.name}"
            paths[location.id] = path
            return path

        for location in by_id.values():
            build(location)
        return paths


def load_location_config(path: str | None) -> dict[str, Any] | None:
    if not path:
        return None
    config_path = Path(path)
    if not config_path.is_file():
        raise LocationConfigurationError(f"location configuration file not found: {path}")
    with config_path.open(encoding="utf-8") as config_file:
        data = json.load(config_file)
    if not isinstance(data, dict) or not isinstance(data.get("locations", []), list):
        raise LocationConfigurationError("location configuration must contain a locations list")
    return data


def seed_location_config(session: Session, user_id: int, config: dict[str, Any] | None) -> int:
    if not config:
        return 0
    service = LocationService(session)
    seeded = 0

    def visit(entry: dict[str, Any], parent_id: int | None) -> None:
        nonlocal seeded
        if not isinstance(entry, dict) or not isinstance(entry.get("name"), str):
            raise LocationConfigurationError("each configured location needs a name")
        siblings = session.scalars(
            select(Location).where(Location.user_id == user_id, Location.parent_id == parent_id)
        ).all()
        location = next(
            (
                item
                for item in siblings
                if normalize_location(item.name) == normalize_location(entry["name"])
            ),
            None,
        )
        if location is None:
            location = service.create_location(
                user_id, entry["name"], parent_id, entry.get("description")
            )
            seeded += 1
        elif entry.get("description") is not None:
            location.description = entry["description"]
        for alias in entry.get("aliases", []):
            service.create_alias(user_id, location.id, alias)
        for rule in entry.get("rules", []):
            if not isinstance(rule, dict):
                raise LocationConfigurationError("configured rules must be objects")
            service.create_rule(
                user_id,
                location.id,
                rule.get("pattern", ""),
                rule.get("match_kind", "line"),
                int(rule.get("priority", 0)),
            )
        for child in entry.get("children", []):
            visit(child, location.id)

    for entry in config["locations"]:
        visit(entry, None)
    return seeded
