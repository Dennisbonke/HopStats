"""foundation schema"""
from alembic import op
import sqlalchemy as sa

revision = "001_foundation"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    statements = [
        "CREATE TABLE users (id INTEGER PRIMARY KEY, username VARCHAR(100) NOT NULL UNIQUE, created_at DATETIME NOT NULL)",
        "CREATE TABLE breweries (id INTEGER PRIMARY KEY, source_system VARCHAR(50) NOT NULL, external_id VARCHAR(100), name VARCHAR(255) NOT NULL, country VARCHAR(100), city VARCHAR(100), state VARCHAR(100), UNIQUE(source_system, external_id))",
        "CREATE TABLE beer_styles (id INTEGER PRIMARY KEY, name VARCHAR(150) NOT NULL UNIQUE, parent_id INTEGER REFERENCES beer_styles(id))",
        "CREATE TABLE beers (id INTEGER PRIMARY KEY, source_system VARCHAR(50), external_id VARCHAR(100), brewery_id INTEGER REFERENCES breweries(id), style_id INTEGER REFERENCES beer_styles(id), name VARCHAR(255) NOT NULL, abv NUMERIC(5,2), ibu NUMERIC(6,2), photo_url TEXT, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, UNIQUE(source_system, external_id))",
        "CREATE TABLE venues (id INTEGER PRIMARY KEY, source_system VARCHAR(50) NOT NULL, external_id VARCHAR(100), name VARCHAR(255) NOT NULL, city VARCHAR(100), state VARCHAR(100), country VARCHAR(100), latitude NUMERIC(9,6), longitude NUMERIC(9,6), UNIQUE(source_system, external_id))",
        "CREATE TABLE checkins (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), source_system VARCHAR(50) NOT NULL, external_id VARCHAR(100) NOT NULL, beer_id INTEGER NOT NULL REFERENCES beers(id), venue_id INTEGER REFERENCES venues(id), occurred_at_utc DATETIME NOT NULL, original_offset_minutes INTEGER, rating NUMERIC(3,2), comment TEXT, serving_type VARCHAR(100), purchase_venue VARCHAR(255), photo_url TEXT, source_payload_json TEXT, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, UNIQUE(user_id, source_system, external_id))",
        "CREATE TABLE locations (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), parent_id INTEGER REFERENCES locations(id), name VARCHAR(255) NOT NULL, description TEXT, UNIQUE(user_id, parent_id, name))",
        "CREATE TABLE location_aliases (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), location_id INTEGER NOT NULL REFERENCES locations(id), alias VARCHAR(255) NOT NULL, normalized_alias VARCHAR(255) NOT NULL, UNIQUE(user_id, normalized_alias))",
        "CREATE TABLE location_resolution_rules (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), pattern VARCHAR(255) NOT NULL, match_kind VARCHAR(20) NOT NULL, location_id INTEGER NOT NULL REFERENCES locations(id), priority INTEGER NOT NULL)",
        "CREATE TABLE inventory_sources (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), source_system VARCHAR(50) NOT NULL, name VARCHAR(100) NOT NULL, is_authoritative BOOLEAN NOT NULL, created_at DATETIME NOT NULL, UNIQUE(user_id, source_system, name))",
        "CREATE TABLE inventory_items (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), inventory_source_id INTEGER NOT NULL REFERENCES inventory_sources(id), source_item_id VARCHAR(100) NOT NULL, beer_id INTEGER NOT NULL REFERENCES beers(id), location_id INTEGER REFERENCES locations(id), quantity INTEGER NOT NULL CHECK(quantity >= 0), container VARCHAR(100), notes TEXT, purchase_date DATE, bottled_date DATE, best_before DATE, raw_best_before VARCHAR(50), purchase_location VARCHAR(255), purchase_price NUMERIC(10,2), created_at_source DATETIME, source_payload_json TEXT, imported_at DATETIME NOT NULL, match_status VARCHAR(20) NOT NULL, matched_checkin_beer_id INTEGER REFERENCES beers(id), UNIQUE(inventory_source_id, source_item_id))",
        "CREATE TABLE import_runs (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), source_type VARCHAR(50) NOT NULL, filename VARCHAR(255) NOT NULL, sha256 VARCHAR(64) NOT NULL, source_exported_at DATETIME, started_at DATETIME NOT NULL, completed_at DATETIME, status VARCHAR(20) NOT NULL, inserted_count INTEGER NOT NULL, updated_count INTEGER NOT NULL, unchanged_count INTEGER NOT NULL, rejected_count INTEGER NOT NULL, error_summary TEXT)",
        "CREATE TABLE import_errors (id INTEGER PRIMARY KEY, import_run_id INTEGER NOT NULL REFERENCES import_runs(id), row_number INTEGER NOT NULL, field VARCHAR(100), reason TEXT NOT NULL)",
    ]
    for statement in statements:
        op.execute(statement)

def downgrade():
    for table in ("import_errors", "import_runs", "inventory_items", "inventory_sources", "location_resolution_rules", "location_aliases", "locations", "checkins", "venues", "beers", "beer_styles", "breweries", "users"):
        op.drop_table(table)
