"""glba assessments and control responses tables

Revision ID: 0003_glba_assessments
Revises: 0002_audits_issues
Create Date: 2026-06-06

Creates the GLBA assessment tables: one header row per assessment and one
editable response row per control (27 controls).
Uses existence checks so the migration is idempotent — safe to run even when
Base.metadata.create_all() has already created the tables at application startup.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "0003_glba_assessments"
down_revision: Union[str, None] = "0002_audits_issues"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = inspect(bind).get_table_names()

    if "glba_assessments" not in existing:
        op.create_table(
            "glba_assessments",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("entity", sa.String(), nullable=True),
            sa.Column("period", sa.String(), nullable=True),
            sa.Column("lead", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("created_by", sa.String(), nullable=True),
            sa.Column("created_at", sa.String(), nullable=True),
            sa.Column("updated_at", sa.String(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_glba_assessments_id"), "glba_assessments", ["id"], unique=False)
        op.create_index(op.f("ix_glba_assessments_status"), "glba_assessments", ["status"], unique=False)

    if "glba_control_responses" not in existing:
        op.create_table(
            "glba_control_responses",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("assessment_id", sa.Integer(), nullable=False),
            sa.Column("control_id", sa.String(), nullable=False),
            sa.Column("owner_desc", sa.Text(), nullable=True),
            sa.Column("owner_evidence", sa.Text(), nullable=True),
            sa.Column("owner_sign", sa.String(), nullable=True),
            sa.Column("test_methods", sa.JSON(), nullable=True),
            sa.Column("result", sa.String(), nullable=True),
            sa.Column("maturity", sa.String(), nullable=True),
            sa.Column("assessor_notes", sa.Text(), nullable=True),
            sa.Column("assessor_sign", sa.String(), nullable=True),
            sa.ForeignKeyConstraint(["assessment_id"], ["glba_assessments.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("assessment_id", "control_id", name="uq_glba_response_control"),
        )
        op.create_index(op.f("ix_glba_control_responses_id"), "glba_control_responses", ["id"], unique=False)
        op.create_index(
            op.f("ix_glba_control_responses_assessment_id"),
            "glba_control_responses",
            ["assessment_id"],
            unique=False,
        )
        op.create_index(
            op.f("ix_glba_control_responses_control_id"),
            "glba_control_responses",
            ["control_id"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    existing = inspect(bind).get_table_names()

    if "glba_control_responses" in existing:
        op.drop_index(op.f("ix_glba_control_responses_control_id"), table_name="glba_control_responses")
        op.drop_index(op.f("ix_glba_control_responses_assessment_id"), table_name="glba_control_responses")
        op.drop_index(op.f("ix_glba_control_responses_id"), table_name="glba_control_responses")
        op.drop_table("glba_control_responses")

    if "glba_assessments" in existing:
        op.drop_index(op.f("ix_glba_assessments_status"), table_name="glba_assessments")
        op.drop_index(op.f("ix_glba_assessments_id"), table_name="glba_assessments")
        op.drop_table("glba_assessments")
