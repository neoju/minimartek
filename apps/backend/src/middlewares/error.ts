import type { Request, Response, NextFunction } from "express";
import { HttpError } from "@/lib/http-error.js";

export { HttpError } from "@/lib/http-error.js";

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ code: "NOT_FOUND", message: "Route not found" });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ code: err.code, message: err.message });

    return;
  }

  if (process.env.NODE_ENV !== "test") {
    console.error("[backend] unhandled error", err);
  }

  res.status(500).json({ code: "INTERNAL_ERROR", message: "Internal server error" });
}
