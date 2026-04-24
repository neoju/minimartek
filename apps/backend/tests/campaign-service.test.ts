import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import knex from "knex";
import mockKnex from "mock-knex";
import { CampaignService } from "../src/modules/campaigns/service.js";
import { emailSendingQueue, getDispatchSeedJobId } from "../src/queues/queues.js";
import type { Campaign } from "../src/types/db.js";

type TrackerQuery = {
  method: string;
  sql: string;
  bindings: unknown[];
  response: (value: unknown) => void;
};

function respondToTransaction(query: TrackerQuery): boolean {
  if (
    query.method === undefined &&
    ["BEGIN;", "COMMIT;", "ROLLBACK;", "ROLLBACK"].includes(query.sql.trim().toUpperCase())
  ) {
    query.response([]);

    return true;
  }

  return false;
}

function setupMockDb() {
  const db = knex({ client: "pg" });
  mockKnex.mock(db);
  const tracker = mockKnex.getTracker();

  return { db, tracker };
}

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "campaign-1",
    name: "Launch",
    subject: "Hello",
    body: "Body",
    status: "draft",
    scheduled_at: null,
    deleted_at: null,
    created_by: "user-1",
    created_at: new Date("2026-04-21T12:00:00.000Z"),
    updated_at: new Date("2026-04-21T12:30:00.000Z"),
    ...overrides,
  };
}

describe("CampaignService queueing", () => {
  let ctx: ReturnType<typeof setupMockDb>;

  beforeEach(() => {
    ctx = setupMockDb();
    ctx.tracker.install();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    ctx.tracker.uninstall();
  });

  it("enqueues one dispatch job when sending a specific-recipient campaign", async () => {
    const service = new CampaignService(ctx.db);
    const campaign = makeCampaign();
    const updated = makeCampaign({ status: "sending" });

    ctx.tracker.on("query", (query: TrackerQuery) => {
      if (respondToTransaction(query)) {
        return;
      }

      if (query.method === "first") {
        query.response(campaign);

        return;
      }

      if (query.method === "update") {
        query.response([updated]);
      }
    });

    const addSpy = jest.spyOn(emailSendingQueue, "add").mockResolvedValue({ id: "job-1" } as never);
    const addBulkSpy = jest.spyOn(emailSendingQueue, "addBulk");

    const result = await service.sendCampaign("user-1", "campaign-1");

    expect(result.status).toBe("sending");
    expect(addSpy).toHaveBeenCalledWith(
      getDispatchSeedJobId("campaign-1"),
      { campaignId: "campaign-1" },
      expect.objectContaining({
        jobId: getDispatchSeedJobId("campaign-1"),
      }),
    );
    expect(addBulkSpy).not.toHaveBeenCalled();
  });

  it("removes the delayed scheduled dispatch before immediate send", async () => {
    const service = new CampaignService(ctx.db);
    const campaign = makeCampaign({
      status: "scheduled",
      scheduled_at: new Date("2026-04-23T12:00:00.000Z"),
    });

    const updated = makeCampaign({
      status: "sending",
      scheduled_at: new Date("2026-04-23T12:00:00.000Z"),
    });

    ctx.tracker.on("query", (query: TrackerQuery) => {
      if (respondToTransaction(query)) {
        return;
      }

      if (query.method === "first") {
        query.response(campaign);

        return;
      }

      if (query.method === "update") {
        query.response([updated]);
      }
    });

    const removeSpy = jest.spyOn(emailSendingQueue, "remove").mockResolvedValue(0 as never);
    const addSpy = jest.spyOn(emailSendingQueue, "add").mockResolvedValue({ id: "job-1" } as never);

    await service.sendCampaign("user-1", "campaign-1");

    expect(removeSpy).toHaveBeenCalledWith(getDispatchSeedJobId("campaign-1"));
    expect(addSpy).toHaveBeenCalledWith(
      getDispatchSeedJobId("campaign-1"),
      { campaignId: "campaign-1" },
      expect.objectContaining({
        jobId: getDispatchSeedJobId("campaign-1"),
      }),
    );
  });

  it("schedules specific-recipient campaigns via delayed dispatch job", async () => {
    const service = new CampaignService(ctx.db);
    const campaign = makeCampaign();
    const futureDate = new Date(Date.now() + 86400000);
    const updated = makeCampaign({
      status: "scheduled",
      scheduled_at: futureDate,
    });

    ctx.tracker.on("query", (query: TrackerQuery) => {
      if (respondToTransaction(query)) {
        return;
      }

      if (query.method === "first") {
        query.response(campaign);

        return;
      }

      if (query.method === "update") {
        query.response([updated]);
      }
    });

    const addDispatchSpy = jest
      .spyOn(emailSendingQueue, "add")
      .mockResolvedValue({ id: "dispatch-job-1" } as never);

    const result = await service.scheduleCampaign("user-1", "campaign-1", {
      scheduled_at: futureDate.toISOString(),
    });

    expect(result.status).toBe("scheduled");
    expect(addDispatchSpy).toHaveBeenCalledWith(
      getDispatchSeedJobId("campaign-1"),
      {
        campaignId: "campaign-1",
      },
      expect.objectContaining({
        delay: expect.any(Number),
        jobId: getDispatchSeedJobId("campaign-1"),
      }),
    );
  });
});
