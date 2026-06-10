"""Initial DocTraceAI schema, indexes, private auth function, and RLS.

Revision ID: 20260609_0001
Revises:
Create Date: 2026-06-09
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260609_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

document_status = sa.Enum("UPLOADING", "PROCESSING", "READY", "FAILED", name="document_status")
message_role = sa.Enum("USER", "ASSISTANT", "SYSTEM", name="message_role")
message_status = sa.Enum("PENDING", "COMPLETED", "FAILED", name="message_status")
plan_name = sa.Enum("FREE", "PRO", "BUSINESS", name="plan_name")
subscription_status = sa.Enum(
    "ACTIVE",
    "TRIALING",
    "PAST_DUE",
    "CANCELED",
    "INCOMPLETE",
    name="subscription_status",
)
auth_token_type = sa.Enum("REFRESH", "EMAIL_VERIFICATION", "PASSWORD_RESET", name="auth_token_type")


def _timestamps() -> list[sa.Column[object]]:
    return [
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    ]


def upgrade() -> None:
    """Create all application objects."""
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(200)),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("is_verified", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("email_verified_at", sa.DateTime(timezone=True)),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
        sa.Column("token_version", sa.Integer(), server_default="1", nullable=False),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
    )
    op.create_index(
        "ix_users_active_email",
        "users",
        ["email"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index("ix_users_deleted_at", "users", ["deleted_at"])

    op.create_table(
        "auth_tokens",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("token_type", auth_token_type, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("user_agent", sa.String(500)),
        sa.Column("ip_address", sa.String(64)),
        *_timestamps(),
        sa.UniqueConstraint("token_hash", name="uq_auth_tokens_hash"),
    )
    op.create_index("ix_auth_tokens_user_type", "auth_tokens", ["user_id", "token_type"])
    op.create_index("ix_auth_tokens_expires_at", "auth_tokens", ["expires_at"])

    op.create_table(
        "documents",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(120), nullable=False),
        sa.Column("file_size", sa.BigInteger(), nullable=False),
        sa.Column("checksum_sha256", sa.String(64), nullable=False),
        sa.Column("storage_bucket", sa.String(100), nullable=False),
        sa.Column("storage_path", sa.String(1024), nullable=False),
        sa.Column("status", document_status, server_default="UPLOADING", nullable=False),
        sa.Column("processing_error", sa.Text()),
        sa.Column("processing_started_at", sa.DateTime(timezone=True)),
        sa.Column("processing_completed_at", sa.DateTime(timezone=True)),
        sa.Column("retry_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("page_count", sa.Integer()),
        sa.Column("chunk_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("file_size > 0", name="ck_documents_file_size_positive"),
        sa.UniqueConstraint("user_id", "storage_path", name="uq_documents_user_storage_path"),
    )
    op.create_index("ix_documents_user_status", "documents", ["user_id", "status"])
    op.create_index("ix_documents_worker_claim", "documents", ["status", "processing_started_at"])
    op.create_index("ix_documents_deleted_at", "documents", ["deleted_at"])

    op.create_table(
        "document_chunks",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "document_id",
            sa.Uuid(),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("page_number", sa.Integer()),
        sa.Column("chunk_text", sa.Text(), nullable=False),
        sa.Column("token_count", sa.Integer()),
        sa.Column("qdrant_point_id", sa.Uuid(), nullable=False),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("document_id", "chunk_index", name="uq_document_chunk_index"),
        sa.UniqueConstraint("qdrant_point_id", name="uq_document_chunks_qdrant_point"),
    )
    op.create_index(
        "ix_document_chunks_user_document", "document_chunks", ["user_id", "document_id"]
    )
    op.create_index("ix_document_chunks_page", "document_chunks", ["document_id", "page_number"])
    op.create_index("ix_document_chunks_deleted_at", "document_chunks", ["deleted_at"])

    op.create_table(
        "conversations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("title", sa.String(255), nullable=False),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_conversations_user_updated", "conversations", ["user_id", "updated_at"])
    op.create_index("ix_conversations_deleted_at", "conversations", ["deleted_at"])

    op.create_table(
        "conversation_documents",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "conversation_id",
            sa.Uuid(),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "document_id",
            sa.Uuid(),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        *_timestamps(),
        sa.UniqueConstraint("conversation_id", "document_id", name="uq_conversation_document_link"),
    )
    op.create_index(
        "ix_conversation_documents_user",
        "conversation_documents",
        ["user_id", "conversation_id"],
    )

    op.create_table(
        "messages",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "conversation_id",
            sa.Uuid(),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", message_role, nullable=False),
        sa.Column("status", message_status, server_default="COMPLETED", nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "citations",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("model_name", sa.String(120)),
        sa.Column("prompt_tokens", sa.Integer()),
        sa.Column("completion_tokens", sa.Integer()),
        sa.Column("latency_ms", sa.Integer()),
        sa.Column("error_message", sa.Text()),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
    )
    op.create_index(
        "ix_messages_user_conversation_created",
        "messages",
        ["user_id", "conversation_id", "created_at"],
    )
    op.create_index("ix_messages_deleted_at", "messages", ["deleted_at"])

    op.create_table(
        "subscriptions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("plan_name", plan_name, server_default="FREE", nullable=False),
        sa.Column("status", subscription_status, server_default="ACTIVE", nullable=False),
        sa.Column(
            "usage_limits",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("provider_customer_id", sa.String(255), unique=True),
        sa.Column("provider_subscription_id", sa.String(255), unique=True),
        sa.Column("current_period_start", sa.DateTime(timezone=True)),
        sa.Column("current_period_end", sa.DateTime(timezone=True)),
        sa.Column(
            "cancel_at_period_end", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("user_id", name="uq_subscriptions_user"),
    )
    op.create_index(
        "ix_subscriptions_status_period",
        "subscriptions",
        ["status", "current_period_end"],
    )
    op.create_index("ix_subscriptions_deleted_at", "subscriptions", ["deleted_at"])

    op.create_table(
        "usage_tracking",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("usage_date", sa.Date(), nullable=False),
        sa.Column("documents_uploaded", sa.Integer(), server_default="0", nullable=False),
        sa.Column("questions_asked", sa.Integer(), server_default="0", nullable=False),
        sa.Column("storage_bytes", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("ai_requests", sa.Integer(), server_default="0", nullable=False),
        sa.Column("embedding_tokens", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("prompt_tokens", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("completion_tokens", sa.BigInteger(), server_default="0", nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("user_id", "usage_date", name="uq_usage_user_date"),
        sa.CheckConstraint("documents_uploaded >= 0", name="ck_usage_documents_nonnegative"),
        sa.CheckConstraint("questions_asked >= 0", name="ck_usage_questions_nonnegative"),
        sa.CheckConstraint("storage_bytes >= 0", name="ck_usage_storage_nonnegative"),
        sa.CheckConstraint("ai_requests >= 0", name="ck_usage_ai_requests_nonnegative"),
    )
    op.create_index("ix_usage_tracking_user_date", "usage_tracking", ["user_id", "usage_date"])

    op.create_table(
        "api_keys",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("key_prefix", sa.String(20), nullable=False),
        sa.Column("key_hash", sa.String(64), nullable=False),
        sa.Column(
            "scopes",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True)),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("key_hash", name="uq_api_keys_hash"),
    )
    op.create_index("ix_api_keys_user_active", "api_keys", ["user_id", "revoked_at"])
    op.create_index("ix_api_keys_prefix", "api_keys", ["key_prefix"])
    op.create_index("ix_api_keys_deleted_at", "api_keys", ["deleted_at"])

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("action", sa.String(120), nullable=False),
        sa.Column("resource_type", sa.String(120)),
        sa.Column("resource_id", sa.Uuid()),
        sa.Column("ip_address", sa.String(64)),
        sa.Column("user_agent", sa.String(500)),
        sa.Column("request_id", sa.String(64)),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_audit_logs_user_created", "audit_logs", ["user_id", "created_at"])
    op.create_index("ix_audit_logs_action_created", "audit_logs", ["action", "created_at"])

    _create_security_objects()
    _create_supabase_bucket()


def _create_security_objects() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS private")
    op.execute(
        """
        CREATE OR REPLACE FUNCTION private.current_user_id()
        RETURNS uuid
        LANGUAGE sql
        STABLE
        SET search_path = pg_catalog
        AS $$
          SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
        $$
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION private.get_user_for_auth(p_email text)
        RETURNS TABLE (
          id uuid,
          password_hash text,
          token_version integer,
          is_active boolean,
          is_verified boolean
        )
        LANGUAGE sql
        SECURITY DEFINER
        STABLE
        SET search_path = public, pg_temp
        AS $$
          SELECT u.id, u.password_hash, u.token_version, u.is_active, u.is_verified
          FROM public.users AS u
          WHERE u.email = lower(p_email) AND u.deleted_at IS NULL
          LIMIT 1
        $$
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION private.claim_document(
          p_document_id uuid,
          p_stale_minutes integer,
          p_max_retries integer
        )
        RETURNS TABLE (document_id uuid, user_id uuid)
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
        DECLARE
          claimed_id uuid;
          claimed_user_id uuid;
        BEGIN
          SELECT d.id, d.user_id
          INTO claimed_id, claimed_user_id
          FROM public.documents AS d
          WHERE d.status = 'PROCESSING'
            AND d.deleted_at IS NULL
            AND d.retry_count < p_max_retries
            AND (
              d.processing_started_at IS NULL
              OR d.processing_started_at
                < now() - make_interval(mins => p_stale_minutes)
            )
            AND (p_document_id IS NULL OR d.id = p_document_id)
          ORDER BY d.created_at
          FOR UPDATE SKIP LOCKED
          LIMIT 1;

          IF claimed_id IS NULL THEN
            RETURN;
          END IF;

          UPDATE public.documents AS d
          SET processing_started_at = now(),
              retry_count = d.retry_count + 1,
              processing_error = NULL,
              updated_at = now()
          WHERE d.id = claimed_id;

          RETURN QUERY SELECT claimed_id, claimed_user_id;
        END
        $$
        """
    )
    op.execute("REVOKE ALL ON FUNCTION private.get_user_for_auth(text) FROM PUBLIC")
    op.execute("REVOKE ALL ON FUNCTION private.claim_document(uuid, integer, integer) FROM PUBLIC")
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'doctraceai_app') THEN
            CREATE ROLE doctraceai_app NOLOGIN;
          END IF;
        END $$;
        """
    )
    op.execute("GRANT USAGE ON SCHEMA public, private TO doctraceai_app")
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO doctraceai_app"
    )
    op.execute(
        """
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO doctraceai_app
        """
    )
    op.execute("GRANT EXECUTE ON FUNCTION private.get_user_for_auth(text) TO doctraceai_app")
    op.execute(
        """
        GRANT EXECUTE ON FUNCTION private.claim_document(uuid, integer, integer)
        TO doctraceai_app
        """
    )

    tenant_tables = [
        "users",
        "auth_tokens",
        "documents",
        "document_chunks",
        "conversations",
        "conversation_documents",
        "messages",
        "subscriptions",
        "usage_tracking",
        "api_keys",
        "audit_logs",
    ]
    for table in tenant_tables:
        op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')
        op.execute(f'ALTER TABLE "{table}" FORCE ROW LEVEL SECURITY')
    op.execute(
        """
        CREATE POLICY users_tenant_all ON users
        FOR ALL TO doctraceai_app
        USING (id = private.current_user_id())
        WITH CHECK (id = private.current_user_id())
        """
    )
    for table in tenant_tables[1:]:
        op.execute(
            f"""
            CREATE POLICY {table}_tenant_all ON {table}
            FOR ALL TO doctraceai_app
            USING (user_id = private.current_user_id())
            WITH CHECK (user_id = private.current_user_id())
            """
        )


def _create_supabase_bucket() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'storage' AND table_name = 'buckets'
          ) THEN
            INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
            VALUES (
              'documents',
              'documents',
              false,
              26214400,
              ARRAY[
                'application/pdf',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'text/plain'
              ]
            )
            ON CONFLICT (id) DO NOTHING;
          END IF;
        END $$;
        """
    )


def downgrade() -> None:
    """Drop application objects in reverse dependency order."""
    op.execute("DROP FUNCTION IF EXISTS private.get_user_for_auth(text)")
    op.execute("DROP FUNCTION IF EXISTS private.claim_document(uuid, integer, integer)")
    op.execute("DROP FUNCTION IF EXISTS private.current_user_id()")
    for table in (
        "audit_logs",
        "api_keys",
        "usage_tracking",
        "subscriptions",
        "messages",
        "conversation_documents",
        "conversations",
        "document_chunks",
        "documents",
        "auth_tokens",
        "users",
    ):
        op.drop_table(table)
    bind = op.get_bind()
    for enum in (
        auth_token_type,
        subscription_status,
        plan_name,
        message_status,
        message_role,
        document_status,
    ):
        enum.drop(bind, checkfirst=True)
