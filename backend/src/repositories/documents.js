import crypto from "node:crypto";
import { setTenantContext } from "../db.js";

const documentColumns = `
  id, user_id, filename, original_filename, content_type, file_size, checksum_sha256,
  storage_bucket, storage_path, status, processing_error, processing_started_at,
  processing_completed_at, retry_count, page_count, chunk_count,
  metadata AS document_metadata, created_at, updated_at, deleted_at
`;

export async function createDocument(client, values) {
  const result = await client.query(
    `
      INSERT INTO documents (
        id, user_id, filename, original_filename, content_type, file_size,
        checksum_sha256, storage_bucket, storage_path, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING ${documentColumns}
    `,
    [
      values.id,
      values.userId,
      values.filename,
      values.originalFilename,
      values.contentType,
      values.fileSize,
      values.checksumSha256,
      values.storageBucket,
      values.storagePath,
      values.status,
    ],
  );
  return result.rows[0];
}

export async function getDocument(client, userId, documentId, { forUpdate = false } = {}) {
  const result = await client.query(
    `
      SELECT ${documentColumns}
      FROM documents
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
      ${forUpdate ? "FOR UPDATE" : ""}
    `,
    [documentId, userId],
  );
  return result.rows[0] ?? null;
}

export async function getReadyDocuments(client, userId, documentIds) {
  const result = await client.query(
    `
      SELECT ${documentColumns}
      FROM documents
      WHERE user_id = $1
        AND id = ANY($2::uuid[])
        AND status = 'READY'
        AND deleted_at IS NULL
    `,
    [userId, documentIds],
  );
  return result.rows;
}

export async function listDocuments(client, userId, { limit, offset }) {
  const [items, total] = await Promise.all([
    client.query(
      `
        SELECT ${documentColumns}
        FROM documents
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `,
      [userId, limit, offset],
    ),
    client.query(
      "SELECT count(*)::int AS total FROM documents WHERE user_id = $1 AND deleted_at IS NULL",
      [userId],
    ),
  ]);
  return { items: items.rows, total: total.rows[0].total };
}

export async function totalStorageBytes(client, userId) {
  const result = await client.query(
    `
      SELECT coalesce(sum(file_size), 0)::bigint AS total
      FROM documents
      WHERE user_id = $1 AND deleted_at IS NULL
    `,
    [userId],
  );
  return Number(result.rows[0].total);
}

export async function markDocumentProcessing(client, documentId) {
  const result = await client.query(
    `
      UPDATE documents
      SET status = 'PROCESSING', processing_error = NULL, updated_at = now()
      WHERE id = $1
      RETURNING ${documentColumns}
    `,
    [documentId],
  );
  return result.rows[0] ?? null;
}

export async function claimDocument(client, { documentId, staleMinutes, maxRetries }) {
  const claimedResult = await client.query(
    "SELECT * FROM private.claim_document($1, $2, $3)",
    [documentId ?? null, staleMinutes, maxRetries],
  );
  const claim = claimedResult.rows[0];
  if (!claim) {
    return null;
  }
  await setTenantContext(client, claim.user_id);
  return getDocument(client, claim.user_id, claim.document_id);
}

export async function replaceDocumentChunks(client, document, chunks) {
  await client.query(
    "DELETE FROM document_chunks WHERE document_id = $1 AND user_id = $2",
    [document.id, document.user_id],
  );
  const rows = [];
  for (const chunk of chunks) {
    const result = await client.query(
      `
        INSERT INTO document_chunks (
          id, document_id, user_id, chunk_index, page_number, chunk_text,
          token_count, qdrant_point_id, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
        RETURNING id, document_id, user_id, chunk_index, page_number, chunk_text,
                  token_count, qdrant_point_id, metadata, created_at, updated_at
      `,
      [
        crypto.randomUUID(),
        document.id,
        document.user_id,
        chunk.chunkIndex,
        chunk.pageNumber,
        chunk.chunkText,
        chunk.tokenCount,
        crypto.randomUUID(),
        JSON.stringify(chunk.chunkMetadata ?? {}),
      ],
    );
    rows.push(result.rows[0]);
  }
  return rows;
}

export async function markDocumentReady(
  client,
  documentId,
  { pageCount, chunkCount, metadata },
) {
  await client.query(
    `
      UPDATE documents
      SET status = 'READY',
          page_count = $2,
          chunk_count = $3,
          metadata = $4::jsonb,
          processing_completed_at = now(),
          processing_error = NULL,
          updated_at = now()
      WHERE id = $1
    `,
    [documentId, pageCount, chunkCount, JSON.stringify(metadata ?? {})],
  );
}

export async function markDocumentFailed(client, documentId, error) {
  await client.query(
    `
      UPDATE documents
      SET status = 'FAILED',
          processing_error = $2,
          processing_completed_at = now(),
          updated_at = now()
      WHERE id = $1
    `,
    [documentId, String(error).slice(0, 4000)],
  );
}

export async function releaseDocumentForRetry(client, documentId, error) {
  await client.query(
    `
      UPDATE documents
      SET status = 'PROCESSING',
          processing_started_at = NULL,
          processing_error = $2,
          updated_at = now()
      WHERE id = $1
    `,
    [documentId, String(error).slice(0, 4000)],
  );
}

export async function listDocumentChunks(client, userId, documentId, limit = 5000) {
  const result = await client.query(
    `
      SELECT id, document_id, user_id, chunk_index, page_number, chunk_text,
             token_count, qdrant_point_id, metadata, created_at, updated_at
      FROM document_chunks
      WHERE user_id = $1 AND document_id = $2 AND deleted_at IS NULL
      ORDER BY chunk_index
      LIMIT $3
    `,
    [userId, documentId, limit],
  );
  return result.rows;
}

export async function softDeleteDocument(client, documentId) {
  await client.query(
    "UPDATE documents SET deleted_at = now(), updated_at = now() WHERE id = $1",
    [documentId],
  );
}

export function publicDocument(document) {
  return {
    id: document.id,
    filename: document.filename,
    original_filename: document.original_filename,
    content_type: document.content_type,
    file_size: Number(document.file_size),
    status: document.status,
    processing_error: document.processing_error,
    page_count: document.page_count,
    chunk_count: document.chunk_count,
    document_metadata: document.document_metadata ?? {},
    created_at: new Date(document.created_at).toISOString(),
    updated_at: new Date(document.updated_at).toISOString(),
  };
}
