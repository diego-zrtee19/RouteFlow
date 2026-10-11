import { NextResponse } from "next/server";
import { AppError, isAppError, type ErrorCode } from "./errors";

/**
 * ONE error response shape for the whole API.
 *
 * The audit found five incompatible formats in use
 * (`{error}`, `{error, code}`, `{status, reason}`, Spanish strings, bare
 * strings), which meant a client could not branch on a failure.
 *
 * The envelope is now always:
 *
 *   { "error": { "code": "ORDER_NOT_FOUND", "message": "Order not found" } }
 *
 * Rules:
 *   - `code` is stable and machine-readable; clients branch on it
 *   - `message` is safe to display
 *   - stack traces and internal messages are logged server-side, never sent,
 *     except outside production where a `detail` field aids debugging
 */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    detail?: string;
  };
}

/** Builds the JSON body without a response object (for reuse in handlers). */
export function apiErrorBody(
  code: ErrorCode,
  message: string,
  detail?: string
): ApiErrorBody {
  const body: ApiErrorBody = { error: { code, message } };
  if (detail && process.env.NODE_ENV !== "production") {
    body.error.detail = detail;
  }
  return body;
}

/**
 * Returns a JSON error response.
 *
 * `cause` is logged but never serialised, so an exception carrying a database
 * URL or a Stripe id cannot reach the client.
 */
export function apiErrorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  cause?: unknown,
  detail?: string
): NextResponse<ApiErrorBody> {
  if (cause) {
    console.error(`[routeflow] ${code}: ${message}`, cause);
  }
  return NextResponse.json(apiErrorBody(code, message, detail), { status });
}

/**
 * Maps any thrown value to a response.
 *
 * An `AppError` carries its own deliberate status; anything else is treated as
 * an unexpected 500 so a bug never masquerades as a client error.
 */
export function toErrorResponse(cause: unknown): NextResponse<ApiErrorBody> {
  if (isAppError(cause)) {
    return apiErrorResponse(
      cause.code,
      cause.message,
      cause.status,
      cause,
      cause.detail
    );
  }

  return apiErrorResponse("INTERNAL_ERROR", "Unexpected server error", 500, cause);
}

/** Convenience wrapper for the very common 404. */
export function notFound(code: ErrorCode = "NOT_FOUND", message = "Not found") {
  return apiErrorResponse(code, message, 404);
}

export { AppError };