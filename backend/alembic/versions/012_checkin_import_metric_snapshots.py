"""store dashboard metric totals around successful check-in imports"""

import sqlalchemy as sa
from alembic import op

revision = "012_import_metric_snaps"
down_revision = "011_personal_milestones"
branch_labels = None
depends_on = None


def upgrade():
    for metric in ("total_checkins", "unique_beers", "unique_breweries", "unique_styles"):
        op.add_column("import_runs", sa.Column(f"{metric}_before", sa.Integer(), nullable=True))
        op.add_column("import_runs", sa.Column(f"{metric}_after", sa.Integer(), nullable=True))


def downgrade():
    for metric in ("unique_styles", "unique_breweries", "unique_beers", "total_checkins"):
        op.drop_column("import_runs", f"{metric}_after")
        op.drop_column("import_runs", f"{metric}_before")
