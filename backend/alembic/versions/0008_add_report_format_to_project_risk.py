"""add report_format to project_risk_assessments

Revision ID: 0008_project_risk_format
Revises: 0007_policy_gaps
Create Date: 2026-07-20

Adds the report_format column to project_risk_assessments if it does not exist.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "0008_project_risk_format"
down_revision: Union[str, None] = "0007_policy_gaps"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = [c["name"] for c in inspect(bind).get_columns("project_risk_assessments")]

    if "report_format" not in columns:
        op.add_column(
            "project_risk_assessments",
            sa.Column("report_format", sa.String(), nullable=True, server_default="Standard"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    columns = [c["name"] for c in inspect(bind).get_columns("project_risk_assessments")]

    if "report_format" in columns:
        op.drop_column("project_risk_assessments", "report_format")
