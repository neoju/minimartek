import { Router } from "express";
import type { Knex } from "knex";
import { getUserId, requireAuth } from "@/middlewares/auth.js";
import { HttpError } from "@/lib/http-error.js";

interface UserRow {
  id: string;
  email: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

function serialize(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export function usersRouter(db: Knex): Router {
  const router = Router();

  router.use(requireAuth);

  router.get("/me", async (req, res, next) => {
    try {
      const userId = getUserId(req);
      const row = await db<UserRow>("users").where({ id: userId }).first();

      if (!row) {
        throw new HttpError(404, "USER_NOT_FOUND", "User not found");
      }

      res.json(serialize(row));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
