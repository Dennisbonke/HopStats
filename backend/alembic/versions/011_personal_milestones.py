"""add configurable personal milestones"""

import sqlalchemy as sa
from alembic import op

revision = "011_personal_milestones"
down_revision = "010_checkin_analytics_indexes"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "milestones",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("metric", sa.String(30), nullable=False),
        sa.Column("goal_type", sa.String(20), nullable=False),
        sa.Column("target", sa.Integer(), nullable=False),
        sa.Column("calendar_year", sa.Integer()),
        sa.Column("start_date", sa.Date()),
        sa.Column("deadline_date", sa.Date()),
        sa.Column("timezone", sa.String(100), nullable=False, server_default="Europe/Amsterdam"),
        sa.Column("archived_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("target > 0", name="ck_milestones_target_positive"),
        sa.CheckConstraint(
            "goal_type IN ('absolute', 'calendar_year', 'incremental')",
            name="ck_milestones_goal_type",
        ),
        sa.CheckConstraint(
            "metric IN ('unique_beers', 'checkins', 'discoveries')", name="ck_milestones_metric"
        ),
        sa.CheckConstraint(
            "(goal_type = 'calendar_year' AND calendar_year IS NOT NULL AND start_date IS NULL) "
            "OR (goal_type = 'incremental' AND start_date IS NOT NULL AND calendar_year IS NULL) "
            "OR (goal_type = 'absolute' AND calendar_year IS NULL AND start_date IS NULL)",
            name="ck_milestones_period",
        ),
    )
    op.create_index(
        "ix_milestones_user_archived_created",
        "milestones",
        ["user_id", "archived_at", "created_at", "id"],
    )


def downgrade():
    op.drop_index("ix_milestones_user_archived_created", table_name="milestones")
    op.drop_table("milestones")
