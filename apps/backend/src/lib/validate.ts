import type { Request, Response, NextFunction } from "express";

export type WithValidatedQuery<T> = Request & { validatedQuery: T };
import type { ZodTypeAny, z } from "zod";

export function validateBody<T extends ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Invalid request body",
        details: result.error.flatten(),
      });

      return;
    }

    req.body = result.data as z.infer<T>;
    next();
  };
}

export function validateQuery<T extends ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Invalid query",
        details: result.error.flatten(),
      });

      return;
    }

    (req as Request & { validatedQuery: z.infer<T> }).validatedQuery = result.data as z.infer<T>;
    next();
  };
}
