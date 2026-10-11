"""foundation schema"""
from alembic import op
import sqlalchemy as sa

revision = "001_foundation"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("username"),
    )
    op.create_table(
        "breweries",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("source_system", sa.String(50), nullable=False),
        sa.Column("external_id", sa.String(100)), sa.Column("name", sa.String(255), nullable=False),
        sa.Column("country", sa.String(100)), sa.Column("city", sa.String(100)), sa.Column("state", sa.String(100)),
        sa.UniqueConstraint("source_system", "external_id"),
    )
    op.create_table(
        "beer_styles",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("name", sa.String(150), nullable=False),
        sa.Column("parent_id", sa.Integer(), sa.ForeignKey("beer_styles.id")), sa.UniqueConstraint("name"),
    )
    op.create_table(
        "beers",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("source_system", sa.String(50)),
        sa.Column("external_id", sa.String(100)), sa.Column("brewery_id", sa.Integer(), sa.ForeignKey("breweries.id")),
        sa.Column("style_id", sa.Integer(), sa.ForeignKey("beer_styles.id")), sa.Column("name", sa.String(255), nullable=False),
        sa.Column("abv", sa.Numeric(5, 2)), sa.Column("ibu", sa.Numeric(6, 2)), sa.Column("photo_url", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("source_system", "external_id"),
    )
    op.create_table(
        "venues",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("source_system", sa.String(50), nullable=False),
        sa.Column("external_id", sa.String(100)), sa.Column("name", sa.String(255), nullable=False),
        sa.Column("city", sa.String(100)), sa.Column("state", sa.String(100)), sa.Column("country", sa.String(100)),
        sa.Column("latitude", sa.Numeric(9, 6)), sa.Column("longitude", sa.Numeric(9, 6)),
        sa.UniqueConstraint("source_system", "external_id"),
    )
    op.create_table(
        "checkins",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("source_system", sa.String(50), nullable=False), sa.Column("external_id", sa.String(100), nullable=False),
        sa.Column("beer_id", sa.Integer(), sa.ForeignKey("beers.id"), nullable=False), sa.Column("venue_id", sa.Integer(), sa.ForeignKey("venues.id")),
        sa.Column("occurred_at_utc", sa.DateTime(timezone=True), nullable=False), sa.Column("original_offset_minutes", sa.Integer()),
        sa.Column("rating", sa.Numeric(3, 2)), sa.Column("comment", sa.Text()), sa.Column("serving_type", sa.String(100)),
        sa.Column("purchase_venue", sa.String(255)), sa.Column("photo_url", sa.Text()), sa.Column("source_payload_json", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "source_system", "external_id"),
    )
    op.create_table(
        "locations",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("parent_id", sa.Integer()), sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text()), sa.UniqueConstraint("user_id", "parent_id", "name"), sa.UniqueConstraint("id", "user_id"),
        sa.ForeignKeyConstraint(["parent_id", "user_id"], ["locations.id", "locations.user_id"]),
    )
    op.create_index("uq_locations_top_level", "locations", ["user_id", "name"], unique=True, sqlite_where=sa.text("parent_id IS NULL"))
    op.create_table(
        "location_aliases",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("location_id", sa.Integer(), nullable=False), sa.Column("alias", sa.String(255), nullable=False),
        sa.Column("normalized_alias", sa.String(255), nullable=False), sa.UniqueConstraint("user_id", "normalized_alias"),
        sa.ForeignKeyConstraint(["location_id", "user_id"], ["locations.id", "locations.user_id"]),
    )
    op.create_table(
        "location_resolution_rules",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("pattern", sa.String(255), nullable=False), sa.Column("match_kind", sa.String(20), nullable=False),
        sa.Column("location_id", sa.Integer(), nullable=False), sa.Column("priority", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["location_id", "user_id"], ["locations.id", "locations.user_id"]),
    )
    op.create_table(
        "inventory_sources",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("source_system", sa.String(50), nullable=False), sa.Column("name", sa.String(100), nullable=False),
        sa.Column("is_authoritative", sa.Boolean(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "source_system", "name"), sa.UniqueConstraint("id", "user_id"),
    )
    op.create_table(
        "inventory_items",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("inventory_source_id", sa.Integer(), nullable=False), sa.Column("source_item_id", sa.String(100), nullable=False),
        sa.Column("beer_id", sa.Integer(), sa.ForeignKey("beers.id"), nullable=False), sa.Column("location_id", sa.Integer()),
        sa.Column("quantity", sa.Integer(), nullable=False), sa.Column("container", sa.String(100)), sa.Column("notes", sa.Text()),
        sa.Column("purchase_date", sa.Date()), sa.Column("bottled_date", sa.Date()), sa.Column("best_before", sa.Date()),
        sa.Column("raw_best_before", sa.String(50)), sa.Column("purchase_location", sa.String(255)), sa.Column("purchase_price", sa.Numeric(10, 2)),
        sa.Column("created_at_source", sa.DateTime(timezone=True)), sa.Column("source_payload_json", sa.Text()),
        sa.Column("imported_at", sa.DateTime(timezone=True), nullable=False), sa.Column("match_status", sa.String(20), nullable=False),
        sa.Column("matched_checkin_beer_id", sa.Integer(), sa.ForeignKey("beers.id")), sa.CheckConstraint("quantity >= 0"),
        sa.UniqueConstraint("inventory_source_id", "source_item_id"),
        sa.ForeignKeyConstraint(["inventory_source_id", "user_id"], ["inventory_sources.id", "inventory_sources.user_id"]),
        sa.ForeignKeyConstraint(["location_id", "user_id"], ["locations.id", "locations.user_id"]),
    )
    op.create_table(
        "import_runs",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("source_type", sa.String(50), nullable=False), sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False), sa.Column("source_exported_at", sa.DateTime(timezone=True)),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False), sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(20), nullable=False), sa.Column("inserted_count", sa.Integer(), nullable=False),
        sa.Column("updated_count", sa.Integer(), nullable=False), sa.Column("unchanged_count", sa.Integer(), nullable=False),
        sa.Column("rejected_count", sa.Integer(), nullable=False), sa.Column("error_summary", sa.Text()),
    )
    op.create_table(
        "import_errors", sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("import_run_id", sa.Integer(), sa.ForeignKey("import_runs.id"), nullable=False),
        sa.Column("row_number", sa.Integer(), nullable=False), sa.Column("field", sa.String(100)), sa.Column("reason", sa.Text(), nullable=False),
    )

def downgrade():
    op.drop_index("uq_locations_top_level", table_name="locations")
    for table in ("import_errors", "import_runs", "inventory_items", "inventory_sources", "location_resolution_rules", "location_aliases", "locations", "checkins", "venues", "beers", "beer_styles", "breweries", "users"):
        op.drop_table(table)
