import { NextFunction, Request, Response } from "express";
import { randomUUID } from "crypto";
import { logger } from "../utils/logger";

// Middleware to log incoming requests and their responses, with a unique correlation ID for tracing

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      correlationId: string;
      log: typeof logger;
    }
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const correlationId = randomUUID();
  const start = Date.now();

  req.correlationId = correlationId;
  req.log = logger.child({ correlationId });

  res.on("finish", () => {
    req.log.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: Date.now() - start,
    });
  });

  next();
}
