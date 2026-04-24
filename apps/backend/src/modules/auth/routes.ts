import { Router } from "express";
import type { Knex } from "knex";
import { LoginRequestSchema, RegisterRequestSchema } from "@repo/dto";
import { validateBody } from "@/lib/validate.js";
import { login, register } from "@/modules/auth/service.js";

export function authRouter(db: Knex): Router {
  const router = Router();

  router.post("/register", validateBody(RegisterRequestSchema), async (req, res, next) => {
    try {
      const result = await register(db, req.body);

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/login", validateBody(LoginRequestSchema), async (req, res, next) => {
    try {
      const result = await login(db, req.body);

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
