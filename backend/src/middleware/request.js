import crypto from "node:crypto";
import { Counter, Histogram } from "prom-client";
import { log, runWithContext, sanitizeForLog } from "../logger.js";

export const requestCount = new Counter({
  name: "doctraceai_http_requests_total",
  help: "HTTP requests",
  labelNames: ["method", "path", "status"],
});

export const requestDuration = new Histogram({
  name: "doctraceai_http_request_duration_seconds",
  help: "HTTP request duration",
  labelNames: ["method", "path"],
});

export function requestContext(req, res, next) {
  const requestId = req.get("X-Request-ID") || crypto.randomUUID();
  req.requestId = requestId;
  res.set("X-Request-ID", requestId);
  const started = performance.now();
  let responseBody;
  let responseBodyCaptured = false;
  let responseBytes = 0;

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    responseBody = body;
    responseBodyCaptured = true;
    return originalJson(body);
  };

  const originalSend = res.send.bind(res);
  res.send = (body) => {
    if (!responseBodyCaptured) {
      responseBody = body;
      responseBodyCaptured = true;
    }
    return originalSend(body);
  };

  const originalWrite = res.write.bind(res);
  res.write = (chunk, encoding, callback) => {
    responseBytes += byteLength(chunk);
    return originalWrite(chunk, encoding, callback);
  };

  const originalEnd = res.end.bind(res);
  res.end = (chunk, encoding, callback) => {
    responseBytes += byteLength(chunk);
    return originalEnd(chunk, encoding, callback);
  };

  runWithContext({ request_id: requestId }, () => {
    log("info", "request_started", {
      message: `Request started: ${req.method} ${req.originalUrl ?? req.url}`,
      method: req.method,
      url: req.originalUrl ?? req.url,
      ip: req.ip,
      user_agent: req.get("user-agent") ?? null,
      content_type: req.get("content-type") ?? null,
      content_length: req.get("content-length") ?? null,
      headers: req.headers,
    });

    res.on("finish", () => {
      const routePath = req.route?.path
        ? `${req.baseUrl || ""}${req.route.path}`
        : req.path;
      const durationMs = Math.round((performance.now() - started) * 100) / 100;
      requestCount.labels(req.method, routePath, String(res.statusCode)).inc();
      requestDuration
        .labels(req.method, routePath)
        .observe(durationMs / 1000);
      log("info", "request_finished", {
        message: `API request resolved: ${req.method} ${req.originalUrl ?? req.url} -> ${res.statusCode}; took ${durationMs}ms`,
        method: req.method,
        url: req.originalUrl ?? req.url,
        route: routePath,
        status_code: res.statusCode,
        duration_ms: durationMs,
        api_resolve_time_ms: durationMs,
        api_resolve_time_seconds: Math.round((durationMs / 1000) * 1000) / 1000,
        user_id: req.user?.id ?? null,
        params: req.params,
        query: req.query,
        request_body: bodyForLog(req.body),
        uploaded_file: fileForLog(req.file),
        response_headers: res.getHeaders(),
        response_bytes: responseBytes,
        response_body: responseForLog(responseBody, responseBodyCaptured, res, responseBytes),
      });
    });
    next();
  });
}

function byteLength(chunk) {
  if (!chunk) {
    return 0;
  }
  if (Buffer.isBuffer(chunk)) {
    return chunk.byteLength;
  }
  if (typeof chunk === "string") {
    return Buffer.byteLength(chunk);
  }
  if (chunk instanceof Uint8Array) {
    return chunk.byteLength;
  }
  return 0;
}

function bodyForLog(body) {
  if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
    return "(empty)";
  }
  return sanitizeForLog(body);
}

function fileForLog(file) {
  if (!file) {
    return "(none)";
  }
  return sanitizeForLog({
    fieldname: file.fieldname,
    originalname: file.originalname,
    encoding: file.encoding,
    mimetype: file.mimetype,
    size: file.size,
    buffer: file.buffer,
  });
}

function responseForLog(body, captured, res, responseBytes) {
  const contentType = String(res.getHeader("content-type") ?? "");
  if (contentType.startsWith("text/event-stream")) {
    return `<SSE stream, ${responseBytes} bytes written>`;
  }
  if (!captured) {
    return responseBytes > 0
      ? `<raw response body was streamed, ${responseBytes} bytes written>`
      : "(empty)";
  }
  if (Buffer.isBuffer(body)) {
    return `<Buffer ${body.byteLength} bytes>`;
  }
  if (typeof body === "string") {
    return body;
  }
  return sanitizeForLog(body);
}
