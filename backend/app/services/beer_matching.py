import unicodedata

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Beer, Brewery, Checkin


def normalize_name(value: str | None) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKC", value)
    return " ".join(normalized.split()).casefold()


def matching_beers(session: Session, beer: Beer, user_id: int | None = None) -> list[Beer]:
    """Find exact check-in catalog candidates without fuzzy transformations."""
    brewery_name = ""
    if beer.brewery_id is not None:
        brewery_name = (
            session.scalar(select(Brewery.name).where(Brewery.id == beer.brewery_id)) or ""
        )
    query = select(Beer).where(Beer.source_system == "untappd")
    if user_id is not None:
        query = query.join(Checkin, Checkin.beer_id == Beer.id).where(Checkin.user_id == user_id)
    candidates = session.scalars(query.distinct()).all()
    return [
        candidate
        for candidate in candidates
        if normalize_name(candidate.name) == normalize_name(beer.name)
        and normalize_name(_brewery_name(session, candidate)) == normalize_name(brewery_name)
    ]


def _brewery_name(session: Session, beer: Beer) -> str:
    if beer.brewery_id is None:
        return ""
    return session.scalar(select(Brewery.name).where(Brewery.id == beer.brewery_id)) or ""


def match_inventory_beer(
    session: Session, beer: Beer, user_id: int | None = None
) -> tuple[str, Beer | None]:
    """Return the persisted match status and never replace the inventory beer."""
    if beer.source_system == "untappd" and beer.external_id:
        return "external_id", beer
    candidates = matching_beers(session, beer, user_id)
    if len(candidates) == 1:
        return "exact", candidates[0]
    if len(candidates) > 1:
        return "ambiguous", None
    return "unmatched", None
