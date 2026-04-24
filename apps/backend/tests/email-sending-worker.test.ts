import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import mockKnex from "mock-knex";
import { db } from "../src/db/knex.js";
import { emailSendingQueue } from "../src/queues/queues.js";
import { processCampaignDispatchJob } from "../src/queues/workers/email-sending.js";

type TrackerQuery = {
  method: string;
  sql: string;
  bindings: unknown[];
  response: (value: unknown) => void;
};

function createJob(campaignId: string) {
  return { data: { campaignId } } as Parameters<typeof processCampaignDispatchJob>[0];
}

describe("email sending worker retries", () => {
  const tracker = mockKnex.getTracker();

  beforeAll(() => {
    mockKnex.mock(db);
  });

  beforeEach(() => {
    tracker.install();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    tracker.uninstall();
  });

  afterAll(() => {
    mockKnex.unmock(db);
  });

  it("requeues failed recipients below max attempts with saved error message", async () => {
    let firstCount = 0;
    const addSpy = jest
      .spyOn(emailSendingQueue, "add")
      .mockResolvedValue({ id: "retry-job" } as never);

    const removeSpy = jest.spyOn(emailSendingQueue, "remove").mockResolvedValue(0);

    tracker.on("query", (query: TrackerQuery) => {
      if (query.method === "raw" && query.sql.includes("WITH claimed AS")) {
        query.response({ rows: [{ recipient_id: "recipient-1", attempt_count: 1 }] });

        return;
      }

      if (query.method === "update") {
        query.response(1);

        return;
      }

      if (query.method === "first") {
        firstCount += 1;

        if (firstCount < 3) {
          query.response(undefined);

          return;
        }

        query.response({ next_attempt_at: new Date(Date.now() + 5000) });
      }
    });

    await processCampaignDispatchJob(createJob("campaign-1"), {
      sendEmail: async () => {
        throw new Error("Simulated email provider failure");
      },
    });

    expect(removeSpy).toHaveBeenCalledWith("campaign-dispatch__campaign-1");
    expect(addSpy).toHaveBeenCalledWith(
      "campaign-dispatch__campaign-1",
      { campaignId: "campaign-1" },
      expect.objectContaining({
        delay: expect.any(Number),
        jobId: "campaign-dispatch__campaign-1",
      }),
    );
  });

  it("marks recipients failed after reaching the max attempt count", async () => {
    let firstCount = 0;
    const addSpy = jest.spyOn(emailSendingQueue, "add");

    tracker.on("query", (query: TrackerQuery) => {
      if (query.method === "raw" && query.sql.includes("WITH claimed AS")) {
        query.response({ rows: [{ recipient_id: "recipient-1", attempt_count: 3 }] });

        return;
      }

      if (query.method === "update") {
        query.response(1);

        return;
      }

      if (query.method === "first") {
        firstCount += 1;
        query.response(firstCount === 3 ? undefined : undefined);
      }
    });

    await processCampaignDispatchJob(createJob("campaign-1"), {
      sendEmail: async () => {
        throw new Error("Mailbox rejected message");
      },
    });

    expect(addSpy).not.toHaveBeenCalled();
  });

  it("marks recipients sent and clears any stale error state on success", async () => {
    let updateCount = 0;
    let firstCount = 0;

    tracker.on("query", (query: TrackerQuery) => {
      if (query.method === "raw" && query.sql.includes("WITH claimed AS")) {
        query.response({ rows: [{ recipient_id: "recipient-1", attempt_count: 1 }] });

        return;
      }

      if (query.method === "update") {
        updateCount += 1;

        query.response(1);

        return;
      }

      if (query.method === "first") {
        firstCount += 1;
        query.response(firstCount === 3 ? undefined : undefined);
      }
    });

    await processCampaignDispatchJob(createJob("campaign-1"), {
      sendEmail: async () => undefined,
    });

    expect(updateCount).toBe(3);
  });
});
