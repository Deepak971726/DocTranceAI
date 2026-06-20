# DocTraceAI Backend

Node.js 22 and Express 5 backend for multi-tenant document upload, extraction, retrieval,
grounded chat, citations, summaries, FAQs, usage metering, and API-key management.

## Stack

- Express 5 with Zod request validation
- PostgreSQL/Supabase with `pg`, transactions, RLS, and durable worker claims
- Private Supabase Storage through the server-side service role
- Qdrant for tenant-filtered vector retrieval
- Local Ollama models for embeddings and answer generation
- Node's built-in test runner

The React frontend API contract remains under `/api/v1`.

## Layout

```text
src/
|-- constants/       Grounded generation prompts
|-- integrations/    Supabase Storage, Qdrant, Ollama, and SMTP
|-- middleware/      Authentication, validation, request IDs, and metrics
|-- repositories/    Tenant-scoped PostgreSQL queries
|-- routes/          Express route modules
|-- services/        Auth, documents, RAG, chat, generation, and account workflows
|-- utils/           Upload validation and filename hardening
|-- app.js           Express application and error handling
|-- server.js        API process entry point
`-- worker.js        Durable PostgreSQL-polling document worker

migrations/          SQL schema migrations
scripts/migrate.js   Node migration runner
test/                Node regression tests
```

## Setup

Requirements are Node.js 22+, npm, a Supabase project, Qdrant, and Ollama.

```powershell
Copy-Item .env.example .env
npm install
npm run migrate
npm run dev
```

Run the durable document worker in a second terminal:

```powershell
npm run worker
```

Pull the free local models:

```powershell
ollama pull nomic-embed-text
ollama pull llama3
```

No OpenAI API key is required.

## Existing Databases

The Node migration runner detects an existing `users` table and baselines the initial migration.
This allows a database previously created by Alembic to continue without recreating tables or
changing stored data. The second migration is idempotent and removes the retired document-count
limit from subscription JSON.

The existing PostgreSQL objects remain unchanged:

- `private.get_user_for_auth(email)` performs the login bootstrap.
- `private.claim_document(...)` claims work with `FOR UPDATE SKIP LOCKED`.
- `app.current_user_id` is set transaction-locally for RLS.
- `doctraceai_app` policies enforce tenant ownership on all user data.

Use a dedicated runtime login that inherits `doctraceai_app`; table owners and superusers bypass
RLS.

## Document Pipeline

1. Multer reads one upload into bounded memory.
2. The backend validates extension, MIME type, magic bytes, UTF-8 text, and DOCX ZIP limits.
3. Bytes are stored under a randomized tenant path in the private Supabase bucket.
4. PostgreSQL records transition from `UPLOADING` to `PROCESSING`.
5. The API starts immediate processing while the independent worker recovers stale jobs.
6. PDF, DOCX, or TXT text is extracted with source provenance.
7. Text is split into overlapping chunks and embedded through Ollama.
8. Chunks are stored in PostgreSQL and tenant-filtered vectors are upserted to Qdrant.
9. The document becomes `READY`; failures retry and eventually become `FAILED`.

## API

| Method | Path |
|---|---|
| POST | `/api/v1/auth/register` |
| POST | `/api/v1/auth/login` |
| POST | `/api/v1/auth/refresh` |
| POST | `/api/v1/auth/logout` |
| POST | `/api/v1/auth/forgot-password` |
| POST | `/api/v1/auth/reset-password` |
| POST | `/api/v1/documents/upload` |
| GET | `/api/v1/documents` |
| GET/DELETE | `/api/v1/documents/:id` |
| POST | `/api/v1/documents/search/semantic` |
| POST | `/api/v1/documents/:id/summary` |
| POST | `/api/v1/documents/:id/faqs` |
| POST | `/api/v1/chat` |
| GET | `/api/v1/conversations` |
| GET | `/api/v1/messages?conversation_id=...` |
| DELETE | `/api/v1/conversations/:id` |
| GET | `/api/v1/usage` |
| GET | `/api/v1/subscription` |
| POST/GET/DELETE | `/api/v1/api-keys` |

Streaming chat emits `metadata`, repeated `token`, then `done` or `error` Server-Sent Events.

Errors retain the existing envelope:

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

## Commands

```powershell
npm run dev
npm start
npm run worker
npm run migrate
npm test
npm run check
```

Docker starts the API, worker, Qdrant, Ollama, and model initializer:

```powershell
docker compose up --build
```

Operations endpoints:

- Liveness: `/api/v1/health/live`
- Readiness: `/api/v1/health/ready`
- Prometheus: `/api/v1/metrics`

Keep `SUPABASE_SERVICE_ROLE_KEY`, database credentials, JWT secrets, and SMTP credentials only in
server-side secret stores.
