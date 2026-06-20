import { AsyncLocalStorage } from "node:async_hooks";
import { inspect } from "node:util";

const context = new AsyncLocalStorage();

const REDACTED = "[redacted]";
const MAX_STRING_LENGTH = 1800;
const MAX_ARRAY_ITEMS = 25;
const MAX_OBJECT_KEYS = 60;
const MAX_DEPTH = 5;

const SENSITIVE_KEY_PATTERNS = [
  /authorization/i,
  /cookie/i,
  /password/i,
  /passwd/i,
  /secret/i,
  /(^|[._-])token($|\.)/i,
  /access_token/i,
  /refresh_token/i,
  /reset_token/i,
  /auth_token/i,
  /id_token/i,
  /accesstoken/i,
  /refreshtoken/i,
  /rawtoken/i,
  /tokenhash/i,
  /token_hash/i,
  /api[-_]?key/i,
  /(^|[._-])key($|\.)/i,
  /key_hash/i,
  /service_role/i,
  /jwt/i,
  /smtp_password/i,
];

function isSensitiveKey(keyPath) {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(keyPath));
}

function truncateString(value) {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_STRING_LENGTH)}... <truncated ${value.length - MAX_STRING_LENGTH} chars>`;
}

function sanitizePrimitive(value, keyPath) {
  if (isSensitiveKey(keyPath)) {
    return REDACTED;
  }
  if (typeof value === "string") {
    return truncateString(value);
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (Buffer.isBuffer(value)) {
    return `<Buffer ${value.byteLength} bytes>`;
  }
  if (value instanceof ArrayBuffer) {
    return `<ArrayBuffer ${value.byteLength} bytes>`;
  }
  if (ArrayBuffer.isView(value)) {
    return `<${value.constructor.name} ${value.byteLength} bytes>`;
  }
  return value;
}

export function sanitizeForLog(value, keyPath = "", depth = 0, seen = new WeakSet()) {
  if (value === null || value === undefined || typeof value !== "object") {
    return sanitizePrimitive(value, keyPath);
  }
  const primitive = sanitizePrimitive(value, keyPath);
  if (primitive !== value) {
    return primitive;
  }
  if (depth >= MAX_DEPTH) {
    return `<${value.constructor?.name ?? "Object"} max depth reached>`;
  }
  if (seen.has(value)) {
    return "<circular>";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item, index) => sanitizeForLog(item, `${keyPath}[${index}]`, depth + 1, seen));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`<truncated ${value.length - MAX_ARRAY_ITEMS} items>`);
    }
    return items;
  }

  const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS);
  const sanitized = {};
  for (const [key, item] of entries) {
    const childPath = keyPath ? `${keyPath}.${key}` : key;
    sanitized[key] = sanitizeForLog(item, childPath, depth + 1, seen);
  }
  const totalKeys = Object.keys(value).length;
  if (totalKeys > MAX_OBJECT_KEYS) {
    sanitized.__truncated_keys = totalKeys - MAX_OBJECT_KEYS;
  }
  return sanitized;
}

function timestamp() {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
}

function formatScalar(value) {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  if (typeof value === "string") {
    return value.includes("\n") ? inspect(value, { colors: false }) : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return inspect(value, { colors: false, depth: 1, breakLength: 120 });
}

function formatFields(value, indent = 2) {
  const padding = " ".repeat(indent);
  if (value === null || value === undefined || typeof value !== "object") {
    return [`${padding}${formatScalar(value)}`];
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [`${padding}(empty list)`];
    }
    return value.flatMap((item) => {
      if (item === null || item === undefined || typeof item !== "object") {
        return [`${padding}- ${formatScalar(item)}`];
      }
      return [`${padding}-`, ...formatFields(item, indent + 4)];
    });
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    return [`${padding}(empty)`];
  }
  return entries.flatMap(([key, item]) => {
    if (item === null || item === undefined || typeof item !== "object") {
      return [`${padding}${key}: ${formatScalar(item)}`];
    }
    return [`${padding}${key}:`, ...formatFields(item, indent + 2)];
  });
}

export const logger = {
  info: (values, event) => log("info", event, values),
  warn: (values, event) => log("warn", event, values),
  error: (values, event) => log("error", event, values),
  debug: (values, event) => log("debug", event, values),
};

export function runWithContext(values, callback) {
  return context.run(values, callback);
}

export function setContext(values) {
  Object.assign(context.getStore() ?? {}, values);
}

export function log(level, event, values = {}) {
  const merged = sanitizeForLog({
    event,
    ...(context.getStore() ?? {}),
    ...values,
  });
  const message = merged.message ?? event;
  const fields = { ...merged };
  delete fields.message;
  const lines = [
    `[${timestamp()}] ${level.toUpperCase()} ${message}`,
    ...formatFields(fields),
  ];
  const output = lines.join("\n");
  if (level === "error") {
    console.error(output);
  } else if (level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logProcessStarted = (processName, values = {}) =>
  log("info", "process_started", {
    process: processName,
    status: "started",
    message: `${processName} process started.`,
    ...values,
  });

export const logProcessFinished = (processName, values = {}) =>
  log("info", "process_finished_successfully", {
    process: processName,
    status: "success",
    message: `${processName} process finished successfully.`,
    ...values,
  });

export const logProcessFailed = (processName, error, values = {}) =>
  log("error", "process_failed", {
    process: processName,
    status: "failed",
    message: `${processName} process failed.`,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...values,
  });
