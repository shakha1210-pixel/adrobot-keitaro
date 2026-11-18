"""create operation_log (аудит операций)

Revision ID: 0001
Revises:
Create Date: 2026-11-19

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "operation_log",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("keitaro_campaign_id", sa.Integer(), nullable=True),
        sa.Column("campaign_name", sa.String(length=255), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="ok"),
        sa.Column("error", sa.Text(), nullable=True),
    )
    op.create_index("ix_operation_log_action", "operation_log", ["action"])
    op.create_index(
        "ix_operation_log_keitaro_campaign_id", "operation_log", ["keitaro_campaign_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_operation_log_keitaro_campaign_id", table_name="operation_log")
    op.drop_index("ix_operation_log_action", table_name="operation_log")
    op.drop_table("operation_log")
