import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import multer from "multer";
import { config } from "./config.js";
import { AppError, AuthenticationError, NotFoundError, ValidationError } from "./errors.js";
import { log, logProcessFailed } from "./logger.js";
import { requestContext } from "./middleware/request.js";
import accountRoutes from "./routes/account.js";
import authRoutes from "./routes/auth.js";
import chatRoutes from "./routes/chat.js";
import documentRoutes from "./routes/documents.js";
import healthRoutes from "./routes/health.js";

function isDevelopmentHost(hostname) {
  if (config.isProduction) {
    return false;
  }
  return (
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  );
}

function isAllowedCorsOrigin(origin) {
  if (!origin || config.corsOrigins.includes("*") || config.corsOrigins.includes(origin)) {
    return true;
  }
  try {
    return isDevelopmentHost(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(requestContext);
  app.use((req, _res, next) => {
    const hostname = req.hostname;
    if (
      !config.trustedHosts.includes("*") &&
      !config.trustedHosts.includes(hostname) &&
      !isDevelopmentHost(hostname)
    ) {
      next(new AppError("Invalid host header.", { statusCode: 400, code: "invalid_host" }));
      return;
    }
    next();
  });
  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedCorsOrigin(origin)) {
          callback(null, true);
          return;
        }
        log("warn", "cors_origin_denied", {
          message: "CORS origin denied.",
          origin,
          allowed_origins: config.corsOrigins,
        });
        callback(new AppError("Origin is not allowed.", { statusCode: 403, code: "cors_denied" }));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type", "X-Request-ID", "X-API-Key"],
      exposedHeaders: ["X-Request-ID"],
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      hsts: config.isProduction
        ? { maxAge: 31536000, includeSubDomains: true }
        : false,
      referrerPolicy: { policy: "no-referrer" },
    }),
  );
  app.use((_req, res, next) => {
    res.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });
  app.use(
    compression({
      threshold: 1000,
      filter(_req, res) {
        if (String(res.getHeader("Content-Type") ?? "").startsWith("text/event-stream")) {
          return false;
        }
        return compression.filter(_req, res);
      },
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  const api = express.Router();
  api.use(healthRoutes);
  api.use("/auth", authRoutes);
  api.use("/documents", documentRoutes);
  api.use(chatRoutes);
  api.use(accountRoutes);
  app.use(config.apiV1Prefix, api);

  app.use((_req, _res, next) => {
    next(new NotFoundError("Route not found."));
  });

  app.use((error, req, res, _next) => {
    let normalized = error;
    if (error instanceof multer.MulterError) {
      normalized = new ValidationError(
        error.code === "LIMIT_FILE_SIZE"
          ? `File exceeds the ${config.maxUploadBytes} byte upload limit.`
          : error.message,
      );
    } else if (error instanceof SyntaxError && "body" in error) {
      normalized = new ValidationError("The request payload is invalid.");
    } else if (error?.code?.startsWith?.("23") || error?.code?.startsWith?.("08")) {
      normalized = new AppError("The database is temporarily unavailable.", {
        statusCode: 503,
        code: "database_error",
        cause: error,
      });
    } else if (!(error instanceof AppError)) {
      normalized = new AppError(undefined, { cause: error });
    }

    log(normalized.statusCode >= 500 ? "error" : "warn", "http_error_response", {
      message: `HTTP error response: ${normalized.statusCode} ${normalized.code}`,
      method: req.method,
      path: req.path,
      request_id: req.requestId,
      status_code: normalized.statusCode,
      code: normalized.code,
      error_message: normalized.message,
      details: normalized.details,
    });

    if (normalized.statusCode >= 500) {
      logProcessFailed("HTTP request", error, {
        method: req.method,
        path: req.path,
        request_id: req.requestId,
      });
    }
    if (normalized instanceof AuthenticationError) {
      res.set("WWW-Authenticate", "Bearer");
    }
    res.status(normalized.statusCode).json({
      error: {
        code: normalized.code,
        message: normalized.message,
        details: normalized.details,
        request_id: req.requestId ?? null,
      },
    });
  });

  return app;
}

export const app = createApp();
