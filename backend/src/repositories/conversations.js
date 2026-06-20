import crypto from "node:crypto";

export async function createConversation(client, userId, title, documentIds) {
  const conversationId = crypto.randomUUID();
  const result = await client.query(
    `
      INSERT INTO conversations (id, user_id, title)
      VALUES ($1, $2, $3)
      RETURNING *
    `,
    [conversationId, userId, title.slice(0, 255)],
  );
  await replaceConversationDocuments(client, userId, conversationId, documentIds);
  return result.rows[0];
}

export async function getConversation(client, userId, conversationId) {
  const result = await client.query(
    `
      SELECT *
      FROM conversations
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
    `,
    [conversationId, userId],
  );
  return result.rows[0] ?? null;
}

export async function replaceConversationDocuments(client, userId, conversationId, documentIds) {
  await client.query(
    "DELETE FROM conversation_documents WHERE user_id = $1 AND conversation_id = $2",
    [userId, conversationId],
  );
  for (const documentId of [...new Set(documentIds)]) {
    await client.query(
      `
        INSERT INTO conversation_documents (id, user_id, conversation_id, document_id)
        VALUES ($1, $2, $3, $4)
      `,
      [crypto.randomUUID(), userId, conversationId, documentId],
    );
  }
}

export async function listConversations(client, userId, { limit, offset }) {
  const [items, total] = await Promise.all([
    client.query(
      `
        SELECT id, title, created_at, updated_at
        FROM conversations
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT $2 OFFSET $3
      `,
      [userId, limit, offset],
    ),
    client.query(
      `
        SELECT count(*)::int AS total
        FROM conversations
        WHERE user_id = $1 AND deleted_at IS NULL
      `,
      [userId],
    ),
  ]);
  return { items: items.rows, total: total.rows[0].total };
}

export async function addMessage(
  client,
  { userId, conversationId, role, content, status = "COMPLETED" },
) {
  const result = await client.query(
    `
      INSERT INTO messages (id, user_id, conversation_id, role, status, content)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
    [crypto.randomUUID(), userId, conversationId, role, status, content],
  );
  await client.query(
    "UPDATE conversations SET updated_at = now() WHERE id = $1 AND user_id = $2",
    [conversationId, userId],
  );
  return result.rows[0];
}

export async function getMessage(client, userId, conversationId, messageId) {
  const result = await client.query(
    `
      SELECT *
      FROM messages
      WHERE id = $1 AND user_id = $2 AND conversation_id = $3 AND deleted_at IS NULL
    `,
    [messageId, userId, conversationId],
  );
  return result.rows[0] ?? null;
}

export async function listMessages(client, userId, conversationId, { limit, offset }) {
  const [items, total] = await Promise.all([
    client.query(
      `
        SELECT id, conversation_id, role, status, content, citations, model_name, created_at
        FROM messages
        WHERE user_id = $1 AND conversation_id = $2 AND deleted_at IS NULL
        ORDER BY created_at
        LIMIT $3 OFFSET $4
      `,
      [userId, conversationId, limit, offset],
    ),
    client.query(
      `
        SELECT count(*)::int AS total
        FROM messages
        WHERE user_id = $1 AND conversation_id = $2 AND deleted_at IS NULL
      `,
      [userId, conversationId],
    ),
  ]);
  return { items: items.rows, total: total.rows[0].total };
}

export async function completeMessage(
  client,
  messageId,
  { content, citations, modelName, latencyMs },
) {
  await client.query(
    `
      UPDATE messages
      SET content = $2,
          citations = $3::jsonb,
          model_name = $4,
          latency_ms = $5,
          status = 'COMPLETED',
          updated_at = now()
      WHERE id = $1
    `,
    [messageId, content, JSON.stringify(citations), modelName, latencyMs],
  );
}

export async function failMessage(client, messageId, error) {
  await client.query(
    `
      UPDATE messages
      SET status = 'FAILED', error_message = $2, updated_at = now()
      WHERE id = $1
    `,
    [messageId, String(error).slice(0, 4000)],
  );
}

export async function softDeleteConversation(client, userId, conversationId) {
  await client.query(
    `
      UPDATE conversations
      SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND user_id = $2
    `,
    [conversationId, userId],
  );
  await client.query(
    `
      UPDATE messages
      SET deleted_at = now(), updated_at = now()
      WHERE conversation_id = $1 AND user_id = $2
    `,
    [conversationId, userId],
  );
}

export function publicConversation(conversation) {
  return {
    id: conversation.id,
    title: conversation.title,
    created_at: new Date(conversation.created_at).toISOString(),
    updated_at: new Date(conversation.updated_at).toISOString(),
  };
}

export function publicMessage(message) {
  return {
    id: message.id,
    conversation_id: message.conversation_id,
    role: message.role,
    status: message.status,
    content: message.content,
    citations: message.citations ?? [],
    model_name: message.model_name,
    created_at: new Date(message.created_at).toISOString(),
  };
}
