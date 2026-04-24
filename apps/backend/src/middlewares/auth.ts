import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "@/lib/jwt.js";
import type { JwtPayload } from "@/lib/jwt.js";
import { HttpError } from "@/lib/http-error.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: JwtPayload;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("authorization");

  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    res.status(401).json({ code: "UNAUTHORIZED", message: "Missing bearer token" });

    return;
  }

  const token = header.slice(7).trim();

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ code: "UNAUTHORIZED", message: "Invalid or expired token" });
  }
}

export function getUserId(req: Request): string {
  if (!req.user?.sub) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing authenticated user");
  }

  return req.user.sub;
}
