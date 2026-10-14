"""track configuration-managed location definitions"""

from alembic import op
import sqlalchemy as sa

revision = "007_location_config_provenance"
down_revision = "006_location_resolution_provenance"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "location_aliases",
        sa.Column("managed_by_config", sa.Boolean(), nullable=False, server_default="0"),
    )
    op.add_column(
        "location_resolution_rules",
        sa.Column("managed_by_config", sa.Boolean(), nullable=False, server_default="0"),
    )


def downgrade():
    op.drop_column("location_resolution_rules", "managed_by_config")
    op.drop_column("location_aliases", "managed_by_config")
