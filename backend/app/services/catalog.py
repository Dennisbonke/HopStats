import json
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Beer, BeerStyle, Brewery, Venue
from ..schemas.imports import BeerRecord, BreweryRecord, StyleRecord, VenueRecord
from .beer_matching import normalize_name


def _set_if_meaningful(entity, field: str, incoming):
    """Use the latest non-empty source value; never erase useful catalog data."""
    if incoming is None or incoming == "":
        return False
    if getattr(entity, field) == incoming:
        return False
    setattr(entity, field, incoming)
    return True


class CatalogService:
    """Upsert shared catalog records using source IDs as the strongest identity.

    Conflict policy: a non-empty value from a later import replaces a conflicting
    non-empty value, while empty source values never erase existing metadata.
    This keeps catalog corrections possible without allowing sparse exports to
    destroy previously known data.
    """

    def __init__(self, session: Session):
        self.session = session

    def brewery(self, record: BreweryRecord) -> Brewery:
        entity = None
        if record.external_id is not None:
            entity = self.session.scalar(
                select(Brewery).where(
                    Brewery.source_system == record.source_system,
                    Brewery.external_id == record.external_id,
                )
            )
        if entity is None and record.external_id is None:
            candidates = self.session.scalars(
                select(Brewery).where(
                    Brewery.source_system == record.source_system,
                    Brewery.external_id.is_(None),
                )
            ).all()
            entity = next(
                (
                    candidate
                    for candidate in candidates
                    if normalize_name(candidate.name) == normalize_name(record.name)
                ),
                None,
            )
        if entity is None:
            entity = Brewery(
                source_system=record.source_system,
                external_id=record.external_id,
                name=record.name,
            )
            self.session.add(entity)
            self.session.flush()
        for field in ("name", "country", "city", "state"):
            _set_if_meaningful(entity, field, getattr(record, field))
        return entity

    def style(self, record: StyleRecord | None) -> BeerStyle | None:
        if record is None:
            return None
        entity = self.session.scalar(select(BeerStyle).where(BeerStyle.name == record.name))
        if entity is None:
            entity = BeerStyle(name=record.name)
            self.session.add(entity)
            self.session.flush()
        return entity

    def beer(self, record: BeerRecord) -> Beer:
        entity = None
        if record.external_id is not None and record.source_system is not None:
            entity = self.session.scalar(
                select(Beer).where(
                    Beer.source_system == record.source_system,
                    Beer.external_id == record.external_id,
                )
            )
        brewery = self.brewery(record.brewery) if record.brewery is not None else None
        style = self.style(record.style)
        if entity is None and record.external_id is None and brewery is not None:
            provisional = self.session.scalars(
                select(Beer).where(
                    Beer.source_system == record.source_system,
                    Beer.brewery_id == brewery.id,
                    Beer.external_id.is_(None),
                )
            ).all()
            entity = next(
                (
                    candidate
                    for candidate in provisional
                    if normalize_name(candidate.name) == normalize_name(record.name)
                ),
                None,
            )
        if entity is None:
            entity = Beer(
                source_system=record.source_system,
                external_id=record.external_id,
                name=record.name,
                brewery_id=brewery.id if brewery else None,
                style_id=style.id if style else None,
                abv=record.abv,
                ibu=record.ibu,
                photo_url=record.photo_url,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
            self.session.add(entity)
            self.session.flush()
            return entity
        changed = False
        for field, incoming in (
            ("name", record.name),
            ("abv", record.abv),
            ("ibu", record.ibu),
            ("photo_url", record.photo_url),
        ):
            changed = _set_if_meaningful(entity, field, incoming) or changed
        if brewery is not None and entity.brewery_id != brewery.id:
            entity.brewery_id = brewery.id
            changed = True
        if style is not None and entity.style_id != style.id:
            entity.style_id = style.id
            changed = True
        if changed:
            entity.updated_at = datetime.now(UTC)
        return entity

    def venue(self, record: VenueRecord | None) -> Venue | None:
        if record is None:
            return None
        entity = None
        if record.external_id is not None:
            entity = self.session.scalar(
                select(Venue).where(
                    Venue.source_system == record.source_system,
                    Venue.external_id == record.external_id,
                )
            )
        if entity is None and record.external_id is None:
            entity = self.session.scalar(
                select(Venue).where(
                    Venue.source_system == record.source_system,
                    Venue.name == record.name,
                    Venue.city == record.city,
                    Venue.state == record.state,
                    Venue.country == record.country,
                )
            )
        if entity is None:
            entity = Venue(
                source_system=record.source_system,
                external_id=record.external_id,
                name=record.name,
            )
            self.session.add(entity)
            self.session.flush()
        for field in ("name", "city", "state", "country", "latitude", "longitude"):
            _set_if_meaningful(entity, field, getattr(record, field))
        return entity


def metadata_json(metadata: dict) -> str | None:
    return (
        json.dumps(metadata, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        if metadata
        else None
    )
