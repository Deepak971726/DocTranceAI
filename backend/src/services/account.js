import { ConflictError, NotFoundError } from "../errors.js";
import {
  createApiKeyRecord,
  getApiKey,
  getSubscription,
  listApiKeys,
  listUsage,
  publicApiKey,
  publicSubscription,
  recordAudit,
  revokeApiKeyRecord,
} from "../repositories/account.js";
import { createApiKey } from "../security.js";
import { withTransaction } from "../db.js";
import { logProcessFinished, logProcessStarted } from "../logger.js";

export class AccountService {
  async recentUsage(userId) {
    logProcessStarted("Load usage", { user_id: userId });
    const usage = await withTransaction((client) => listUsage(client, userId), { userId });
    logProcessFinished("Load usage", { user_id: userId, rows: usage.length });
    return usage;
  }

  async subscription(userId) {
    logProcessStarted("Load subscription", { user_id: userId });
    return withTransaction(
      async (client) => {
        const subscription = await getSubscription(client, userId);
        if (!subscription) {
          throw new NotFoundError("Subscription not found.");
        }
        const result = publicSubscription(subscription);
        logProcessFinished("Load subscription", {
          user_id: userId,
          plan_name: result.plan_name,
          status: result.status,
        });
        return result;
      },
      { userId },
    );
  }

  async createApiKey({ userId, name, scopes, expiresAt, requestId }) {
    logProcessStarted("Create API key", {
      user_id: userId,
      name,
      scopes,
      expires_at: expiresAt ?? null,
    });
    const parsedExpiry = expiresAt ? new Date(expiresAt) : null;
    if (parsedExpiry && parsedExpiry <= new Date()) {
      throw new ConflictError("API key expiration must be in the future.");
    }
    const { plaintext, prefix, digest } = createApiKey();
    const created = await withTransaction(
      async (client) => {
        const record = await createApiKeyRecord(client, {
          userId,
          name,
          keyPrefix: prefix,
          keyHash: digest,
          scopes: [...new Set(scopes)],
          expiresAt: parsedExpiry,
        });
        await recordAudit(client, {
          userId,
          action: "api_key.created",
          resourceType: "api_key",
          resourceId: record.id,
          requestId,
          metadata: { prefix, scopes },
        });
        return { ...publicApiKey(record), key: plaintext };
      },
      { userId },
    );
    logProcessFinished("Create API key", { user_id: userId, name, scopes });
    return created;
  }

  async listApiKeys(userId) {
    logProcessStarted("List API keys", { user_id: userId });
    const keys = await withTransaction(
      async (client) => (await listApiKeys(client, userId)).map(publicApiKey),
      { userId },
    );
    logProcessFinished("List API keys", { user_id: userId, keys: keys.length });
    return keys;
  }

  async revokeApiKey({ userId, keyId, requestId }) {
    logProcessStarted("Revoke API key", { user_id: userId, key_id: keyId });
    await withTransaction(
      async (client) => {
        const record = await getApiKey(client, userId, keyId);
        if (!record) {
          throw new NotFoundError("API key not found.");
        }
        await revokeApiKeyRecord(client, keyId);
        await recordAudit(client, {
          userId,
          action: "api_key.revoked",
          resourceType: "api_key",
          resourceId: keyId,
          requestId,
        });
      },
      { userId },
    );
    logProcessFinished("Revoke API key", { user_id: userId, key_id: keyId });
  }
}

export const accountService = new AccountService();
