export class AppError extends Error {
  constructor(message = "An unexpected error occurred.", options = {}) {
    super(message, options);
    this.name = this.constructor.name;
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? "internal_error";
    this.details = options.details ?? {};
  }
}

function defineError(name, statusCode, code, defaultMessage) {
  return class extends AppError {
    constructor(message = defaultMessage, options = {}) {
      super(message, {
        ...options,
        statusCode: options.statusCode ?? statusCode,
        code: options.code ?? code,
      });
      this.name = name;
    }
  };
}

export const ValidationError = defineError(
  "ValidationError",
  422,
  "validation_error",
  "The supplied data is invalid.",
);
export const AuthenticationError = defineError(
  "AuthenticationError",
  401,
  "authentication_error",
  "Authentication is required.",
);
export const AuthorizationError = defineError(
  "AuthorizationError",
  403,
  "authorization_error",
  "You do not have permission to perform this operation.",
);
export const NotFoundError = defineError(
  "NotFoundError",
  404,
  "not_found",
  "The requested resource was not found.",
);
export const ConflictError = defineError(
  "ConflictError",
  409,
  "conflict",
  "The request conflicts with the current resource state.",
);
export const StorageError = defineError(
  "StorageError",
  502,
  "storage_error",
  "Document storage is temporarily unavailable.",
);
export const VectorDatabaseError = defineError(
  "VectorDatabaseError",
  502,
  "vector_database_error",
  "Vector search is temporarily unavailable.",
);
export const AIServiceError = defineError(
  "AIServiceError",
  502,
  "ai_service_error",
  "The AI service is temporarily unavailable.",
);
