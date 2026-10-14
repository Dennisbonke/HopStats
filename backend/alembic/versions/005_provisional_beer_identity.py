"""distinguish provisional release identities"""

from alembic import op
import sqlalchemy as sa

revision = "005_provisional_beer_identity"
down_revision = "004_import_error_code"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("beers", sa.Column("provisional_key", sa.String(500)))
    op.create_index(
        "uq_beers_source_provisional",
        "beers",
        ["source_system", "provisional_key"],
        unique=True,
        sqlite_where=sa.text("provisional_key IS NOT NULL"),
    )


def downgrade():
    op.drop_index("uq_beers_source_provisional", table_name="beers")
    op.drop_column("beers", "provisional_key")
