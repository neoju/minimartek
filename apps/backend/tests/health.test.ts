import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import knex from "knex";
import mockKnex from "mock-knex";
import { createApp } from "../src/app.js";

describe("GET /health", () => {
  it("returns ok", async () => {
    const db = knex({ client: "pg" });
    mockKnex.mock(db);

    const app = createApp(db);

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
