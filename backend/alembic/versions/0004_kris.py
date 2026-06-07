"""kris table

Revision ID: 0004_kris
Revises: 0003_glba_assessments
Create Date: 2026-06-06

Creates the Key Risk Indicator (KRI) register table.
Uses existence checks so the migration is idempotent — safe to run even when
Base.metadata.create_all() has already created the table at application startup.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "0004_kris"
down_revision: Union[str, None] = "0003_glba_assessments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = inspect(bind).get_table_names()

    if "kris" not in existing:
        op.create_table(
            "kris",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("kri_code", sa.String(), nullable=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("category", sa.String(), nullable=False),
            sa.Column("owner", sa.String(), nullable=True),
            sa.Column("frequency", sa.String(), nullable=False),
            sa.Column("current_value", sa.String(), nullable=True),
            sa.Column("threshold", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("trend", sa.String(), nullable=True),
            sa.Column("measurement_date", sa.String(), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_kris_id"), "kris", ["id"], unique=False)
        op.create_index(op.f("ix_kris_kri_code"), "kris", ["kri_code"], unique=False)
        op.create_index(op.f("ix_kris_category"), "kris", ["category"], unique=False)
        op.create_index(op.f("ix_kris_status"), "kris", ["status"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    existing = inspect(bind).get_table_names()

    if "kris" in existing:
        op.drop_index(op.f("ix_kris_status"), table_name="kris")
        op.drop_index(op.f("ix_kris_category"), table_name="kris")
        op.drop_index(op.f("ix_kris_kri_code"), table_name="kris")
        op.drop_index(op.f("ix_kris_id"), table_name="kris")
        op.drop_table("kris")
