"""update craid categories in project_risks

Revision ID: 0009_update_craid_categories
Revises: 0008_project_risk_format
Create Date: 2026-07-20

Updates category column values from Constraint/Assumption/Dependency to Change/Action/Decision/Dependency.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0009_update_craid_categories"
down_revision: Union[str, None] = "0008_project_risk_format"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Update category values to match new CRAID definition
    op.execute(
        "UPDATE project_risks SET category = 'Change' WHERE category = 'Constraint';"
    )
    op.execute(
        "UPDATE project_risks SET category = 'Action' WHERE category = 'Assumption';"
    )
    op.execute(
        "UPDATE project_risks SET category = 'Decision/Dependency' WHERE category = 'Dependency';"
    )


def downgrade() -> None:
    # Revert category values to match old CRAID definition
    op.execute(
        "UPDATE project_risks SET category = 'Constraint' WHERE category = 'Change';"
    )
    op.execute(
        "UPDATE project_risks SET category = 'Assumption' WHERE category = 'Action';"
    )
    op.execute(
        "UPDATE project_risks SET category = 'Dependency' WHERE category = 'Decision/Dependency';"
    )
