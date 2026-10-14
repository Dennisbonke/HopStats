"""track configuration-managed canonical locations"""

from alembic import op
import sqlalchemy as sa


revision = "009_location_provenance"
down_revision = "008_authentication"
branch_labels = None
depends_on = None


def upgrade():
    # Existing rows remain intact. NULL means provenance is unknown and keeps
    # legacy configuration-backed locations locked until an operator explicitly
    # classifies them; guessing would allow a restart to recreate renamed rows.
    op.add_column(
        "locations",
        sa.Column("managed_by_config", sa.Boolean(), nullable=True),
    )


def downgrade():
    op.drop_column("locations", "managed_by_config")
