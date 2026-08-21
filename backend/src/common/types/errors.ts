// Error categories so the error handler middleware can format a consistent response shape.
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "IDEMPOTENCY_CONFLICT"
  | "STALE_EVENT"
  | "INVALID_TRANSITION"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  IDEMPOTENCY_CONFLICT: 409,
  STALE_EVENT: 409,
  INVALID_TRANSITION: 409,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
};

const RETRYABLE_BY_CODE: Record<ErrorCode, boolean> = {
  VALIDATION_ERROR: false,
  IDEMPOTENCY_CONFLICT: false,
  STALE_EVENT: false,
  INVALID_TRANSITION: false,
  NOT_FOUND: false,
  INTERNAL_ERROR: true,
};

export class AppError extends Error {
  code: ErrorCode;
  status: number;
  retryable: boolean;
  details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.retryable = RETRYABLE_BY_CODE[code];
    this.details = details;
  }
}
