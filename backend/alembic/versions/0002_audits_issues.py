"""audits and issues tables

Revision ID: 0002_audits_issues
Revises: 0001_initial_users
Create Date: 2026-06-06

Creates the audit-registry and issue-tracker tables.
Uses existence checks so the migration is idempotent — safe to run even when
Base.metadata.create_all() has already created the tables at application startup.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "0002_audits_issues"
down_revision: Union[str, None] = "0001_initial_users"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = inspect(bind).get_table_names()

    if "audits" not in existing:
        op.create_table(
            "audits",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("audit_code", sa.String(), nullable=True),
            sa.Column("audit_type", sa.String(), nullable=False),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("start_date", sa.String(), nullable=True),
            sa.Column("end_date", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("requests_total", sa.Integer(), nullable=False),
            sa.Column("requests_open", sa.Integer(), nullable=False),
            sa.Column("walkthroughs", sa.Integer(), nullable=False),
            sa.Column("total_findings", sa.Integer(), nullable=False),
            sa.Column("open_findings", sa.Integer(), nullable=False),
            sa.Column("past_due", sa.Integer(), nullable=False),
            sa.Column("key_risks", sa.Text(), nullable=True),
            sa.Column("auditor_concerns", sa.Text(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_audits_id"), "audits", ["id"], unique=False)
        op.create_index(op.f("ix_audits_audit_code"), "audits", ["audit_code"], unique=False)
        op.create_index(op.f("ix_audits_status"), "audits", ["status"], unique=False)

    if "issues" not in existing:
        op.create_table(
            "issues",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("issue_number", sa.String(), nullable=True),
            sa.Column("issue_type", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("risk_rating", sa.String(), nullable=False),
            sa.Column("owner", sa.String(), nullable=True),
            sa.Column("identified_date", sa.String(), nullable=True),
            sa.Column("target_date", sa.String(), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("remediation_plan", sa.Text(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_issues_id"), "issues", ["id"], unique=False)
        op.create_index(op.f("ix_issues_issue_number"), "issues", ["issue_number"], unique=False)
        op.create_index(op.f("ix_issues_status"), "issues", ["status"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    existing = inspect(bind).get_table_names()

    if "issues" in existing:
        op.drop_index(op.f("ix_issues_status"), table_name="issues")
        op.drop_index(op.f("ix_issues_issue_number"), table_name="issues")
        op.drop_index(op.f("ix_issues_id"), table_name="issues")
        op.drop_table("issues")

    if "audits" in existing:
        op.drop_index(op.f("ix_audits_status"), table_name="audits")
        op.drop_index(op.f("ix_audits_audit_code"), table_name="audits")
        op.drop_index(op.f("ix_audits_id"), table_name="audits")
        op.drop_table("audits")
