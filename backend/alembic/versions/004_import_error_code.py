"""add machine-readable import failure classification"""

from alembic import op
import sqlalchemy as sa

revision = "004_import_error_code"
down_revision = "003_inventory_metadata"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("import_runs", sa.Column("error_code", sa.String(40)))


def downgrade():
    op.drop_column("import_runs", "error_code")
