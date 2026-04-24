import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import request from "supertest";
import knex from "knex";
import mockKnex from "mock-knex";
import { AUTH_HEADER, AUTH_SCHEME } from "@repo/utils";
import { createApp } from "../src/app.js";
import { signToken } from "../src/lib/jwt.js";
import type { Campaign } from "../src/types/db.js";

function setupMockDb() {
  const db = knex({ client: "pg" });
  mockKnex.mock(db);
  const tracker = mockKnex.getTracker();

  return { db, tracker };
}

function authHeader() {
  const { token } = signToken({ sub: "user-1", email: "owner@example.com" });

  return `${AUTH_SCHEME} ${token}`;
}

function respondToExistingUser(query: {
  method: string;
  sql: string;
  response: (value: unknown) => void;
}): boolean {
  if (query.method === "first" && query.sql.includes('"users"')) {
    query.response({ id: "user-1" });

    return true;
  }

  return false;
}

function respondToTransaction(query: {
  method: string;
  sql: string;
  response: (value: unknown) => void;
}): boolean {
  if (query.method === undefined) {
    const sql = query.sql.trim().toUpperCase();

    if (sql === "BEGIN;" || sql === "COMMIT;" || sql === "ROLLBACK;" || sql === "ROLLBACK") {
      query.response([]);

      return true;
    }
  }

  return false;
}

describe("GET /api/campaigns", () => {
  let ctx: ReturnType<typeof setupMockDb>;

  beforeEach(() => {
    ctx = setupMockDb();
    ctx.tracker.install();
  });

  afterEach(() => {
    ctx.tracker.uninstall();
  });

  it("accepts page_size and returns snake_case campaign fields", async () => {
    const campaign: Campaign = {
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
    };

    let selectCalls = 0;

    ctx.tracker.on("query", (query) => {
      if (respondToExistingUser(query)) {
        return;
      }

      if (query.method === "select") {
        selectCalls += 1;
        query.response([{ ...campaign, recipient_count: "3" }]);

        return;
      }

      if (query.method === "first") {
        query.response({ count: "1" });
      }
    });

    const app = createApp(ctx.db);

    const res = await request(app)
      .get("/api/campaigns?page=2&page_size=10")
      .set(AUTH_HEADER, authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [
        {
          id: "campaign-1",
          name: "Launch",
          subject: "Hello",
          body: "Body",
          status: "draft",
          scheduled_at: null,
          recipient_count: 3,
          created_at: "2026-04-21T12:00:00.000Z",
        },
      ],
      page: 2,
      page_size: 10,
      total: 1,
    });
  });
});

describe("POST /api/campaigns", () => {
  let ctx: ReturnType<typeof setupMockDb>;

  beforeEach(() => {
    ctx = setupMockDb();
    ctx.tracker.install();
  });

  afterEach(() => {
    ctx.tracker.uninstall();
  });

  it("rejects camelCase request keys", async () => {
    ctx.tracker.on("query", (query) => {
      if (respondToExistingUser(query)) {
        return;
      }
    });

    const app = createApp(ctx.db);

    const res = await request(app)
      .post("/api/campaigns")
      .set(AUTH_HEADER, authHeader())
      .send({
        name: "Launch",
        subject: "Hello",
        body: "Body",
        recipientEmails: ["a@example.com"],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /api/campaigns/:id", () => {
  let ctx: ReturnType<typeof setupMockDb>;

  beforeEach(() => {
    ctx = setupMockDb();
    ctx.tracker.install();
  });

  afterEach(() => {
    ctx.tracker.uninstall();
  });

  it("returns campaign detail without embedded stats", async () => {
    const campaign: Campaign = {
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
    };

    ctx.tracker.on("query", (query) => {
      if (respondToExistingUser(query)) {
        return;
      }

      if (query.method === "first") {
        query.response(campaign);
      }
    });

    const app = createApp(ctx.db);

    const res = await request(app).get("/api/campaigns/campaign-1").set(AUTH_HEADER, authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: "campaign-1",
      name: "Launch",
      subject: "Hello",
      body: "Body",
      status: "draft",
      scheduled_at: null,
      created_by: "user-1",
      created_at: "2026-04-21T12:00:00.000Z",
      updated_at: "2026-04-21T12:30:00.000Z",
    });
    expect(res.body).not.toHaveProperty("stats");
  });
});

describe("GET /api/campaigns/:id/stats", () => {
  let ctx: ReturnType<typeof setupMockDb>;

  beforeEach(() => {
    ctx = setupMockDb();
    ctx.tracker.install();
  });

  afterEach(() => {
    ctx.tracker.uninstall();
  });

  it("returns aggregated campaign stats", async () => {
    const campaign: Campaign = {
      id: "campaign-1",
      name: "Launch",
      subject: "Hello",
      body: "Body",
      status: "sending",

      scheduled_at: null,
      deleted_at: null,
      created_by: "user-1",
      created_at: new Date("2026-04-21T12:00:00.000Z"),
      updated_at: new Date("2026-04-21T12:30:00.000Z"),
    };

    ctx.tracker.on("query", (query) => {
      if (respondToExistingUser(query)) {
        return;
      }

      if (query.method === "first" && query.sql.includes('"campaigns"')) {
        query.response(campaign);

        return;
      }

      if (query.method === "first" && query.sql.includes('"campaign_recipients"')) {
        query.response({
          total: "10",
          sent: "7",
          failed: "2",
          opened: "5",
        });
      }
    });

    const app = createApp(ctx.db);

    const res = await request(app)
      .get("/api/campaigns/campaign-1/stats")
      .set(AUTH_HEADER, authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "sending",
      scheduled_at: null,
      total: 10,
      sent: 7,
      failed: 2,
      opened: 5,
      open_rate: 50,
      send_rate: 70,
    });
  });
});

describe("DELETE /api/campaigns/:id", () => {
  let ctx: ReturnType<typeof setupMockDb>;

  beforeEach(() => {
    ctx = setupMockDb();
    ctx.tracker.install();
  });

  afterEach(() => {
    ctx.tracker.uninstall();
  });

  it("soft deletes a draft campaign", async () => {
    const campaign: Campaign = {
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
    };

    let sawUpdate = false;

    ctx.tracker.on("query", (query) => {
      if (respondToExistingUser(query)) {
        return;
      }

      if (query.method === "first") {
        query.response(campaign);

        return;
      }

      if (query.method === "update") {
        sawUpdate = true;
        query.response(1);

        return;
      }

      if (query.method === "del") {
        throw new Error("delete should use soft delete update, not physical delete");
      }
    });

    const app = createApp(ctx.db);

    const res = await request(app)
      .delete("/api/campaigns/campaign-1")
      .set(AUTH_HEADER, authHeader());

    expect(res.status).toBe(204);
    expect(sawUpdate).toBe(true);
  });

  it("rejects deleting a non-draft campaign", async () => {
    const campaign: Campaign = {
      id: "campaign-1",
      name: "Launch",
      subject: "Hello",
      body: "Body",
      status: "scheduled",

      scheduled_at: new Date("2026-04-22T12:00:00.000Z"),
      deleted_at: null,
      created_by: "user-1",
      created_at: new Date("2026-04-21T12:00:00.000Z"),
      updated_at: new Date("2026-04-21T12:30:00.000Z"),
    };

    ctx.tracker.on("query", (query) => {
      if (respondToExistingUser(query)) {
        return;
      }

      if (query.method === "first") {
        query.response(campaign);
      }
    });

    const app = createApp(ctx.db);

    const res = await request(app)
      .delete("/api/campaigns/campaign-1")
      .set(AUTH_HEADER, authHeader());

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CAMPAIGN_NOT_DRAFT");
  });
});

describe("PATCH /api/campaigns/:id", () => {
  let ctx: ReturnType<typeof setupMockDb>;

  beforeEach(() => {
    ctx = setupMockDb();
    ctx.tracker.install();
  });

  afterEach(() => {
    ctx.tracker.uninstall();
  });

  it("rejects updating a non-draft campaign", async () => {
    const campaign: Campaign = {
      id: "campaign-1",
      name: "Launch",
      subject: "Hello",
      body: "Body",
      status: "sent",

      scheduled_at: null,
      deleted_at: null,
      created_by: "user-1",
      created_at: new Date("2026-04-21T12:00:00.000Z"),
      updated_at: new Date("2026-04-21T12:30:00.000Z"),
    };

    ctx.tracker.on("query", (query) => {
      if (respondToExistingUser(query)) {
        return;
      }

      if (respondToTransaction(query)) {
        return;
      }

      if (query.method === "first") {
        query.response(campaign);
      }
    });

    const app = createApp(ctx.db);

    const res = await request(app)
      .patch("/api/campaigns/campaign-1")
      .set(AUTH_HEADER, authHeader())
      .send({ name: "Updated" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CAMPAIGN_NOT_DRAFT");
  });
});
