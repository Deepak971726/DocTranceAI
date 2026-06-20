import crypto from "node:crypto";

export async function getAuthIdentity(client, email) {
  const result = await client.query("SELECT * FROM private.get_user_for_auth($1)", [
    email.toLowerCase(),
  ]);
  return result.rows[0] ?? null;
}

export async function getUserById(client, userId) {
  const result = await client.query(
    `
      SELECT id, email, password_hash, full_name, is_active, is_verified,
             email_verified_at, last_login_at, token_version, created_at, updated_at
      FROM users
      WHERE id = $1 AND deleted_at IS NULL
    `,
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function createUser(client, { id, email, passwordHash, fullName }) {
  const result = await client.query(
    `
      INSERT INTO users (
        id, email, password_hash, full_name, is_active, is_verified, email_verified_at
      )
      VALUES ($1, lower($2), $3, $4, true, true, now())
      RETURNING *
    `,
    [id, email, passwordHash, fullName?.trim() || null],
  );
  await client.query(
    `
      INSERT INTO subscriptions (id, user_id, plan_name, status, usage_limits)
      VALUES ($1, $2, 'FREE', 'ACTIVE', $3::jsonb)
    `,
    [
      crypto.randomUUID(),
      id,
      JSON.stringify({ storage_bytes: 104857600, questions_per_month: 100 }),
    ],
  );
  return result.rows[0];
}

export async function markLogin(client, userId) {
  await client.query(
    "UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = $1",
    [userId],
  );
}

export async function updatePassword(client, userId, passwordHash) {
  await client.query(
    `
      UPDATE users
      SET password_hash = $2, token_version = token_version + 1, updated_at = now()
      WHERE id = $1
    `,
    [userId, passwordHash],
  );
}

export async function createAuthToken(
  client,
  { userId, tokenHash, tokenType, expiresAt, userAgent = null, ipAddress = null },
) {
  const result = await client.query(
    `
      INSERT INTO auth_tokens (
        id, user_id, token_hash, token_type, expires_at, user_agent, ip_address
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
    [crypto.randomUUID(), userId, tokenHash, tokenType, expiresAt, userAgent, ipAddress],
  );
  return result.rows[0];
}

export async function getValidAuthToken(client, tokenHash, tokenType) {
  const result = await client.query(
    `
      SELECT *
      FROM auth_tokens
      WHERE token_hash = $1
        AND token_type = $2
        AND expires_at > now()
        AND used_at IS NULL
        AND revoked_at IS NULL
      FOR UPDATE
    `,
    [tokenHash, tokenType],
  );
  return result.rows[0] ?? null;
}

export async function consumeAuthToken(client, tokenId) {
  await client.query(
    "UPDATE auth_tokens SET used_at = now(), updated_at = now() WHERE id = $1",
    [tokenId],
  );
}

export async function revokeAuthTokenByHash(client, tokenHash) {
  const result = await client.query(
    `
      UPDATE auth_tokens
      SET revoked_at = now(), updated_at = now()
      WHERE token_hash = $1 AND revoked_at IS NULL
    `,
    [tokenHash],
  );
  return result.rowCount > 0;
}

export async function revokeAllAuthTokens(client, userId) {
  await client.query(
    `
      UPDATE auth_tokens
      SET revoked_at = now(), updated_at = now()
      WHERE user_id = $1 AND revoked_at IS NULL
    `,
    [userId],
  );
}

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    is_active: user.is_active,
    is_verified: user.is_verified,
    created_at: new Date(user.created_at).toISOString(),
  };
}
