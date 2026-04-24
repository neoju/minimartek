import express from "express";
import type { Express } from "express";
import cors from "cors";
import type { Knex } from "knex";
import { authRouter } from "@/modules/auth/routes.js";
import { usersRouter } from "@/modules/users/routes.js";
import { campaignRouter } from "@/modules/campaigns/routes.js";
import { recipientsRouter } from "@/modules/recipients/routes.js";
import { errorHandler, notFoundHandler } from "@/middlewares/error.js";

export function createApp(db: Knex): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter(db));
  app.use("/api/users", usersRouter(db));
  app.use("/api/campaigns", campaignRouter(db));
  app.use("/api/recipients", recipientsRouter(db));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
