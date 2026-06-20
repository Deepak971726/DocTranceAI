import { ValidationError } from "../errors.js";
import { log } from "../logger.js";

function validationDetails(error) {
  return {
    errors: error.issues.map((issue) => ({
      loc: issue.path,
      msg: issue.message,
      type: issue.code,
    })),
  };
}

export function validateBody(schema) {
  return (req, _res, next) => {
    log("info", "request_body_validation_started", {
      message: "Request body validation started.",
      path: req.originalUrl ?? req.url,
      body: req.body,
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      log("warn", "request_body_validation_failed", {
        message: "Request body validation failed.",
        path: req.originalUrl ?? req.url,
        details: validationDetails(result.error),
      });
      next(
        new ValidationError("The request payload is invalid.", {
          code: "request_validation_error",
          details: validationDetails(result.error),
        }),
      );
      return;
    }
    req.validatedBody = result.data;
    log("info", "request_body_validation_finished", {
      message: "Request body validation finished.",
      path: req.originalUrl ?? req.url,
      validated_body: result.data,
    });
    next();
  };
}

export function integerQuery(value, { defaultValue, min, max, name }) {
  const parsed = value === undefined ? defaultValue : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    log("warn", "query_integer_validation_failed", {
      message: "Query integer validation failed.",
      name,
      value,
      min,
      max,
    });
    throw new ValidationError(`Query parameter "${name}" must be an integer from ${min} to ${max}.`);
  }
  log("info", "query_integer_validation_finished", {
    message: "Query integer validation finished.",
    name,
    value: parsed,
  });
  return parsed;
}

export function requireUuid(value, name = "id") {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    log("warn", "uuid_validation_failed", {
      message: "UUID validation failed.",
      name,
      value,
    });
    throw new ValidationError(`Path parameter "${name}" must be a valid UUID.`);
  }
  log("info", "uuid_validation_finished", {
    message: "UUID validation finished.",
    name,
    value,
  });
  return value;
}
