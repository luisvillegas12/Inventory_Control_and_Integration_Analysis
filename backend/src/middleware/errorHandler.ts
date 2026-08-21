import { NextFunction, Request, Response } from "express";
import { AppError } from "../common/types/errors";

// Shapes an error response, so the shape is guaranteed consistent no matter which layer failed
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) {
  const correlationId = req.correlationId ?? "unknown";

  if (err instanceof AppError) {
    req.log?.info({ code: err.code, status: err.status, msg: err.message });
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        retryable: err.retryable,
        details: err.details ?? null,
      },
      meta: { correlationId },
    });
  }

  // Unknown/unexpected error — never leak stack traces to the client.
  req.log?.error({ err }, "unhandled error");
  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again.",
      retryable: true,
      details: null,
    },
    meta: { correlationId },
  });
}
