"""add indexes for user-scoped check-in analytics"""

from alembic import op

revision = "010_checkin_analytics_indexes"
down_revision = "009_location_provenance"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index("ix_checkins_user_occurred", "checkins", ["user_id", "occurred_at_utc"])
    op.create_index(
        "ix_checkins_user_beer_occurred_id",
        "checkins",
        ["user_id", "beer_id", "occurred_at_utc", "id"],
    )


def downgrade():
    op.drop_index("ix_checkins_user_beer_occurred_id", table_name="checkins")
    op.drop_index("ix_checkins_user_occurred", table_name="checkins")
