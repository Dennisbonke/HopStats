import json
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import (
    InventoryItem,
    InventorySource,
    Location,
    LocationAlias,
    LocationResolutionRule,
)
from ..schemas.locations import (
    LocationDetailResponse,
    LocationListResponse,
    LocationNodeResponse,
    UnresolvedLocationResponse,
)
from .location_resolution import (
    LocationResolution,
    LocationResolver,
    display_location,
    normalize_location,
)


class LocationConfigurationError(ValueError):
    pass


class LocationConflictError(LocationConfigurationError):
    pass


class LocationValidationError(LocationConfigurationError):
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
        name = display_location(name)
        if not name:
            raise LocationValidationError("location name cannot be empty")
        if (
            parent_id is not None
            and self.session.scalar(
                select(Location.id).where(Location.id == parent_id, Location.user_id == user_id)
            )
            is None
        ):
            raise LocationValidationError("parent location not found for this user")
        sibling = self.session.scalars(
            select(Location).where(Location.user_id == user_id, Location.parent_id == parent_id)
        ).all()
        if any(normalize_location(item.name) == normalize_location(name) for item in sibling):
            raise LocationConflictError("location name must be unique among siblings")
        if (
            self.session.scalar(
                select(LocationAlias.id).where(
                    LocationAlias.user_id == user_id,
                    LocationAlias.normalized_alias == normalize_location(name),
                )
            )
            is not None
        ):
            raise LocationConflictError("location name conflicts with an existing alias")
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
        if location.managed_by_config is not False:
            raise LocationConflictError(
                "location ownership is not database-managed; classify it before moving or renaming"
            )
        if parent_id == location_id:
            raise LocationConflictError("location cannot be its own parent")
        if parent_id is not None:
            if (
                self.session.scalar(
                    select(Location.id).where(Location.id == parent_id, Location.user_id == user_id)
                )
                is None
            ):
                raise LocationValidationError("parent location not found for this user")
            if parent_id in self._descendant_ids(user_id, location_id):
                raise LocationConflictError("location parent change would create a cycle")
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
            raise LocationConflictError("location name must be unique among siblings")
        location.parent_id = parent_id
        self.session.flush()
        return location

    def update_location(
        self,
        user_id: int,
        location_id: int,
        *,
        name: str | None = None,
        parent_id: int | None = None,
        description: str | None = None,
        update_parent: bool = False,
        update_description: bool = False,
    ) -> Location:
        location = self._get_location(user_id, location_id)
        if location.managed_by_config is not False:
            raise LocationConflictError(
                "location ownership is not database-managed; classify it before editing"
            )
        if name is not None:
            normalized_name = display_location(name)
            if not normalized_name:
                raise LocationValidationError("location name cannot be empty")
            location.name = normalized_name
        if update_parent:
            self._validate_parent_change(user_id, location, parent_id)
            location.parent_id = parent_id
        if update_description:
            location.description = description.strip() if description else None
        self._validate_sibling_name(user_id, location)
        if (
            self.session.scalar(
                select(LocationAlias.id).where(
                    LocationAlias.user_id == user_id,
                    LocationAlias.normalized_alias == normalize_location(location.name),
                    LocationAlias.location_id != location.id,
                )
            )
            is not None
        ):
            raise LocationConflictError("location name conflicts with an existing alias")
        self.session.flush()
        return location

    def transfer_to_database(self, user_id: int, location_id: int) -> Location:
        """Explicitly transfer a legacy/configured subtree to UI ownership."""
        location = self._get_location(user_id, location_id)
        location_ids = self._descendant_ids(user_id, location_id)
        for item in self.session.scalars(
            select(Location).where(Location.user_id == user_id, Location.id.in_(location_ids))
        ):
            item.managed_by_config = False
        for alias in self.session.scalars(
            select(LocationAlias).where(
                LocationAlias.user_id == user_id,
                LocationAlias.location_id.in_(location_ids),
                LocationAlias.managed_by_config.is_(True),
            )
        ):
            alias.managed_by_config = False
        for rule in self.session.scalars(
            select(LocationResolutionRule).where(
                LocationResolutionRule.user_id == user_id,
                LocationResolutionRule.location_id.in_(location_ids),
                LocationResolutionRule.managed_by_config.is_(True),
            )
        ):
            rule.managed_by_config = False
        self.session.flush()
        return location

    def delete_location(self, user_id: int, location_id: int) -> None:
        location = self._get_location(user_id, location_id)
        if location.managed_by_config is not False:
            raise LocationConflictError("location ownership is not database-managed")
        if (
            self.session.scalar(
                select(Location.id).where(
                    Location.user_id == user_id, Location.parent_id == location_id
                )
            )
            is not None
        ):
            raise LocationConflictError("location has child locations")
        if (
            self.session.scalar(
                select(InventoryItem.id).where(
                    InventoryItem.user_id == user_id, InventoryItem.location_id == location_id
                )
            )
            is not None
        ):
            raise LocationConflictError("location is referenced by inventory records")
        if (
            self.session.scalar(
                select(LocationAlias.id).where(
                    LocationAlias.user_id == user_id, LocationAlias.location_id == location_id
                )
            )
            is not None
        ):
            raise LocationConflictError("location still has aliases; remove them first")
        if (
            self.session.scalar(
                select(LocationResolutionRule.id).where(
                    LocationResolutionRule.user_id == user_id,
                    LocationResolutionRule.location_id == location_id,
                )
            )
            is not None
        ):
            raise LocationConflictError("location still has resolution rules")
        self.session.delete(location)
        self.session.flush()

    def create_alias(
        self,
        user_id: int,
        location_id: int,
        alias: str,
        *,
        managed_by_config: bool = False,
        allow_existing: bool = False,
    ) -> LocationAlias:
        if (
            self.session.scalar(
                select(Location.id).where(Location.id == location_id, Location.user_id == user_id)
            )
            is None
        ):
            raise LocationNotFound("location not found")
        alias = display_location(alias)
        normalized = normalize_location(alias)
        if not normalized:
            raise LocationValidationError("alias cannot be empty")
        canonical_conflict = any(
            normalize_location(location.name) == normalized
            for location in self.session.scalars(
                select(Location).where(Location.user_id == user_id)
            )
        )
        if canonical_conflict:
            raise LocationConflictError("alias conflicts with another location name")
        existing = self.session.scalar(
            select(LocationAlias).where(
                LocationAlias.user_id == user_id, LocationAlias.normalized_alias == normalized
            )
        )
        if existing is not None:
            if existing.location_id != location_id:
                raise LocationConflictError("alias conflicts with another location")
            if not allow_existing:
                raise LocationConflictError("alias already exists")
            existing.alias = alias
            if managed_by_config and existing.managed_by_config:
                existing.managed_by_config = True
            return existing
        result = LocationAlias(
            user_id=user_id,
            location_id=location_id,
            alias=alias.strip(),
            normalized_alias=normalized,
            managed_by_config=managed_by_config,
        )
        self.session.add(result)
        self.session.flush()
        return result

    def update_alias(
        self, user_id: int, location_id: int, alias_id: int, alias: str
    ) -> LocationAlias:
        self._get_location(user_id, location_id)
        existing = self.session.scalar(
            select(LocationAlias).where(
                LocationAlias.id == alias_id,
                LocationAlias.user_id == user_id,
                LocationAlias.location_id == location_id,
            )
        )
        if existing is None:
            raise LocationNotFound("alias not found")
        if existing.managed_by_config:
            raise LocationConflictError("configuration-managed aliases cannot be edited")
        display = display_location(alias)
        normalized = normalize_location(display)
        if not normalized:
            raise LocationValidationError("alias cannot be empty")
        if any(
            normalize_location(location.name) == normalized
            for location in self.session.scalars(
                select(Location).where(Location.user_id == user_id)
            )
        ):
            raise LocationConflictError("alias conflicts with another location name")
        duplicate = self.session.scalar(
            select(LocationAlias).where(
                LocationAlias.user_id == user_id,
                LocationAlias.normalized_alias == normalized,
                LocationAlias.id != alias_id,
            )
        )
        if duplicate is not None:
            raise LocationConflictError("alias already exists")
        existing.alias = display
        existing.normalized_alias = normalized
        self.session.flush()
        return existing

    def delete_alias(self, user_id: int, location_id: int, alias_id: int) -> None:
        self._get_location(user_id, location_id)
        alias = self.session.scalar(
            select(LocationAlias).where(
                LocationAlias.id == alias_id,
                LocationAlias.user_id == user_id,
                LocationAlias.location_id == location_id,
            )
        )
        if alias is None:
            raise LocationNotFound("alias not found")
        if alias.managed_by_config:
            raise LocationConflictError("configuration-managed aliases cannot be deleted")
        self.session.delete(alias)
        self.session.flush()

    def create_rule(
        self,
        user_id: int,
        location_id: int,
        pattern: str,
        match_kind: str,
        priority: int = 0,
        *,
        managed_by_config: bool = False,
    ) -> LocationResolutionRule:
        if match_kind not in {"exact", "line", "prefix"}:
            raise LocationValidationError("unsupported location rule kind")
        if not isinstance(pattern, str) or not normalize_location(pattern):
            raise LocationValidationError("location rule pattern cannot be empty")
        if (
            self.session.scalar(
                select(Location.id).where(Location.id == location_id, Location.user_id == user_id)
            )
            is None
        ):
            raise LocationValidationError("location not found for this user")
        normalized = normalize_location(pattern)
        existing = next(
            (
                rule
                for rule in self.session.scalars(
                    select(LocationResolutionRule).where(
                        LocationResolutionRule.user_id == user_id,
                        LocationResolutionRule.match_kind == match_kind,
                    )
                )
                if normalize_location(rule.pattern) == normalized
            ),
            None,
        )
        if existing is not None:
            if existing.location_id != location_id:
                raise LocationConflictError("rule conflicts with another location")
            existing.priority = priority
            if managed_by_config and existing.managed_by_config:
                existing.managed_by_config = True
            return existing
        result = LocationResolutionRule(
            user_id=user_id,
            location_id=location_id,
            pattern=normalized,
            match_kind=match_kind,
            priority=priority,
            managed_by_config=managed_by_config,
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
        source_id = self._source_id(user_id)
        if source_id is None:
            return 0
        items = self.session.scalars(
            select(InventoryItem).where(
                InventoryItem.user_id == user_id, InventoryItem.inventory_source_id == source_id
            )
        ).all()
        changed = 0
        for item in items:
            result = self.resolve_item(user_id, item, resolver)
            changed += self._apply_resolution(item, result)
        return changed

    def reconciliation_summary(self, user_id: int, changed_records: int) -> dict[str, int]:
        source_id = self._source_id(user_id)
        unresolved = ambiguous = 0
        if source_id is not None:
            unresolved, ambiguous = self.session.execute(
                select(
                    func.count(InventoryItem.id).filter(
                        InventoryItem.location_resolution_status == "unresolved"
                    ),
                    func.count(InventoryItem.id).filter(
                        InventoryItem.location_resolution_status == "ambiguous"
                    ),
                ).where(
                    InventoryItem.user_id == user_id,
                    InventoryItem.inventory_source_id == source_id,
                )
            ).one()
        return {
            "changed_records": changed_records,
            "unresolved_records": int(unresolved or 0),
            "ambiguous_records": int(ambiguous or 0),
        }

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
        alias_details: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for alias in self.session.scalars(
            select(LocationAlias)
            .where(LocationAlias.user_id == user_id)
            .order_by(LocationAlias.alias)
        ):
            aliases[alias.location_id].append(alias.alias)
            alias_details[alias.location_id].append(
                {
                    "id": alias.id,
                    "alias": alias.alias,
                    "managed_by_config": alias.managed_by_config,
                }
            )
        rules: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for rule in self.session.scalars(
            select(LocationResolutionRule)
            .where(LocationResolutionRule.user_id == user_id)
            .order_by(LocationResolutionRule.priority.desc(), LocationResolutionRule.id)
        ):
            rules[rule.location_id].append(
                {
                    "id": rule.id,
                    "pattern": rule.pattern,
                    "match_kind": rule.match_kind,
                    "priority": rule.priority,
                    "managed_by_config": rule.managed_by_config,
                }
            )
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
                alias_details=alias_details[location.id],
                rules=rules[location.id],
                managed_by_config=location.managed_by_config,
                ownership=(
                    "configuration"
                    if location.managed_by_config is True
                    else "database"
                    if location.managed_by_config is False
                    else "unknown"
                ),
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
        source_id = self._source_id(user_id)
        if source_id is None:
            return {}
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
                & (InventoryItem.inventory_source_id == source_id),
            )
            .group_by(descendants.c.root_id)
        ).all()
        return {row[0]: LocationCounts(int(row[1]), int(row[2] or 0)) for row in rows}

    def _unresolved_counts(self, user_id: int) -> tuple[int, int]:
        source_id = self._source_id(user_id)
        if source_id is None:
            return 0, 0
        records, units = self.session.execute(
            select(
                func.count(InventoryItem.id), func.coalesce(func.sum(InventoryItem.quantity), 0)
            ).where(
                InventoryItem.user_id == user_id,
                InventoryItem.location_id.is_(None),
                InventoryItem.inventory_source_id == source_id,
            )
        ).one()
        return int(records), int(units or 0)

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

    def _get_location(self, user_id: int, location_id: int) -> Location:
        location = self.session.scalar(
            select(Location).where(Location.id == location_id, Location.user_id == user_id)
        )
        if location is None:
            raise LocationNotFound("location not found")
        return location

    def _validate_parent_change(
        self, user_id: int, location: Location, parent_id: int | None
    ) -> None:
        if parent_id == location.id:
            raise LocationConflictError("location cannot be its own parent")
        if parent_id is not None:
            if (
                self.session.scalar(
                    select(Location.id).where(Location.id == parent_id, Location.user_id == user_id)
                )
                is None
            ):
                raise LocationValidationError("parent location not found for this user")
            if parent_id in self._descendant_ids(user_id, location.id):
                raise LocationConflictError("location parent change would create a cycle")

    def _validate_sibling_name(self, user_id: int, location: Location) -> None:
        siblings = self.session.scalars(
            select(Location).where(
                Location.user_id == user_id,
                Location.parent_id == location.parent_id,
                Location.id != location.id,
            )
        ).all()
        if any(
            normalize_location(item.name) == normalize_location(location.name) for item in siblings
        ):
            raise LocationConflictError("location name must be unique among siblings")

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
    _validate_location_config(config)
    service = LocationService(session)
    seeded = 0
    desired_aliases: set[str] = set()
    desired_rules: set[tuple[int, str, str]] = set()

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
            location.managed_by_config = True
            seeded += 1
        elif location.managed_by_config and entry.get("description") is not None:
            location.description = entry["description"]
        for alias in entry.get("aliases", []):
            desired_aliases.add(normalize_location(alias))
            service.create_alias(
                user_id, location.id, alias, managed_by_config=True, allow_existing=True
            )
        for rule in entry.get("rules", []):
            match_kind = rule.get("match_kind", "line")
            desired_rules.add((location.id, match_kind, normalize_location(rule["pattern"])))
            service.create_rule(
                user_id,
                location.id,
                rule["pattern"],
                match_kind,
                int(rule.get("priority", 0)),
                managed_by_config=True,
            )
        for child in entry.get("children", []):
            visit(child, location.id)

    for entry in config["locations"]:
        visit(entry, None)
    for alias in session.scalars(
        select(LocationAlias).where(
            LocationAlias.user_id == user_id,
            LocationAlias.managed_by_config.is_(True),
        )
    ).all():
        if alias.normalized_alias not in desired_aliases:
            session.delete(alias)
    for rule in session.scalars(
        select(LocationResolutionRule).where(
            LocationResolutionRule.user_id == user_id,
            LocationResolutionRule.managed_by_config.is_(True),
        )
    ).all():
        key = (rule.location_id, rule.match_kind, normalize_location(rule.pattern))
        if key not in desired_rules:
            session.delete(rule)
    session.flush()
    return seeded


def _validate_location_config(config: dict[str, Any]) -> None:
    if not isinstance(config.get("locations"), list):
        raise LocationConfigurationError("location configuration must contain a locations list")

    def visit(entry: Any) -> None:
        if not isinstance(entry, dict) or not isinstance(entry.get("name"), str):
            raise LocationConfigurationError("each configured location needs a name")
        if not normalize_location(entry["name"]):
            raise LocationConfigurationError("configured location name cannot be empty")
        if not isinstance(entry.get("aliases", []), list) or not all(
            isinstance(alias, str) and normalize_location(alias)
            for alias in entry.get("aliases", [])
        ):
            raise LocationConfigurationError("configured aliases cannot be empty")
        rules = entry.get("rules", [])
        if not isinstance(rules, list):
            raise LocationConfigurationError("configured rules must be a list")
        for rule in rules:
            if not isinstance(rule, dict):
                raise LocationConfigurationError("configured rules must be objects")
            if not isinstance(rule.get("pattern"), str) or not normalize_location(rule["pattern"]):
                raise LocationConfigurationError("location rule pattern cannot be empty")
            if rule.get("match_kind", "line") not in {"exact", "line", "prefix"}:
                raise LocationConfigurationError("unsupported location rule kind")
        children = entry.get("children", [])
        if not isinstance(children, list):
            raise LocationConfigurationError("configured children must be a list")
        for child in children:
            visit(child)

    for entry in config["locations"]:
        visit(entry)
