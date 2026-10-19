from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def _utc_now() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)
    password_hash: Mapped[str | None] = mapped_column(String(500))
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuthLoginAttempt(Base):
    __tablename__ = "auth_login_attempts"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(100), index=True)
    client_ip: Mapped[str] = mapped_column(String(100), index=True)
    failed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, index=True
    )


class AuthAuditEvent(Base):
    __tablename__ = "auth_audit_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    event: Mapped[str] = mapped_column(String(50), index=True)
    username: Mapped[str | None] = mapped_column(String(100))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    client_ip: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, index=True
    )


class Brewery(Base):
    __tablename__ = "breweries"
    __table_args__ = (UniqueConstraint("source_system", "external_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    source_system: Mapped[str] = mapped_column(String(50))
    external_id: Mapped[str | None] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(255))
    country: Mapped[str | None] = mapped_column(String(100))
    city: Mapped[str | None] = mapped_column(String(100))
    state: Mapped[str | None] = mapped_column(String(100))


class BeerStyle(Base):
    __tablename__ = "beer_styles"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150), unique=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("beer_styles.id"))


class Beer(Base):
    __tablename__ = "beers"
    __table_args__ = (
        UniqueConstraint("source_system", "external_id"),
        Index(
            "uq_beers_source_provisional",
            "source_system",
            "provisional_key",
            unique=True,
            sqlite_where=text("provisional_key IS NOT NULL"),
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    source_system: Mapped[str | None] = mapped_column(String(50))
    external_id: Mapped[str | None] = mapped_column(String(100))
    provisional_key: Mapped[str | None] = mapped_column(String(500))
    brewery_id: Mapped[int | None] = mapped_column(ForeignKey("breweries.id"))
    style_id: Mapped[int | None] = mapped_column(ForeignKey("beer_styles.id"))
    name: Mapped[str] = mapped_column(String(255))
    abv: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    ibu: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    photo_url: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)


class Venue(Base):
    __tablename__ = "venues"
    __table_args__ = (UniqueConstraint("source_system", "external_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    source_system: Mapped[str] = mapped_column(String(50))
    external_id: Mapped[str | None] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(100))
    state: Mapped[str | None] = mapped_column(String(100))
    country: Mapped[str | None] = mapped_column(String(100))
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))


class Checkin(Base):
    __tablename__ = "checkins"
    __table_args__ = (UniqueConstraint("user_id", "source_system", "external_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    source_system: Mapped[str] = mapped_column(String(50))
    external_id: Mapped[str] = mapped_column(String(100))
    beer_id: Mapped[int] = mapped_column(ForeignKey("beers.id"))
    venue_id: Mapped[int | None] = mapped_column(ForeignKey("venues.id"))
    occurred_at_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    original_offset_minutes: Mapped[int | None] = mapped_column(Integer)
    rating: Mapped[Decimal | None] = mapped_column(Numeric(3, 2))
    comment: Mapped[str | None] = mapped_column(Text)
    serving_type: Mapped[str | None] = mapped_column(String(100))
    purchase_venue: Mapped[str | None] = mapped_column(String(255))
    photo_url: Mapped[str | None] = mapped_column(Text)
    source_payload_json: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)


class Milestone(Base):
    __tablename__ = "milestones"
    __table_args__ = (
        CheckConstraint("target > 0", name="ck_milestones_target_positive"),
        CheckConstraint(
            "goal_type IN ('absolute', 'calendar_year', 'incremental')",
            name="ck_milestones_goal_type",
        ),
        CheckConstraint(
            "metric IN ('unique_beers', 'checkins', 'discoveries')", name="ck_milestones_metric"
        ),
        CheckConstraint(
            "(goal_type = 'calendar_year' AND calendar_year IS NOT NULL AND start_date IS NULL) "
            "OR (goal_type = 'incremental' AND start_date IS NOT NULL AND calendar_year IS NULL) "
            "OR (goal_type = 'absolute' AND calendar_year IS NULL AND start_date IS NULL)",
            name="ck_milestones_period",
        ),
        Index("ix_milestones_user_archived_created", "user_id", "archived_at", "created_at", "id"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(150))
    metric: Mapped[str] = mapped_column(String(30))
    goal_type: Mapped[str] = mapped_column(String(20))
    target: Mapped[int] = mapped_column(Integer)
    calendar_year: Mapped[int | None] = mapped_column(Integer)
    start_date: Mapped[date | None] = mapped_column(Date)
    deadline_date: Mapped[date | None] = mapped_column(Date)
    timezone: Mapped[str] = mapped_column(String(100), default="Europe/Amsterdam")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, onupdate=_utc_now
    )


class Location(Base):
    __tablename__ = "locations"
    __table_args__ = (
        UniqueConstraint("user_id", "parent_id", "name"),
        UniqueConstraint("id", "user_id"),
        Index(
            "uq_locations_top_level",
            "user_id",
            "name",
            unique=True,
            sqlite_where=text("parent_id IS NULL"),
        ),
        ForeignKeyConstraint(["parent_id", "user_id"], ["locations.id", "locations.user_id"]),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    parent_id: Mapped[int | None] = mapped_column()
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    managed_by_config: Mapped[bool | None] = mapped_column(Boolean, default=False)


class LocationAlias(Base):
    __tablename__ = "location_aliases"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    location_id: Mapped[int] = mapped_column()
    alias: Mapped[str] = mapped_column(String(255))
    normalized_alias: Mapped[str] = mapped_column(String(255))
    managed_by_config: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    __table_args__ = (
        UniqueConstraint("user_id", "normalized_alias"),
        ForeignKeyConstraint(["location_id", "user_id"], ["locations.id", "locations.user_id"]),
    )


class LocationResolutionRule(Base):
    __tablename__ = "location_resolution_rules"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    pattern: Mapped[str] = mapped_column(String(255))
    match_kind: Mapped[str] = mapped_column(String(20))
    location_id: Mapped[int] = mapped_column()
    priority: Mapped[int] = mapped_column(Integer, default=0)
    managed_by_config: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    __table_args__ = (
        ForeignKeyConstraint(["location_id", "user_id"], ["locations.id", "locations.user_id"]),
    )


class InventorySource(Base):
    __tablename__ = "inventory_sources"
    __table_args__ = (
        UniqueConstraint("user_id", "source_system", "name"),
        UniqueConstraint("id", "user_id"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    source_system: Mapped[str] = mapped_column(String(50))
    name: Mapped[str] = mapped_column(String(100))
    is_authoritative: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)


class InventoryItem(Base):
    __tablename__ = "inventory_items"
    __table_args__ = (
        UniqueConstraint("inventory_source_id", "source_item_id"),
        CheckConstraint("quantity >= 0"),
        Index("ix_inventory_items_user_source", "user_id", "inventory_source_id"),
        Index(
            "ix_inventory_items_user_source_location",
            "user_id",
            "inventory_source_id",
            "location_id",
        ),
        Index(
            "ix_inventory_items_user_source_match",
            "user_id",
            "inventory_source_id",
            "match_status",
        ),
        ForeignKeyConstraint(
            ["inventory_source_id", "user_id"],
            ["inventory_sources.id", "inventory_sources.user_id"],
        ),
        ForeignKeyConstraint(
            ["location_id", "user_id"],
            ["locations.id", "locations.user_id"],
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    inventory_source_id: Mapped[int] = mapped_column(ForeignKey("inventory_sources.id"))
    source_item_id: Mapped[str] = mapped_column(String(100))
    beer_id: Mapped[int] = mapped_column(ForeignKey("beers.id"))
    location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"))
    location_resolution_status: Mapped[str] = mapped_column(
        String(20), default="unresolved", server_default="unresolved"
    )
    location_resolution_source: Mapped[str | None] = mapped_column(String(30))
    location_resolution_detail: Mapped[str | None] = mapped_column(Text)
    location_assignment_kind: Mapped[str] = mapped_column(
        String(20), default="automatic", server_default="automatic"
    )
    quantity: Mapped[int] = mapped_column(Integer)
    container: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    purchase_date: Mapped[date | None] = mapped_column(Date)
    bottled_date: Mapped[date | None] = mapped_column(Date)
    best_before: Mapped[date | None] = mapped_column(Date)
    raw_best_before: Mapped[str | None] = mapped_column(String(50))
    purchase_location: Mapped[str | None] = mapped_column(String(255))
    purchase_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    created_at_source: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source_payload_json: Mapped[str | None] = mapped_column(Text)
    photo_url: Mapped[str | None] = mapped_column(Text)
    best_before_suspicious: Mapped[bool] = mapped_column(Boolean, default=False)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)
    match_status: Mapped[str] = mapped_column(String(20), default="unmatched")
    matched_checkin_beer_id: Mapped[int | None] = mapped_column(ForeignKey("beers.id"))


class ImportRun(Base):
    __tablename__ = "import_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    source_type: Mapped[str] = mapped_column(String(50))
    filename: Mapped[str] = mapped_column(String(255))
    sha256: Mapped[str] = mapped_column(String(64))
    source_exported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20))
    inserted_count: Mapped[int] = mapped_column(Integer, default=0)
    updated_count: Mapped[int] = mapped_column(Integer, default=0)
    unchanged_count: Mapped[int] = mapped_column(Integer, default=0)
    removed_count: Mapped[int] = mapped_column(Integer, default=0)
    rejected_count: Mapped[int] = mapped_column(Integer, default=0)
    error_summary: Mapped[str | None] = mapped_column(Text)
    error_code: Mapped[str | None] = mapped_column(String(40))


class ImportError(Base):
    __tablename__ = "import_errors"
    id: Mapped[int] = mapped_column(primary_key=True)
    import_run_id: Mapped[int] = mapped_column(ForeignKey("import_runs.id"))
    row_number: Mapped[int] = mapped_column(Integer)
    field: Mapped[str | None] = mapped_column(String(100))
    reason: Mapped[str] = mapped_column(Text)
