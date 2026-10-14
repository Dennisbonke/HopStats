"""track safe inventory location resolution provenance"""

from alembic import op
import sqlalchemy as sa

revision = "006_location_resolution_provenance"
down_revision = "005_provisional_beer_identity"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "inventory_items",
        sa.Column("location_resolution_status", sa.String(20), nullable=False, server_default="unresolved"),
    )
    op.add_column("inventory_items", sa.Column("location_resolution_source", sa.String(30)))
    op.add_column("inventory_items", sa.Column("location_resolution_detail", sa.Text()))
    op.add_column(
        "inventory_items",
        sa.Column("location_assignment_kind", sa.String(20), nullable=False, server_default="automatic"),
    )
    op.execute(
        sa.text(
            "UPDATE inventory_items SET location_assignment_kind = 'explicit', "
            "location_resolution_status = 'resolved', "
            "location_resolution_source = 'manual' WHERE location_id IS NOT NULL"
        )
    )
    op.create_index("ix_inventory_items_user_source", "inventory_items", ["user_id", "inventory_source_id"])
    op.create_index(
        "ix_inventory_items_user_source_location",
        "inventory_items",
        ["user_id", "inventory_source_id", "location_id"],
    )
    op.create_index(
        "ix_inventory_items_user_source_match",
        "inventory_items",
        ["user_id", "inventory_source_id", "match_status"],
    )


def downgrade():
    op.drop_index("ix_inventory_items_user_source_match", table_name="inventory_items")
    op.drop_index("ix_inventory_items_user_source_location", table_name="inventory_items")
    op.drop_index("ix_inventory_items_user_source", table_name="inventory_items")
    op.drop_column("inventory_items", "location_assignment_kind")
    op.drop_column("inventory_items", "location_resolution_detail")
    op.drop_column("inventory_items", "location_resolution_source")
    op.drop_column("inventory_items", "location_resolution_status")
