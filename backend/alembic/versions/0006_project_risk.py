"""project_risk tables

Revision ID: 0006_project_risk
Revises: 0005_sca_reports
Create Date: 2026-06-16

Creates the Project Risk Assessment tables used by the AI-driven, quantified
project risk module. Uses existence checks so the migration is idempotent —
safe to run even when Base.metadata.create_all() has already created the tables
at application startup.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "0006_project_risk"
down_revision: Union[str, None] = "0005_sca_reports"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = inspect(bind).get_table_names()

    if "project_risk_assessments" not in existing:
        op.create_table(
            "project_risk_assessments",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("project_name", sa.String(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("assessor", sa.String(), nullable=True),
            sa.Column("period", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="Draft"),
            sa.Column("executive_summary", sa.Text(), nullable=True),
            sa.Column("overall_inherent_rating", sa.String(), nullable=True),
            sa.Column("overall_residual_rating", sa.String(), nullable=True),
            sa.Column("ai_model", sa.String(), nullable=True),
            sa.Column("created_by", sa.String(), nullable=True),
            sa.Column("created_at", sa.String(), nullable=True),
            sa.Column("updated_at", sa.String(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            op.f("ix_project_risk_assessments_id"), "project_risk_assessments", ["id"], unique=False
        )
        op.create_index(
            op.f("ix_project_risk_assessments_project_name"),
            "project_risk_assessments", ["project_name"], unique=False,
        )
        op.create_index(
            op.f("ix_project_risk_assessments_status"),
            "project_risk_assessments", ["status"], unique=False,
        )

    if "project_risks" not in existing:
        op.create_table(
            "project_risks",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("assessment_id", sa.Integer(), nullable=False),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("category", sa.String(), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("likelihood", sa.Integer(), nullable=True),
            sa.Column("impact", sa.Integer(), nullable=True),
            sa.Column("inherent_rating", sa.String(), nullable=True),
            sa.Column("existing_controls", sa.Text(), nullable=True),
            sa.Column("recommended_mitigation", sa.Text(), nullable=True),
            sa.Column("residual_likelihood", sa.Integer(), nullable=True),
            sa.Column("residual_impact", sa.Integer(), nullable=True),
            sa.Column("residual_rating", sa.String(), nullable=True),
            sa.Column("owner", sa.String(), nullable=True),
            sa.Column("target_date", sa.String(), nullable=True),
            sa.Column("action_items", sa.JSON(), nullable=True),
            sa.Column("is_completed", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.ForeignKeyConstraint(
                ["assessment_id"], ["project_risk_assessments.id"], ondelete="CASCADE"
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_project_risks_id"), "project_risks", ["id"], unique=False)
        op.create_index(
            op.f("ix_project_risks_assessment_id"), "project_risks", ["assessment_id"], unique=False
        )


def downgrade() -> None:
    bind = op.get_bind()
    existing = inspect(bind).get_table_names()

    if "project_risks" in existing:
        op.drop_index(op.f("ix_project_risks_assessment_id"), table_name="project_risks")
        op.drop_index(op.f("ix_project_risks_id"), table_name="project_risks")
        op.drop_table("project_risks")

    if "project_risk_assessments" in existing:
        op.drop_index(
            op.f("ix_project_risk_assessments_status"), table_name="project_risk_assessments"
        )
        op.drop_index(
            op.f("ix_project_risk_assessments_project_name"), table_name="project_risk_assessments"
        )
        op.drop_index(
            op.f("ix_project_risk_assessments_id"), table_name="project_risk_assessments"
        )
        op.drop_table("project_risk_assessments")
