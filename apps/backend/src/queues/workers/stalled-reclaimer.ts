import type { Knex } from "knex";
import { db } from "@/db/knex.js";
import { env } from "@/config/env.js";
import { emailSendingQueue, getDispatchSeedJobId } from "@/queues/queues.js";

interface ReclaimedRow {
  campaign_id: string;
}

export async function reclaimStalledRecipients(knex: Knex, timeoutMs: number): Promise<string[]> {
  const result = await knex.raw<{ rows: ReclaimedRow[] }>(
    `
      UPDATE campaign_recipients
      SET status = 'pending', next_attempt_at = NULL
      WHERE status = 'processing'
        AND last_attempt_at < NOW() - (? || ' milliseconds')::interval
      RETURNING campaign_id
    `,
    [timeoutMs],
  );

  const campaignIds = new Set<string>();

  for (const row of result.rows) {
    campaignIds.add(row.campaign_id);
  }

  return Array.from(campaignIds);
}

async function reenqueueDispatchForCampaigns(campaignIds: string[]): Promise<void> {
  if (campaignIds.length === 0) {
    return;
  }

  for (const campaignId of campaignIds) {
    try {
      await emailSendingQueue.add(
        getDispatchSeedJobId(campaignId),
        { campaignId },
        { jobId: getDispatchSeedJobId(campaignId) },
      );
    } catch (error) {
      if (process.env.NODE_ENV !== "test") {
        console.error(
          `[backend] reclaimer failed to enqueue dispatch for campaign ${campaignId}`,
          error,
        );
      }
    }
  }
}

async function rescueOrphanedSendingCampaigns(): Promise<string[]> {
  const campaigns = await db("campaigns")
    .where({ status: "sending" })
    .whereNotExists(function () {
      this.from("campaign_recipients as cr")
        .whereRaw("cr.campaign_id = campaigns.id")
        .whereRaw("cr.status = 'processing'");
    })
    .whereExists(function () {
      this.from("campaign_recipients as cr")
        .whereRaw("cr.campaign_id = campaigns.id")
        .whereRaw("cr.status = 'pending'");
    })
    .select("id");

  const rescued: string[] = [];

  for (const campaign of campaigns) {
    const seed = getDispatchSeedJobId(campaign.id);
    const existing = await emailSendingQueue.getJob(seed);

    if (existing) {
      const state = await existing.getState();

      if (state !== "completed" && state !== "failed") {
        continue;
      }
    }

    try {
      await emailSendingQueue.add(
        seed,
        { campaignId: campaign.id },
        {
          jobId: seed,
        },
      );

      if (process.env.NODE_ENV !== "test") {
        console.log(
          JSON.stringify({
            event: "reclaim.orphan-sending",
            campaignId: campaign.id,
            reason: "no-active-dispatch-job",
          }),
        );
      }

      rescued.push(campaign.id);
    } catch (error) {
      if (process.env.NODE_ENV !== "test") {
        console.error(
          `[backend] reclaimer failed to enqueue dispatch for campaign ${campaign.id}`,
          error,
        );
      }
    }
  }

  return rescued;
}

export async function runReclaimerOnce(knex: Knex = db): Promise<string[]> {
  const reclaimed = await reclaimStalledRecipients(knex, env.EMAIL_SEND_STALLED_TIMEOUT_MS);

  await reenqueueDispatchForCampaigns(reclaimed);
  await rescueOrphanedSendingCampaigns();

  return reclaimed;
}

export function startStalledRecipientReclaimer(
  knex: Knex = db,
  opts?: { intervalMs?: number; timeoutMs?: number },
): { stop: () => void; runNow: () => Promise<string[]> } {
  const intervalMs = opts?.intervalMs ?? env.EMAIL_SEND_RECLAIM_INTERVAL_MS;
  const timeoutMs = opts?.timeoutMs ?? env.EMAIL_SEND_STALLED_TIMEOUT_MS;

  const runNow = async () => {
    try {
      const reclaimed = await reclaimStalledRecipients(knex, timeoutMs);
      await reenqueueDispatchForCampaigns(reclaimed);
      await rescueOrphanedSendingCampaigns();

      if (reclaimed.length > 0 && process.env.NODE_ENV !== "test") {
        console.log(
          `[backend] reclaimed stalled recipients for ${reclaimed.length} campaign(s): ${reclaimed.join(", ")}`,
        );
      }

      return reclaimed;
    } catch (error) {
      if (process.env.NODE_ENV !== "test") {
        console.error("[backend] stalled recipient reclaimer failed", error);
      }

      return [];
    }
  };

  if (intervalMs <= 0) {
    return { stop: () => { }, runNow };
  }

  const interval = setInterval(() => {
    void runNow();
  }, intervalMs);

  return {
    stop: () => clearInterval(interval),
    runNow,
  };
}
