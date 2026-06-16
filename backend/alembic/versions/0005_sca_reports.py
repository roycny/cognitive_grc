"""sca_reports table

Revision ID: 0005_sca_reports
Revises: 0004_kris
Create Date: 2026-06-16

Creates the Software Composition Analysis (SCA) saved-report table used by the
AI Tools SCA Agent. Uses existence checks so the migration is idempotent — safe
to run even when Base.metadata.create_all() has already created the table at
application startup.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "0005_sca_reports"
down_revision: Union[str, None] = "0004_kris"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = inspect(bind).get_table_names()

    if "sca_reports" not in existing:
        op.create_table(
            "sca_reports",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("app_name", sa.String(), nullable=False),
            sa.Column("risk_level", sa.String(), nullable=False),
            sa.Column("summary", sa.Text(), nullable=True),
            sa.Column("scan_results", sa.JSON(), nullable=False),
            sa.Column("recommendations", sa.JSON(), nullable=False),
            sa.Column("findings", sa.JSON(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_sca_reports_id"), "sca_reports", ["id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    existing = inspect(bind).get_table_names()

    if "sca_reports" in existing:
        op.drop_index(op.f("ix_sca_reports_id"), table_name="sca_reports")
        op.drop_table("sca_reports")
