import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(currentDirectory, "..");

function loadDotEnv(filename = path.join(backendRoot, ".env")) {
  if (!fs.existsSync(filename)) {
    return;
  }

  for (const rawLine of fs.readFileSync(filename, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator < 1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    if (process.env[key] !== undefined) {
      continue;
    }
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnv();

const booleanValue = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}, z.boolean());

const numberValue = (schema) =>
  z.preprocess((value) => {
    if (value === undefined || value === "") {
      return undefined;
    }
    return Number(value);
  }, schema);

const optionalString = z.preprocess(
  (value) => (value === undefined || value === "" ? undefined : value),
  z.string().optional(),
);

const envSchema = z
  .object({
    APP_NAME: z.string().default("DocTraceAI API"),
    APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
    APP_DEBUG: booleanValue.default(false),
    API_V1_PREFIX: z.string().default("/api/v1"),
    PORT: numberValue(z.number().int().min(1).max(65535)).default(8000),
    FRONTEND_URL: z.string().url().default("http://localhost:5173"),
    CORS_ORIGINS: z.string().default("http://localhost:5173,http://127.0.0.1:5173"),
    TRUSTED_HOSTS: z.string().default("localhost,127.0.0.1"),
    DATABASE_URL: z
      .string()
      .default("postgresql://postgres:postgres@localhost:5432/doctraceai"),
    DATABASE_POOL_SIZE: numberValue(z.number().int().min(1).max(100)).default(10),
    DATABASE_MAX_OVERFLOW: numberValue(z.number().int().min(0).max(100)).default(20),
    DATABASE_SSL_REQUIRE: booleanValue.default(true),
    JWT_SECRET_KEY: z.string().default("development-only-secret-change-me"),
    JWT_ALGORITHM: z.literal("HS256").default("HS256"),
    ACCESS_TOKEN_EXPIRE_MINUTES: numberValue(z.number().int().min(5).max(1440)).default(15),
    REFRESH_TOKEN_EXPIRE_DAYS: numberValue(z.number().int().min(1).max(365)).default(30),
    PASSWORD_RESET_EXPIRE_MINUTES: numberValue(z.number().int().min(5).max(1440)).default(30),
    SUPABASE_URL: z.string().url().default("https://example.supabase.co"),
    SUPABASE_SERVICE_ROLE_KEY: z.string().default("development-placeholder"),
    SUPABASE_STORAGE_BUCKET: z.string().default("documents"),
    QDRANT_URL: z.string().url().default("http://localhost:6333"),
    QDRANT_API_KEY: optionalString,
    QDRANT_COLLECTION: z.string().default("document_chunks"),
    EMBEDDING_MODEL: z.string().default("nomic-embed-text"),
    EMBEDDING_DIMENSIONS: numberValue(z.number().int().min(32).max(4096)).default(768),
    OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
    OLLAMA_CHAT_MODEL: z.string().default("llama3:latest"),
    OLLAMA_REQUEST_TIMEOUT_SECONDS: numberValue(z.number().min(30).max(1800)).default(1200),
    OLLAMA_KEEP_ALIVE: z.string().default("30m"),
    OLLAMA_CONTEXT_TOKENS: numberValue(z.number().int().min(1024).max(8192)).default(2048),
    MAX_UPLOAD_BYTES: numberValue(z.number().int().min(1024)).default(25 * 1024 * 1024),
    CHUNK_SIZE: numberValue(z.number().int().min(200).max(4000)).default(800),
    CHUNK_OVERLAP: numberValue(z.number().int().min(0).max(1000)).default(150),
    RAG_TOP_K: numberValue(z.number().int().min(1).max(30)).default(6),
    RAG_SCORE_THRESHOLD: numberValue(z.number().min(0).max(1)).default(0.35),
    WORKER_POLL_SECONDS: numberValue(z.number().int().min(1).max(300)).default(5),
    WORKER_STALE_MINUTES: numberValue(z.number().int().min(1).max(1440)).default(20),
    WORKER_MAX_RETRIES: numberValue(z.number().int().min(1).max(20)).default(3),
    SMTP_HOST: optionalString,
    SMTP_PORT: numberValue(z.number().int().min(1).max(65535)).default(587),
    SMTP_USERNAME: optionalString,
    SMTP_PASSWORD: optionalString,
    SMTP_FROM_EMAIL: z.string().email().default("noreply@example.com"),
    SMTP_USE_TLS: booleanValue.default(true),
    LOG_LEVEL: z.string().default("info"),
    LOG_JSON: booleanValue.default(false)
  })
  .superRefine((values, context) => {
    if (values.CHUNK_OVERLAP >= values.CHUNK_SIZE) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CHUNK_OVERLAP"],
        message: "CHUNK_OVERLAP must be smaller than CHUNK_SIZE",
      });
    }
    if (["staging", "production"].includes(values.APP_ENV)) {
      if (values.JWT_SECRET_KEY.length < 32) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["JWT_SECRET_KEY"],
          message: "JWT_SECRET_KEY must contain at least 32 characters",
        });
      }
      if (values.SUPABASE_SERVICE_ROLE_KEY.toLowerCase().includes("placeholder")) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["SUPABASE_SERVICE_ROLE_KEY"],
          message: "SUPABASE_SERVICE_ROLE_KEY must be configured",
        });
      }
    }
  });

const env = envSchema.parse(process.env);

const commaList = (value) => {
  if (value.trim().startsWith("[")) {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      throw new Error("List environment values must contain only strings.");
    }
    return parsed;
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

export const config = Object.freeze({
  appName: env.APP_NAME,
  appEnv: env.APP_ENV,
  debug: env.APP_DEBUG,
  apiV1Prefix: env.API_V1_PREFIX,
  port: env.PORT,
  frontendUrl: env.FRONTEND_URL,
  corsOrigins: commaList(env.CORS_ORIGINS),
  trustedHosts: commaList(env.TRUSTED_HOSTS),
  databaseUrl: env.DATABASE_URL,
  databasePoolSize: env.DATABASE_POOL_SIZE,
  databaseMaxOverflow: env.DATABASE_MAX_OVERFLOW,
  databaseSslRequire: env.DATABASE_SSL_REQUIRE,
  jwtSecretKey: env.JWT_SECRET_KEY,
  jwtAlgorithm: env.JWT_ALGORITHM,
  accessTokenExpireMinutes: env.ACCESS_TOKEN_EXPIRE_MINUTES,
  refreshTokenExpireDays: env.REFRESH_TOKEN_EXPIRE_DAYS,
  passwordResetExpireMinutes: env.PASSWORD_RESET_EXPIRE_MINUTES,
  supabaseUrl: env.SUPABASE_URL,
  supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseStorageBucket: env.SUPABASE_STORAGE_BUCKET,
  qdrantUrl: env.QDRANT_URL.replace(/\/$/, ""),
  qdrantApiKey: env.QDRANT_API_KEY,
  qdrantCollection: env.QDRANT_COLLECTION,
  embeddingModel: env.EMBEDDING_MODEL,
  embeddingDimensions: env.EMBEDDING_DIMENSIONS,
  ollamaBaseUrl: env.OLLAMA_BASE_URL.replace(/\/$/, ""),
  ollamaChatModel: env.OLLAMA_CHAT_MODEL,
  ollamaRequestTimeoutMs: env.OLLAMA_REQUEST_TIMEOUT_SECONDS * 1000,
  ollamaKeepAlive: env.OLLAMA_KEEP_ALIVE,
  ollamaContextTokens: env.OLLAMA_CONTEXT_TOKENS,
  maxUploadBytes: env.MAX_UPLOAD_BYTES,
  chunkSize: env.CHUNK_SIZE,
  chunkOverlap: env.CHUNK_OVERLAP,
  ragTopK: env.RAG_TOP_K,
  ragScoreThreshold: env.RAG_SCORE_THRESHOLD,
  workerPollMs: env.WORKER_POLL_SECONDS * 1000,
  workerStaleMinutes: env.WORKER_STALE_MINUTES,
  workerMaxRetries: env.WORKER_MAX_RETRIES,
  smtpHost: env.SMTP_HOST,
  smtpPort: env.SMTP_PORT,
  smtpUsername: env.SMTP_USERNAME,
  smtpPassword: env.SMTP_PASSWORD,
  smtpFromEmail: env.SMTP_FROM_EMAIL,
  smtpUseTls: env.SMTP_USE_TLS,
  logLevel: env.LOG_LEVEL.toLowerCase(),
  logJson: env.LOG_JSON,
  isProduction: env.APP_ENV === "production",
});

export { backendRoot };
