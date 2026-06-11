# DocTraceAI Backend

Production-oriented FastAPI backend for multi-tenant document upload, extraction, retrieval,
grounded chat, citations, summaries, FAQs, usage metering, and subscription preparation.

## Architecture

The API and worker share the same service layer. PostgreSQL is the durable source of truth.
An upload is first stored in a private Supabase bucket, then marked `PROCESSING`. FastAPI starts
an immediate background task, while the independent worker polls the same rows and uses
`FOR UPDATE SKIP LOCKED` to recover abandoned or failed work. No Redis, Celery, RabbitMQ,
Kafka, or other queue is used.

```text
app/
|-- api/             HTTP routes, versioning, and global exception translation
|-- constants/       Immutable prompts and domain constants
|-- core/            Environment settings, JWT/password security, structured logging
|-- db/              SQLAlchemy engine, sessions, and PostgreSQL tenant context
|-- dependencies/    FastAPI dependency injection and provider composition
|-- exceptions/      Typed domain/infrastructure exceptions
|-- integrations/    Supabase Storage, Qdrant, Ollama, and SMTP adapters
|-- middleware/      Request correlation, timing, metrics, and security headers
|-- models/          SQLAlchemy entities, relationships, constraints, and enums
|-- repositories/    Tenant-filtered persistence and atomic usage operations
|-- schemas/         Pydantic request/response validation contracts
|-- services/        Authentication, ingestion, RAG, chat, generation, account use cases
|-- utils/           Safe file reading, filename normalization, and content validation
|-- workers/         Durable PostgreSQL-polling document worker
`-- main.py          FastAPI application, middleware, lifespan, and route registration
```

Clean Architecture direction is `api -> services -> repositories/integration interfaces`.
Routes do not contain database or provider logic. Provider construction is isolated under
`dependencies/`. Embeddings and answer generation run locally through Ollama without an API key.

## Database Tables

| Table | Responsibility |
|---|---|
| `users` | Identity, bcrypt password hash, verification state, JWT revocation version |
| `auth_tokens` | SHA-256 digests for refresh, verification, and password-reset tokens |
| `documents` | File metadata, Supabase path, checksum, and processing state |
| `document_chunks` | Page-aware source chunks and stable Qdrant point IDs |
| `conversations` | Tenant-owned chat threads |
| `conversation_documents` | Relational selection for single- or multi-document chat |
| `messages` | User/assistant history, citations, model, latency, and failure state |
| `subscriptions` | Free/Pro/Business plan and future Stripe identifiers |
| `usage_tracking` | Atomic daily documents, questions, storage, and AI counters |
| `api_keys` | Hashed personal keys, scopes, expiry, and revocation |
| `audit_logs` | Append-only operational and security event trail |

All foreign keys, common access indexes, uniqueness constraints, non-negative usage checks,
timestamps, and soft deletion fields are included in the initial Alembic migration.

## Tenant Isolation

Tenant isolation is enforced in three layers:

1. JWT validation establishes a transaction-local `app.current_user_id`.
2. Every repository method for user data requires `user_id` and includes it in SQL predicates.
3. PostgreSQL RLS policies compare `user_id` to `private.current_user_id()`.

Qdrant searches and deletes also require a `user_id` payload filter. Supabase object paths start
with the user UUID and are reachable only through the backend service key. The service key must
never be sent to the React application.

The migration creates a non-login group role named `doctraceai_app`. In production, create a
dedicated login role, grant it membership in `doctraceai_app`, and use that login in
`DATABASE_URL`. Alembic derives its sync connection from the same Supabase URL. This separation
is required because table owners and superusers bypass RLS.

Login is the one operation performed before the tenant UUID is known. It calls
`private.get_user_for_auth(email)`, a narrowly scoped `SECURITY DEFINER` function in an
unexposed schema. It returns only the fields needed to verify credentials.

## Document Pipeline

1. Read upload in 1 MiB blocks with a strict byte limit.
2. Validate extension, declared MIME type, magic bytes, UTF-8 text, and DOCX ZIP structure.
3. Store a randomized path in a private Supabase Storage bucket.
4. Persist `UPLOADING`, then transition to `PROCESSING`.
5. Extract PDF pages with PyMuPDF, DOCX headings/paragraphs with `python-docx`, or UTF-8 TXT.
6. Split each source section using `RecursiveCharacterTextSplitter` at 800 characters with
   150-character overlap. The page or heading provenance stays attached to every chunk.
7. Generate embeddings locally using Ollama with `nomic-embed-text`.
8. Store relational chunks and upsert vectors into Qdrant collection `document_chunks`.
9. Mark the document `READY`; failures are retried by the worker and eventually marked `FAILED`.

The overlap retains context around boundaries while 800 characters remains small enough for
focused retrieval. PDFs preserve 1-based page numbers for citations. DOCX/TXT formats do not
have reliable page boundaries, so their page number is `null`.

Uploads are quarantined by design: private bucket, randomized object names, no execution or
public serving, executable signatures rejected, and DOCX decompression limits. For regulated
deployments, place a ClamAV or commercial malware-scanning service before the transition from
`UPLOADING` to `PROCESSING`.

## Retrieval and Citations

Every question is embedded and searched with a mandatory Qdrant tenant filter plus optional
document IDs. Context blocks are labeled `[C1]`, `[C2]`, and so on. The system prompt instructs
Ollama to use only those blocks, ignore instructions found inside documents, avoid unsupported
claims, and return a fixed insufficient-information response when evidence is absent.

API citations include document UUID/name, PDF page, chunk UUID/index, similarity score, and a
short excerpt. Streaming chat uses Server-Sent Events: `metadata`, repeated `token`, then `done`
or `error`.

## API

FastAPI publishes complete request/response schemas at `/docs` and `/redoc` outside production.
The main endpoints are:

| Method | Path | Success |
|---|---|---|
| POST | `/api/v1/auth/register` | 201 |
| POST | `/api/v1/auth/login` | 200 |
| POST | `/api/v1/auth/refresh` | 200 |
| POST | `/api/v1/auth/logout` | 200 |
| POST | `/api/v1/auth/verify-email` | 200 |
| POST | `/api/v1/auth/forgot-password` | 200 |
| POST | `/api/v1/auth/reset-password` | 200 |
| POST | `/api/v1/documents/upload` | 202 |
| GET | `/api/v1/documents` | 200 |
| GET/DELETE | `/api/v1/documents/{id}` | 200 |
| POST | `/api/v1/documents/search/semantic` | 200 |
| POST | `/api/v1/documents/{id}/summary` | 200 |
| POST | `/api/v1/documents/{id}/faqs` | 200 |
| POST | `/api/v1/chat` | 200 or SSE stream |
| GET | `/api/v1/conversations` | 200 |
| GET | `/api/v1/messages?conversation_id=...` | 200 |
| DELETE | `/api/v1/conversations/{id}` | 200 |
| GET | `/api/v1/usage` | 200 |
| GET | `/api/v1/subscription` | 200 |
| POST/GET/DELETE | `/api/v1/api-keys` | 201/200/200 |

Errors use:

```json
{
  "error": {
    "code": "validation_error",
    "message": "The supplied data is invalid.",
    "details": {},
    "request_id": "correlation-uuid"
  }
}
```

Common statuses are `401` invalid credentials, `403` unverified/unauthorized, `404` tenant
resource absent, `409` duplicate/state conflict, `422` validation, `502` provider failure,
and `503` database/readiness failure.

## Setup

Requirements are Python 3.12, Docker, a Supabase project, and Qdrant Cloud or local Qdrant.

```bash
cp .env.example .env
python -m pip install -r requirements-dev.txt
alembic upgrade head
uvicorn app.main:app --reload
python -m app.workers.document_worker
```

For Docker:

```bash
docker compose up --build
```

The compose stack starts API, worker, Qdrant, Ollama, and pulls `llama3` plus
`nomic-embed-text`. PostgreSQL and file storage remain in Supabase.

For the free local AI models:

```powershell
ollama pull nomic-embed-text
ollama pull llama3
```

Keep `OLLAMA_BASE_URL=http://localhost:11434`,
`OLLAMA_REQUEST_TIMEOUT_SECONDS=1200`, `OLLAMA_KEEP_ALIVE=30m`, and
`OLLAMA_CONTEXT_TOKENS=2048` in `.env`. No OpenAI account, API key, or per-request AI payment is
required. Ollama uses this computer's CPU/GPU and memory.

Changing embedding model or dimensions requires a new Qdrant collection and re-indexing all
documents. Do not point a collection at vectors of mixed dimensions.

## Supabase

1. Create a project and copy the backend connection strings from **Connect**.
2. Use direct or session-pooler port 5432 for persistent API and worker containers. Transaction
   pooler port 6543 is intended for transient/serverless traffic.
3. Set `DATABASE_SSL_REQUIRE=true` and use `ssl=require` in production. Configure the Supabase
   root certificate where required.
4. Run `alembic upgrade head`; Alembic derives the sync URL from `DATABASE_URL` and creates the
   private `documents` bucket when the Supabase `storage` schema is present.
5. Keep the service-role/secret key only in API and worker secret stores.
6. Use a dedicated non-owner runtime login that inherits `doctraceai_app`.

The backend exclusively performs Storage operations with the service key, so frontend Storage
policies are intentionally not granted. If direct browser uploads are introduced later, add
explicit `storage.objects` RLS policies for insert/select/delete and never expose the service key.

## Deployment

### Railway

Create two services from the same image. API start command:

```text
uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers
```

Worker start command:

```text
python -m app.workers.document_worker
```

Set all `.env.example` values as shared secrets. Run `alembic upgrade head` as the release
command. A hosted deployment needs an externally reachable Ollama server because the free models
run outside Railway. Railway ephemeral disks must not hold Qdrant production data.

### Render

Create one Web Service and one Background Worker from the Dockerfile. Use the same commands as
above, set `/api/v1/health/live` as the health check, and run Alembic before deployment. Render
free services may sleep and are unsuitable for reliable background processing.

### Supabase

Use the same Supabase runtime database URL for the API and worker. Alembic automatically converts
that async URL to a sync driver URL for migrations. Size SQLAlchemy's pool so the combined replicas
stay below the project's connection budget. Enable backups/PITR appropriate to the plan and
monitor database connections.

### Qdrant Cloud

Create a cluster, set `QDRANT_URL` and `QDRANT_API_KEY`, restrict network access where available,
and enable snapshots. The application creates the collection and keyword payload indexes
idempotently. Scale Qdrant independently from PostgreSQL.

## Operations

- Liveness: `/api/v1/health/live`
- Readiness: `/api/v1/health/ready`
- Prometheus: `/api/v1/metrics`
- Logs: structured JSON with request ID, user ID, processing stage, duration, and provider errors
- Migrations: `alembic upgrade head`
- Tests: `pytest --cov=app`

Password hashes, raw JWTs, API keys, service keys, and full document text are never logged.
Use a secret manager, rotate JWT and provider keys, terminate TLS at the platform, restrict CORS
and trusted hosts, and set short access-token lifetime in production.
