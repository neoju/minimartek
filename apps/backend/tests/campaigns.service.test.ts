import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";
import knex from "knex";
import mockKnex from "mock-knex";
import { AUTH_HEADER, AUTH_SCHEME } from "@repo/utils";
import { createApp } from "../src/app.js";
import { signToken } from "../src/lib/jwt.js";
import { emailSendingQueue } from "../src/queues/queues.js";
import type { Campaign } from "../src/types/db.js";

type TrackerQuery = {
  method: string;
  sql: string;
  bindings: unknown[];
  response: (value: unknown) => void;
};

function setupMockDb() {
  const db = knex({ client: "pg" });
  mockKnex.mock(db);
  const tracker = mockKnex.getTracker();

  return { db, tracker };
}

function makeToken(userId = "user-1") {
  return signToken({ sub: userId, email: "u@test.com" }).token;
}

function authHeader(userId = "user-1") {
  return `${AUTH_SCHEME} ${makeToken(userId)}`;
}

function respondToExistingUser(query: TrackerQuery): boolean {
  if (query.method === "first" && query.sql.includes('"users"')) {
    query.response({ id: "user-1" });

    return true;
  }

  return false;
}

function respondToTransaction(query: TrackerQuery): boolean {
  if (query.method === undefined) {
    const sql = query.sql.trim().toUpperCase();

    if (sql === "BEGIN;" || sql === "COMMIT;" || sql === "ROLLBACK;" || sql === "ROLLBACK") {
      query.response([]);

      return true;
    }
  }

  return false;
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

describe("Campaign service — sync campaign_recipients materialization", () => {
  let ctx: ReturnType<typeof setupMockDb>;

  beforeEach(() => {
    ctx = setupMockDb();
    ctx.tracker.install();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    ctx.tracker.uninstall();
  });

  it("POST /campaigns inserts campaign_recipients synchronously when emails match", async () => {
    const app = createApp(ctx.db);
    let queryCount = 0;

    ctx.tracker.on("query", (query: TrackerQuery) => {
      if (respondToExistingUser(query) || respondToTransaction(query)) {
        return;
      }

      queryCount++;

      if (queryCount === 1) {
        query.response([makeCampaign({ status: "draft" })]);
      } else {
        query.response({ rows: [{ recipient_id: "recipient-1" }] });
      }
    });

    const res = await request(app)
      .post("/api/campaigns")
      .set(AUTH_HEADER, authHeader())
      .send({ name: "Test", subject: "Sub", body: "Body", recipient_emails: ["a@b.com"] });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("draft");
    expect(res.body).not.toHaveProperty("recipients_mode");
  });

  it("POST /campaigns rejects 1001 emails with 400 validation error", async () => {
    const app = createApp(ctx.db);
    const emails = Array.from({ length: 1001 }, (_, i) => `user${i}@test.com`);

    ctx.tracker.on("query", (query: TrackerQuery) => {
      if (respondToExistingUser(query)) {
        return;
      }

      query.response([]);
    });

    const res = await request(app)
      .post("/api/campaigns")
      .set(AUTH_HEADER, authHeader())
      .send({ name: "Test", subject: "Sub", body: "Body", recipient_emails: emails });

    expect(res.status).toBe(400);
  });

  it("POST /campaigns rejects recipient_emails:'all' with 400", async () => {
    const app = createApp(ctx.db);

    ctx.tracker.on("query", (query: TrackerQuery) => {
      if (respondToExistingUser(query)) {
        return;
      }

      query.response([]);
    });

    const res = await request(app)
      .post("/api/campaigns")
      .set(AUTH_HEADER, authHeader())
      .send({ name: "Test", subject: "Sub", body: "Body", recipient_emails: "all" });

    expect(res.status).toBe(400);
  });

  it("POST /campaigns does NOT enqueue preparation job", async () => {
    const app = createApp(ctx.db);
    let queryCount = 0;

    ctx.tracker.on("query", (query: TrackerQuery) => {
      if (respondToExistingUser(query) || respondToTransaction(query)) {
        return;
      }

      queryCount++;

      if (queryCount === 1) {
        query.response([makeCampaign({ status: "draft" })]);
      } else {
        query.response({ rows: [{ recipient_id: "recipient-1" }] });
      }
    });

    const addSpy = jest.spyOn(emailSendingQueue, "add").mockResolvedValue({} as never);

    const res = await request(app)
      .post("/api/campaigns")
      .set(AUTH_HEADER, authHeader())
      .send({ name: "Test", subject: "Sub", body: "Body", recipient_emails: ["a@b.com"] });

    expect(res.status).toBe(201);
    expect(addSpy).not.toHaveBeenCalled();
  });

  it("POST /campaigns/:id/send transitions draft→sending and enqueues emailSendingQueue job", async () => {
    const app = createApp(ctx.db);

    ctx.tracker.on("query", (query: TrackerQuery) => {
      if (respondToExistingUser(query) || respondToTransaction(query)) {
        return;
      }

      if (query.method === "first" || query.method === "select") {
        query.response(makeCampaign({ status: "draft" }));
      } else if (query.method === "update") {
        query.response([makeCampaign({ status: "sending" })]);
      } else {
        query.response([]);
      }
    });

    const addSpy = jest.spyOn(emailSendingQueue, "add").mockResolvedValue({} as never);

    const res = await request(app)
      .post("/api/campaigns/campaign-1/send")
      .set(AUTH_HEADER, authHeader())
      .send();

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("sending");
    expect(addSpy).toHaveBeenCalledTimes(1);
  });

  it("POST /campaigns/:id/send on scheduled removes old delayed job before enqueuing immediate job", async () => {
    const app = createApp(ctx.db);

    ctx.tracker.on("query", (query: TrackerQuery) => {
      if (respondToExistingUser(query) || respondToTransaction(query)) {
        return;
      }

      if (query.method === "first" || query.method === "select") {
        query.response(
          makeCampaign({ status: "scheduled", scheduled_at: new Date("2026-05-01T12:00:00Z") }),
        );
      } else if (query.method === "update") {
        query.response([makeCampaign({ status: "sending" })]);
      } else {
        query.response([]);
      }
    });

    const removeSpy = jest.spyOn(emailSendingQueue, "remove").mockResolvedValue(0 as never);
    const addSpy = jest.spyOn(emailSendingQueue, "add").mockResolvedValue({} as never);

    const res = await request(app)
      .post("/api/campaigns/campaign-1/send")
      .set(AUTH_HEADER, authHeader())
      .send();

    expect(res.status).toBe(200);
    expect(removeSpy).toHaveBeenCalled();
    expect(addSpy).toHaveBeenCalled();
    const removeCallOrder = removeSpy.mock.invocationCallOrder[0]!;
    const addCallOrder = addSpy.mock.invocationCallOrder[0]!;
    expect(removeCallOrder).toBeLessThan(addCallOrder);
  });

  it("POST /campaigns/:id/send is idempotent when already sending (returns 409 CAMPAIGN_BUSY)", async () => {
    const app = createApp(ctx.db);

    ctx.tracker.on("query", (query: TrackerQuery) => {
      if (respondToExistingUser(query) || respondToTransaction(query)) {
        return;
      }

      if (query.method === "first" || query.method === "select") {
        query.response(makeCampaign({ status: "sending" }));
      } else {
        query.response([]);
      }
    });

    const res = await request(app)
      .post("/api/campaigns/campaign-1/send")
      .set(AUTH_HEADER, authHeader())
      .send();

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CAMPAIGN_BUSY");
  });
});
