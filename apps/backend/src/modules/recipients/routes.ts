import { Router } from "express";
import type { Knex } from "knex";
import type { z } from "zod";
import { requireAuth } from "@/middlewares/auth.js";
import { validateQuery, type WithValidatedQuery } from "@/lib/validate.js";
import { RandomRecipientsQuerySchema, type RandomRecipientsResponse } from "@repo/dto";

type ValidatedRandomQuery = WithValidatedQuery<z.infer<typeof RandomRecipientsQuerySchema>>;

interface RecipientEmailRow {
  email: string;
}

export function recipientsRouter(db: Knex): Router {
  const router = Router();

  router.use(requireAuth);

  router.get("/random", validateQuery(RandomRecipientsQuerySchema), async (req, res, next) => {
    try {
      const { limit } = (req as ValidatedRandomQuery).validatedQuery;

      const result = await db.raw<{ rows: RecipientEmailRow[] }>(
        "SELECT email FROM recipients TABLESAMPLE BERNOULLI(10) LIMIT ?",
        [limit],
      );
      const rows = result.rows;

      const body: RandomRecipientsResponse = {
        emails: rows.map((row) => row.email),
      };

      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
