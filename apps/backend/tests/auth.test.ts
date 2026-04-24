import { describe, expect, it, beforeEach, afterEach } from "@jest/globals";
import request from "supertest";
import knex from "knex";
import mockKnex from "mock-knex";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import type { User } from "../src/types/db.js";

function setupMockDb() {
  const db = knex({ client: "pg" });
  mockKnex.mock(db);
  const tracker = mockKnex.getTracker();
  const store = new Map<string, User>();

  return { db, tracker, store };
}

describe("POST /api/auth/register", () => {
  let ctx: ReturnType<typeof setupMockDb>;

  beforeEach(() => {
    ctx = setupMockDb();
    ctx.tracker.install();
  });

  afterEach(() => {
    ctx.tracker.uninstall();
  });

  it("rejects invalid body", async () => {
    const app = createApp(ctx.db);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "not-an-email", password: "short", name: "" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("creates a user and returns a bearer token", async () => {
    ctx.tracker.on("query", (query) => {
      if (query.method === "first") {
        query.response(null);
      } else if (query.method === "insert") {
        const [email, name, password_hash] = query.bindings;
        const user: User = {
          id: "new-uuid",
          email,
          name,
          password_hash,
          created_at: new Date(),
          updated_at: new Date(),
        };

        ctx.store.set(user.id, user);
        query.response([user]);
      }
    });

    const app = createApp(ctx.db);

    const res = await request(app).post("/api/auth/register").send({
      email: "jane@example.com",
      password: "correcthorse",
      name: "Jane",
    });

    expect(res.status).toBe(201);
    expect(typeof res.body.access_token).toBe("string");
    expect(res.body.accessToken).toBeUndefined();
    expect(ctx.store.size).toBe(1);
  });

  it("rejects duplicate email", async () => {
    ctx.tracker.on("query", (query) => {
      if (query.method === "insert") {
        const error = Object.assign(new Error("duplicate key value violates unique constraint"), {
          code: "23505",
        });

        query.reject(error);
      }
    });

    const app = createApp(ctx.db);

    const res = await request(app).post("/api/auth/register").send({
      email: "taken@example.com",
      password: "password123",
      name: "Dup",
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("EMAIL_TAKEN");
  });
});

describe("POST /api/auth/login", () => {
  let ctx: ReturnType<typeof setupMockDb>;
  let user: User;

  beforeEach(async () => {
    ctx = setupMockDb();
    ctx.tracker.install();
    user = {
      id: "user-id",
      email: "jack@example.com",
      name: "Jack",
      password_hash: await bcrypt.hash("correcthorse", 10),
      created_at: new Date(),
      updated_at: new Date(),
    };
    ctx.store.set(user.id, user);
  });

  afterEach(() => {
    ctx.tracker.uninstall();
  });

  it("returns token on success", async () => {
    ctx.tracker.on("query", (query) => {
      if (query.method === "first") {
        query.response(user);
      }
    });

    const app = createApp(ctx.db);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "jack@example.com", password: "correcthorse" });

    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeDefined();
    expect(res.body.accessToken).toBeUndefined();
  });

  it("rejects bad password", async () => {
    ctx.tracker.on("query", (query) => {
      if (query.method === "first") {
        query.response(user);
      }
    });

    const app = createApp(ctx.db);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "jack@example.com", password: "wrongpassword" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects unknown email", async () => {
    ctx.tracker.on("query", (query) => {
      if (query.method === "first") {
        query.response(null);
      }
    });

    const app = createApp(ctx.db);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "ghost@example.com", password: "correcthorse" });

    expect(res.status).toBe(401);
  });
});
