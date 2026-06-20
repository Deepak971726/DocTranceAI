DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_status') THEN
    CREATE TYPE document_status AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'FAILED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_role') THEN
    CREATE TYPE message_role AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_status') THEN
    CREATE TYPE message_status AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_name') THEN
    CREATE TYPE plan_name AS ENUM ('FREE', 'PRO', 'BUSINESS');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE subscription_status AS ENUM (
      'ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'INCOMPLETE'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'auth_token_type') THEN
    CREATE TYPE auth_token_type AS ENUM ('REFRESH', 'EMAIL_VERIFICATION', 'PASSWORD_RESET');
  END IF;
END $$;

CREATE TABLE users (
  id uuid PRIMARY KEY,
  email varchar(320) NOT NULL,
  password_hash varchar(255) NOT NULL,
  full_name varchar(200),
  is_active boolean NOT NULL DEFAULT true,
  is_verified boolean NOT NULL DEFAULT false,
  email_verified_at timestamptz,
  last_login_at timestamptz,
  token_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX ix_users_active_email ON users (email) WHERE deleted_at IS NULL;
CREATE INDEX ix_users_deleted_at ON users (deleted_at);

CREATE TABLE auth_tokens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL,
  token_type auth_token_type NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  user_agent varchar(500),
  ip_address varchar(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_auth_tokens_hash UNIQUE (token_hash)
);
CREATE INDEX ix_auth_tokens_user_type ON auth_tokens (user_id, token_type);
CREATE INDEX ix_auth_tokens_expires_at ON auth_tokens (expires_at);

CREATE TABLE documents (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename varchar(255) NOT NULL,
  original_filename varchar(255) NOT NULL,
  content_type varchar(120) NOT NULL,
  file_size bigint NOT NULL,
  checksum_sha256 varchar(64) NOT NULL,
  storage_bucket varchar(100) NOT NULL,
  storage_path varchar(1024) NOT NULL,
  status document_status NOT NULL DEFAULT 'UPLOADING',
  processing_error text,
  processing_started_at timestamptz,
  processing_completed_at timestamptz,
  retry_count integer NOT NULL DEFAULT 0,
  page_count integer,
  chunk_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT ck_documents_file_size_positive CHECK (file_size > 0),
  CONSTRAINT uq_documents_user_storage_path UNIQUE (user_id, storage_path)
);
CREATE INDEX ix_documents_user_status ON documents (user_id, status);
CREATE INDEX ix_documents_worker_claim ON documents (status, processing_started_at);
CREATE INDEX ix_documents_deleted_at ON documents (deleted_at);

CREATE TABLE document_chunks (
  id uuid PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  page_number integer,
  chunk_text text NOT NULL,
  token_count integer,
  qdrant_point_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT uq_document_chunk_index UNIQUE (document_id, chunk_index),
  CONSTRAINT uq_document_chunks_qdrant_point UNIQUE (qdrant_point_id)
);
CREATE INDEX ix_document_chunks_user_document ON document_chunks (user_id, document_id);
CREATE INDEX ix_document_chunks_page ON document_chunks (document_id, page_number);
CREATE INDEX ix_document_chunks_deleted_at ON document_chunks (deleted_at);

CREATE TABLE conversations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX ix_conversations_user_updated ON conversations (user_id, updated_at);
CREATE INDEX ix_conversations_deleted_at ON conversations (deleted_at);

CREATE TABLE conversation_documents (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_conversation_document_link UNIQUE (conversation_id, document_id)
);
CREATE INDEX ix_conversation_documents_user
  ON conversation_documents (user_id, conversation_id);

CREATE TABLE messages (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role message_role NOT NULL,
  status message_status NOT NULL DEFAULT 'COMPLETED',
  content text NOT NULL,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_name varchar(120),
  prompt_tokens integer,
  completion_tokens integer,
  latency_ms integer,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX ix_messages_user_conversation_created
  ON messages (user_id, conversation_id, created_at);
CREATE INDEX ix_messages_deleted_at ON messages (deleted_at);

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_name plan_name NOT NULL DEFAULT 'FREE',
  status subscription_status NOT NULL DEFAULT 'ACTIVE',
  usage_limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_customer_id varchar(255) UNIQUE,
  provider_subscription_id varchar(255) UNIQUE,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT uq_subscriptions_user UNIQUE (user_id)
);
CREATE INDEX ix_subscriptions_status_period ON subscriptions (status, current_period_end);
CREATE INDEX ix_subscriptions_deleted_at ON subscriptions (deleted_at);

CREATE TABLE usage_tracking (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date date NOT NULL,
  documents_uploaded integer NOT NULL DEFAULT 0,
  questions_asked integer NOT NULL DEFAULT 0,
  storage_bytes bigint NOT NULL DEFAULT 0,
  ai_requests integer NOT NULL DEFAULT 0,
  embedding_tokens bigint NOT NULL DEFAULT 0,
  prompt_tokens bigint NOT NULL DEFAULT 0,
  completion_tokens bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_usage_user_date UNIQUE (user_id, usage_date),
  CONSTRAINT ck_usage_documents_nonnegative CHECK (documents_uploaded >= 0),
  CONSTRAINT ck_usage_questions_nonnegative CHECK (questions_asked >= 0),
  CONSTRAINT ck_usage_storage_nonnegative CHECK (storage_bytes >= 0),
  CONSTRAINT ck_usage_ai_requests_nonnegative CHECK (ai_requests >= 0)
);
CREATE INDEX ix_usage_tracking_user_date ON usage_tracking (user_id, usage_date);

CREATE TABLE api_keys (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  key_prefix varchar(20) NOT NULL,
  key_hash varchar(64) NOT NULL,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT uq_api_keys_hash UNIQUE (key_hash)
);
CREATE INDEX ix_api_keys_user_active ON api_keys (user_id, revoked_at);
CREATE INDEX ix_api_keys_prefix ON api_keys (key_prefix);
CREATE INDEX ix_api_keys_deleted_at ON api_keys (deleted_at);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action varchar(120) NOT NULL,
  resource_type varchar(120),
  resource_id uuid,
  ip_address varchar(64),
  user_agent varchar(500),
  request_id varchar(64),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_logs_user_created ON audit_logs (user_id, created_at);
CREATE INDEX ix_audit_logs_action_created ON audit_logs (action, created_at);

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $function$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
$function$;

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
AS $function$
  SELECT u.id, u.password_hash, u.token_version, u.is_active, u.is_verified
  FROM public.users AS u
  WHERE u.email = lower(p_email) AND u.deleted_at IS NULL
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION private.claim_document(
  p_document_id uuid,
  p_stale_minutes integer,
  p_max_retries integer
)
RETURNS TABLE (document_id uuid, user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
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
      OR d.processing_started_at < now() - make_interval(mins => p_stale_minutes)
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
$function$;

REVOKE ALL ON FUNCTION private.get_user_for_auth(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.claim_document(uuid, integer, integer) FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'doctraceai_app') THEN
    CREATE ROLE doctraceai_app NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public, private TO doctraceai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO doctraceai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO doctraceai_app;
GRANT EXECUTE ON FUNCTION private.get_user_for_auth(text) TO doctraceai_app;
GRANT EXECUTE ON FUNCTION private.claim_document(uuid, integer, integer) TO doctraceai_app;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks FORCE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE conversation_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking FORCE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY users_tenant_all ON users
  FOR ALL TO doctraceai_app
  USING (id = private.current_user_id())
  WITH CHECK (id = private.current_user_id());
CREATE POLICY auth_tokens_tenant_all ON auth_tokens
  FOR ALL TO doctraceai_app
  USING (user_id = private.current_user_id())
  WITH CHECK (user_id = private.current_user_id());
CREATE POLICY documents_tenant_all ON documents
  FOR ALL TO doctraceai_app
  USING (user_id = private.current_user_id())
  WITH CHECK (user_id = private.current_user_id());
CREATE POLICY document_chunks_tenant_all ON document_chunks
  FOR ALL TO doctraceai_app
  USING (user_id = private.current_user_id())
  WITH CHECK (user_id = private.current_user_id());
CREATE POLICY conversations_tenant_all ON conversations
  FOR ALL TO doctraceai_app
  USING (user_id = private.current_user_id())
  WITH CHECK (user_id = private.current_user_id());
CREATE POLICY conversation_documents_tenant_all ON conversation_documents
  FOR ALL TO doctraceai_app
  USING (user_id = private.current_user_id())
  WITH CHECK (user_id = private.current_user_id());
CREATE POLICY messages_tenant_all ON messages
  FOR ALL TO doctraceai_app
  USING (user_id = private.current_user_id())
  WITH CHECK (user_id = private.current_user_id());
CREATE POLICY subscriptions_tenant_all ON subscriptions
  FOR ALL TO doctraceai_app
  USING (user_id = private.current_user_id())
  WITH CHECK (user_id = private.current_user_id());
CREATE POLICY usage_tracking_tenant_all ON usage_tracking
  FOR ALL TO doctraceai_app
  USING (user_id = private.current_user_id())
  WITH CHECK (user_id = private.current_user_id());
CREATE POLICY api_keys_tenant_all ON api_keys
  FOR ALL TO doctraceai_app
  USING (user_id = private.current_user_id())
  WITH CHECK (user_id = private.current_user_id());
CREATE POLICY audit_logs_tenant_all ON audit_logs
  FOR ALL TO doctraceai_app
  USING (user_id = private.current_user_id())
  WITH CHECK (user_id = private.current_user_id());

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
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
