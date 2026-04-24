import { Router } from "express";
import type { Knex } from "knex";
import type { z } from "zod";
import { getUserId, requireAuth } from "@/middlewares/auth.js";
import { validateBody, validateQuery, type WithValidatedQuery } from "@/lib/validate.js";
import {
  CreateCampaignRequestSchema,
  UpdateCampaignRequestSchema,
  ScheduleCampaignRequestSchema,
  PaginationQuerySchema,
  CampaignRecipientListQuerySchema,
} from "@repo/dto";
import { CampaignService } from "@/modules/campaigns/service.js";
import { serializeCampaign } from "@/modules/campaigns/serialize.js";

type ValidatedPaginationQuery = WithValidatedQuery<z.infer<typeof PaginationQuerySchema>>;
type ValidatedRecipientListQuery = WithValidatedQuery<
  z.infer<typeof CampaignRecipientListQuerySchema>
>;

export function campaignRouter(db: Knex): Router {
  const router = Router();
  const service = new CampaignService(db);

  router.use(requireAuth);

  router.get("/", validateQuery(PaginationQuerySchema), async (req, res, next) => {
    try {
      const query = (req as ValidatedPaginationQuery).validatedQuery;
      const result = await service.listCampaigns(getUserId(req), query.page, query.page_size);

      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/", validateBody(CreateCampaignRequestSchema), async (req, res, next) => {
    try {
      const result = await service.createCampaign(getUserId(req), req.body);
      res.status(201).json(serializeCampaign(result));
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const result = await service.getCampaignById(getUserId(req), req.params.id!);

      res.json(serializeCampaign(result));
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:id", validateBody(UpdateCampaignRequestSchema), async (req, res, next) => {
    try {
      const result = await service.updateCampaign(getUserId(req), req.params.id!, req.body);

      res.json(serializeCampaign(result));
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      await service.deleteCampaign(getUserId(req), req.params.id!);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/:id/schedule",
    validateBody(ScheduleCampaignRequestSchema),
    async (req, res, next) => {
      try {
        const result = await service.scheduleCampaign(getUserId(req), req.params.id!, req.body);

        res.json(serializeCampaign(result));
      } catch (err) {
        next(err);
      }
    },
  );

  router.post("/:id/send", async (req, res, next) => {
    try {
      const result = await service.sendCampaign(getUserId(req), req.params.id!);

      res.json(serializeCampaign(result));
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id/stats", async (req, res, next) => {
    try {
      const result = await service.getStats(getUserId(req), req.params.id!);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get(
    "/:id/recipients",
    validateQuery(CampaignRecipientListQuerySchema),
    async (req, res, next) => {
      try {
        const query = (req as ValidatedRecipientListQuery).validatedQuery;
        const result = await service.listCampaignRecipients(getUserId(req), req.params.id!, query);

        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
