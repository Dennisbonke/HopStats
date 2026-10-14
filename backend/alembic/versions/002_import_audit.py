"""add import audit snapshot counts"""

from alembic import op
import sqlalchemy as sa

revision = "002_import_audit"
down_revision = "001_foundation"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("import_runs", sa.Column("removed_count", sa.Integer(), nullable=False, server_default="0"))


def downgrade():
    op.drop_column("import_runs", "removed_count")
