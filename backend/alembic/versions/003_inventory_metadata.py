"""retain inventory images and suspicious best-before markers"""

from alembic import op
import sqlalchemy as sa

revision = "003_inventory_metadata"
down_revision = "002_import_audit"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("inventory_items", sa.Column("photo_url", sa.Text()))
    op.add_column(
        "inventory_items",
        sa.Column("best_before_suspicious", sa.Boolean(), nullable=False, server_default="0"),
    )


def downgrade():
    op.drop_column("inventory_items", "best_before_suspicious")
    op.drop_column("inventory_items", "photo_url")
