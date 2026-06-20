"""policy_assessment_gaps table

Revision ID: 0007_policy_gaps
Revises: 0006_project_risk
Create Date: 2026-06-21

Creates the saved-gap register for the AI Tools Policy Gap Analyst. Uses
existence checks so the migration is idempotent — safe to run even when
Base.metadata.create_all() has already created the table at application startup.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "0007_policy_gaps"
down_revision: Union[str, None] = "0006_project_risk"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = inspect(bind).get_table_names()

    if "policy_assessment_gaps" not in existing:
        op.create_table(
            "policy_assessment_gaps",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("policy_name", sa.String(), nullable=False),
            sa.Column("framework", sa.String(), nullable=False),
            sa.Column("requirement", sa.String(), nullable=False),
            sa.Column("gap_description", sa.Text(), nullable=False),
            sa.Column("recommendation", sa.Text(), nullable=False),
            sa.Column("severity", sa.String(), nullable=False, server_default="Medium"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column("created_by", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_policy_assessment_gaps_id"), "policy_assessment_gaps", ["id"], unique=False)
        op.create_index(
            op.f("ix_policy_assessment_gaps_policy_name"),
            "policy_assessment_gaps",
            ["policy_name"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    existing = inspect(bind).get_table_names()

    if "policy_assessment_gaps" in existing:
        op.drop_index(op.f("ix_policy_assessment_gaps_policy_name"), table_name="policy_assessment_gaps")
        op.drop_index(op.f("ix_policy_assessment_gaps_id"), table_name="policy_assessment_gaps")
        op.drop_table("policy_assessment_gaps")
