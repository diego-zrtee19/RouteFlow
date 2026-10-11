/**
 * SHARED ERROR TYPES.
 *
 * The audit found five different error response shapes across the API
 * (`{error}`, `{error, code}`, `{status, reason}`, Spanish messages, bare
 * strings), and `console.error` as the only diagnostic. This module gives
 * failures a single identity so route handlers stop inventing their own.
 */

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "FORBIDDEN_ADMIN"
  | "SELLER_NOT_FOUND"
  | "NOT_RESOURCE_OWNER"
  | "ORDER_NOT_FOUND"
  | "INVALID_ORDER_TRANSITION"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "NOT_CONFIGURED";

/** An error carrying an HTTP status and a stable machine-readable code. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Safe to surface to the client. Never put secrets or stack traces here. */
  readonly detail?: string;

  constructor(code: ErrorCode, message: string, status: number, detail?: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

/** 400 — the request itself was malformed. */
export class ValidationError extends AppError {
  constructor(message: string, detail?: string) {
    super("VALIDATION_ERROR", message, 400, detail);
    this.name = "ValidationError";
  }
}

/** 401 — no usable session. */
export class UnauthenticatedError extends AppError {
  constructor(message = "Authentication required") {
    super("UNAUTHENTICATED", message, 401);
    this.name = "UnauthenticatedError";
  }
}

/** 403 — authenticated but not permitted. */
export class ForbiddenError extends AppError {
  constructor(code: ErrorCode = "FORBIDDEN", message = "Not permitted") {
    super(code, message, 403);
    this.name = "ForbiddenError";
  }
}

/** 404 — the resource does not exist, or the caller may not know that it does. */
export class NotFoundError extends AppError {
  constructor(code: ErrorCode = "NOT_FOUND", message = "Not found") {
    super(code, message, 404);
    this.name = "NotFoundError";
  }
}

/** 503 — a required integration is not configured. Never silently degraded. */
export class NotConfiguredError extends AppError {
  constructor(message: string, detail?: string) {
    super("NOT_CONFIGURED", message, 503, detail);
    this.name = "NotConfiguredError";
  }
}

/**
 * Database failure.
 *
 * Named `DatabaseError`, not `Prisma`: this project uses Supabase/PostgREST,
 * and a misnamed class sends the next developer hunting for the wrong ORM.
 * The previous code threw bare `Error("Faltan ...")` strings, which forced
 * every route to re-derive a status code by hand.
 */
export class DatabaseError extends AppError {
  constructor(message: string) {
    super("INTERNAL_ERROR", message, 500);
    this.name = "DatabaseError";
  }
}

/** True for the errors that carry a deliberate HTTP status. */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}