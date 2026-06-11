"""Remove the temporary per-subscription document count limit.

Revision ID: 20260611_0002
Revises: 20260609_0001
Create Date: 2026-06-11
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "20260611_0002"
down_revision: str | None = "20260609_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Remove stale document-count limits from existing subscriptions."""
    op.execute(
        """
        UPDATE subscriptions
        SET usage_limits = usage_limits - 'documents'
        WHERE usage_limits ? 'documents'
        """
    )


def downgrade() -> None:
    """Restore the former free-plan document limit."""
    op.execute(
        """
        UPDATE subscriptions
        SET usage_limits = jsonb_set(usage_limits, '{documents}', '5'::jsonb, true)
        WHERE NOT usage_limits ? 'documents'
        """
    )
