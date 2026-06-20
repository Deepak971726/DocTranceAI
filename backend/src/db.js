import crypto from "node:crypto";
import pg from "pg";
import { config } from "./config.js";
import { log, logProcessFailed } from "./logger.js";

const { Pool, types } = pg;

types.setTypeParser(20, (value) => Number(value));

function normalizeDatabaseUrl(value) {
  const normalized = value.replace(/^postgresql\+asyncpg:\/\//, "postgresql://");
  const parsed = new URL(normalized);
  parsed.searchParams.delete("sslmode");
  return parsed.toString();
}

export const pool = new Pool({
  connectionString: normalizeDatabaseUrl(config.databaseUrl),
  max: config.databasePoolSize + config.databaseMaxOverflow,
  ssl: config.databaseSslRequire ? { rejectUnauthorized: false } : false,
  allowExitOnIdle: config.appEnv === "test",
});

pool.on("error", (error) => {
  logProcessFailed("PostgreSQL pool", error);
});

export async function withTransaction(callback, { userId } = {}) {
  const client = await pool.connect();
  const transactionId = crypto.randomUUID();
  const started = performance.now();
  try {
    log("info", "database_transaction_started", {
      message: "Database transaction started.",
      transaction_id: transactionId,
      user_id: userId ?? null,
    });
    await client.query("BEGIN");
    if (userId) {
      await setTenantContext(client, userId);
    }
    const result = await callback(client);
    await client.query("COMMIT");
    log("info", "database_transaction_committed", {
      message: "Database transaction committed.",
      transaction_id: transactionId,
      user_id: userId ?? null,
      duration_ms: Math.round((performance.now() - started) * 100) / 100,
    });
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    logProcessFailed("Database transaction", error, {
      transaction_id: transactionId,
      user_id: userId ?? null,
      duration_ms: Math.round((performance.now() - started) * 100) / 100,
    });
    throw error;
  } finally {
    client.release();
    log("info", "database_connection_released", {
      message: "Database connection released.",
      transaction_id: transactionId,
      user_id: userId ?? null,
    });
  }
}

export async function setTenantContext(client, userId) {
  log("info", "database_tenant_context_set", {
    message: "Database tenant context set.",
    user_id: userId,
  });
  await client.query("SELECT set_config('app.current_user_id', $1, true)", [String(userId)]);
}

export async function closeDatabase() {
  await pool.end();
}

export function isUniqueViolation(error) {
  return error?.code === "23505";
}
