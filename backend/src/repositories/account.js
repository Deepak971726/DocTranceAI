import crypto from "node:crypto";

export async function incrementUsage(client, userId, values = {}) {
  const counters = {
    documentsUploaded: values.documentsUploaded ?? 0,
    questionsAsked: values.questionsAsked ?? 0,
    storageBytes: values.storageBytes ?? 0,
    aiRequests: values.aiRequests ?? 0,
    embeddingTokens: values.embeddingTokens ?? 0,
    promptTokens: values.promptTokens ?? 0,
    completionTokens: values.completionTokens ?? 0,
  };
  await client.query(
    `
      INSERT INTO usage_tracking (
        id, user_id, usage_date, documents_uploaded, questions_asked, storage_bytes,
        ai_requests, embedding_tokens, prompt_tokens, completion_tokens
      )
      VALUES ($1, $2, current_date, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT ON CONSTRAINT uq_usage_user_date
      DO UPDATE SET
        documents_uploaded = usage_tracking.documents_uploaded + EXCLUDED.documents_uploaded,
        questions_asked = usage_tracking.questions_asked + EXCLUDED.questions_asked,
        storage_bytes = greatest(0, usage_tracking.storage_bytes + EXCLUDED.storage_bytes),
        ai_requests = usage_tracking.ai_requests + EXCLUDED.ai_requests,
        embedding_tokens = usage_tracking.embedding_tokens + EXCLUDED.embedding_tokens,
        prompt_tokens = usage_tracking.prompt_tokens + EXCLUDED.prompt_tokens,
        completion_tokens = usage_tracking.completion_tokens + EXCLUDED.completion_tokens,
        updated_at = now()
    `,
    [
      crypto.randomUUID(),
      userId,
      counters.documentsUploaded,
      counters.questionsAsked,
      counters.storageBytes,
      counters.aiRequests,
      counters.embeddingTokens,
      counters.promptTokens,
      counters.completionTokens,
    ],
  );
}

export async function listUsage(client, userId, limit = 31) {
  const result = await client.query(
    `
      SELECT usage_date, documents_uploaded, questions_asked, storage_bytes, ai_requests,
             embedding_tokens, prompt_tokens, completion_tokens
      FROM usage_tracking
      WHERE user_id = $1
      ORDER BY usage_date DESC
      LIMIT $2
    `,
    [userId, limit],
  );
  return result.rows.map((row) => ({
    ...row,
    usage_date: new Date(row.usage_date).toISOString().slice(0, 10),
    storage_bytes: Number(row.storage_bytes),
    embedding_tokens: Number(row.embedding_tokens),
    prompt_tokens: Number(row.prompt_tokens),
    completion_tokens: Number(row.completion_tokens),
  }));
}

export async function getSubscription(client, userId, { forUpdate = false } = {}) {
  const result = await client.query(
    `
      SELECT *
      FROM subscriptions
      WHERE user_id = $1 AND deleted_at IS NULL
      ${forUpdate ? "FOR UPDATE" : ""}
    `,
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function createApiKeyRecord(
  client,
  { userId, name, keyPrefix, keyHash, scopes, expiresAt },
) {
  const result = await client.query(
    `
      INSERT INTO api_keys (id, user_id, name, key_prefix, key_hash, scopes, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      RETURNING *
    `,
    [
      crypto.randomUUID(),
      userId,
      name,
      keyPrefix,
      keyHash,
      JSON.stringify(scopes),
      expiresAt,
    ],
  );
  return result.rows[0];
}

export async function listApiKeys(client, userId) {
  const result = await client.query(
    `
      SELECT *
      FROM api_keys
      WHERE user_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
    `,
    [userId],
  );
  return result.rows;
}

export async function getApiKey(client, userId, keyId) {
  const result = await client.query(
    `
      SELECT *
      FROM api_keys
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
    `,
    [keyId, userId],
  );
  return result.rows[0] ?? null;
}

export async function revokeApiKeyRecord(client, keyId) {
  await client.query(
    "UPDATE api_keys SET revoked_at = now(), updated_at = now() WHERE id = $1",
    [keyId],
  );
}

export async function recordAudit(
  client,
  {
    userId = null,
    action,
    resourceType = null,
    resourceId = null,
    ipAddress = null,
    userAgent = null,
    requestId = null,
    metadata = {},
  },
) {
  await client.query(
    `
      INSERT INTO audit_logs (
        id, user_id, action, resource_type, resource_id, ip_address,
        user_agent, request_id, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
    `,
    [
      crypto.randomUUID(),
      userId,
      action,
      resourceType,
      resourceId,
      ipAddress,
      userAgent,
      requestId,
      JSON.stringify(metadata),
    ],
  );
}

export function publicSubscription(subscription) {
  return {
    plan_name: subscription.plan_name,
    status: subscription.status,
    usage_limits: subscription.usage_limits ?? {},
    current_period_end: subscription.current_period_end
      ? new Date(subscription.current_period_end).toISOString()
      : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
  };
}

export function publicApiKey(apiKey) {
  return {
    id: apiKey.id,
    name: apiKey.name,
    key_prefix: apiKey.key_prefix,
    scopes: apiKey.scopes ?? [],
    last_used_at: apiKey.last_used_at ? new Date(apiKey.last_used_at).toISOString() : null,
    expires_at: apiKey.expires_at ? new Date(apiKey.expires_at).toISOString() : null,
    revoked_at: apiKey.revoked_at ? new Date(apiKey.revoked_at).toISOString() : null,
    created_at: new Date(apiKey.created_at).toISOString(),
  };
}
