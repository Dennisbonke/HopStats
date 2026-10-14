import unicodedata
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Location, LocationAlias, LocationResolutionRule


def normalize_location(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(unicodedata.normalize("NFKC", value).split()).casefold()


@dataclass(frozen=True)
class LocationResolution:
    status: str
    location_id: int | None
    source: str | None
    detail: str


class LocationResolver:
    """Conservative, deterministic resolver with no unrestricted note matching."""

    def __init__(self, session: Session, user_id: int):
        self.locations = session.scalars(select(Location).where(Location.user_id == user_id)).all()
        self.aliases = session.scalars(
            select(LocationAlias).where(LocationAlias.user_id == user_id).order_by(LocationAlias.id)
        ).all()
        self.rules = session.scalars(
            select(LocationResolutionRule)
            .where(LocationResolutionRule.user_id == user_id)
            .order_by(LocationResolutionRule.priority.desc(), LocationResolutionRule.id)
        ).all()
        self.by_id = {location.id: location for location in self.locations}
        self.paths = self._paths()
        self.canonical = self._index_canonical_names()
        self.alias_index: dict[str, set[int]] = {}
        for alias in self.aliases:
            self.alias_index.setdefault(normalize_location(alias.alias), set()).add(
                alias.location_id
            )

    def resolve(self, notes: str | None) -> LocationResolution:
        if not notes or not notes.strip():
            return LocationResolution(
                "unresolved", None, None, "No storage location was present in notes."
            )
        whole = normalize_location(notes)
        exact = self._candidates(whole)
        if exact:
            return self._result(exact, "exact", "Exact normalized location name or alias.")

        lines = [
            normalize_location(line) for line in notes.splitlines() if normalize_location(line)
        ]
        line_candidates: set[int] = set()
        for line in lines:
            line_candidates.update(self._candidates(line))
        if line_candidates:
            return self._result(line_candidates, "line", "Exact normalized location line in notes.")

        for rule in self.rules:
            if not self._rule_matches(rule, whole, lines):
                continue
            same_priority = {
                other.location_id
                for other in self.rules
                if other.priority == rule.priority and self._rule_matches(other, whole, lines)
            }
            if len(same_priority) > 1:
                return LocationResolution(
                    "ambiguous",
                    None,
                    "rule",
                    f"Multiple configured location rules matched at priority {rule.priority}.",
                )
            return LocationResolution(
                "resolved",
                rule.location_id,
                f"rule_{rule.match_kind}",
                f"Configured {rule.match_kind} rule matched at priority {rule.priority}.",
            )
        return LocationResolution(
            "unresolved", None, None, "No exact location name, alias, or rule matched."
        )

    def _candidates(self, value: str) -> set[int]:
        if not value:
            return set()
        return self.canonical.get(value, set()) | self.alias_index.get(value, set())

    def _result(self, candidates: set[int], source: str, detail: str) -> LocationResolution:
        if len(candidates) != 1:
            return LocationResolution(
                "ambiguous",
                None,
                source,
                f"Several canonical locations or aliases matched ({len(candidates)}).",
            )
        return LocationResolution("resolved", next(iter(candidates)), source, detail)

    def _rule_matches(self, rule: LocationResolutionRule, whole: str, lines: list[str]) -> bool:
        pattern = normalize_location(rule.pattern)
        if not pattern:
            return False
        if rule.match_kind == "exact":
            return whole == pattern
        if rule.match_kind == "line":
            return pattern in lines
        if rule.match_kind == "prefix":
            return any(line.startswith(pattern) for line in lines or [whole])
        return False

    def _index_canonical_names(self) -> dict[str, set[int]]:
        index: dict[str, set[int]] = {}
        for location in self.locations:
            index.setdefault(normalize_location(location.name), set()).add(location.id)
            index.setdefault(normalize_location(self.paths[location.id]), set()).add(location.id)
            slash_path = self.paths[location.id].replace(" → ", " / ")
            index.setdefault(normalize_location(slash_path), set()).add(location.id)
        return index

    def _paths(self) -> dict[int, str]:
        paths: dict[int, str] = {}

        def build(location: Location, visiting: set[int] | None = None) -> str:
            if location.id in paths:
                return paths[location.id]
            visiting = visiting or set()
            if location.id in visiting:
                return location.name
            visiting.add(location.id)
            if location.parent_id is None or location.parent_id not in self.by_id:
                path = location.name
            else:
                path = f"{build(self.by_id[location.parent_id], visiting)} → {location.name}"
            paths[location.id] = path
            return path

        for location in self.locations:
            build(location)
        return paths
