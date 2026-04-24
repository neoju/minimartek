import { Worker } from "bullmq";
import type { Job } from "bullmq";
import { env } from "@/config/env.js";
import { db } from "@/db/knex.js";
import { EMAIL_SEND_BATCH_SIZE, EMAIL_SEND_CONCURRENCY_PER_CAMPAIGN } from "@/queues/constants.js";
import { redisConnection } from "@/queues/connection.js";
import {
  emailSendingQueue,
  getDispatchSeedJobId,
  createImmediateDispatchJobId,
} from "@/queues/queues.js";
import type { CampaignDispatchJobData } from "@/queues/queues.js";

async function simulateSendEmail(_recipientId: string): Promise<void> {
  // Simulated email send — replace with real provider (SendGrid, SES, etc.) in production
  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (Math.random() < env.EMAIL_SEND_FAILURE_RATE) {
    throw new Error("Simulated email provider failure");
  }
}

interface CampaignProgressRow {
  next_attempt_at: Date | string | null;
}

interface ClaimedRecipientRow {
  recipient_id: string;
  attempt_count: string | number;
}

interface ClaimedRecipient {
  recipientId: string;
  attemptCount: number;
}

async function claimRecipientBatch(
  campaignId: string,
  batchSize: number,
): Promise<ClaimedRecipient[]> {
  // Atomically claim a batch: SELECT with FOR UPDATE SKIP LOCKED (concurrent-worker safe) +
  // UPDATE pending→processing in one CTE so no second query is needed.
  const result = await db.raw<{ rows: ClaimedRecipientRow[] }>(
    `
      WITH claimed AS (
        SELECT recipient_id
        FROM campaign_recipients
        WHERE campaign_id = ?
          AND status = 'pending'
          AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
        ORDER BY next_attempt_at NULLS FIRST, recipient_id
        LIMIT ?
        FOR UPDATE SKIP LOCKED
      )
      UPDATE campaign_recipients AS recipients
      SET status = 'processing',
          attempt_count = recipients.attempt_count + 1,
          last_attempt_at = NOW()
      FROM claimed
      WHERE recipients.campaign_id = ?
        AND recipients.recipient_id = claimed.recipient_id
      RETURNING recipients.recipient_id, recipients.attempt_count
    `,
    [campaignId, batchSize, campaignId],
  );

  return result.rows.map((row) => ({
    recipientId: row.recipient_id,
    attemptCount: Number(row.attempt_count ?? 0),
  }));
}

async function markRecipientSent(campaignId: string, recipientId: string): Promise<void> {
  await db("campaign_recipients")
    .where({ campaign_id: campaignId, recipient_id: recipientId, status: "processing" })
    .update({
      status: "sent",
      sent_at: db.fn.now(),
      last_error_message: null,
      next_attempt_at: null,
    });
}

async function markRecipientForRetry(
  campaignId: string,
  recipientId: string,
  message: string,
  retryAt: Date,
): Promise<void> {
  await db("campaign_recipients")
    .where({ campaign_id: campaignId, recipient_id: recipientId, status: "processing" })
    .update({
      status: "pending",
      last_error_message: message,
      next_attempt_at: retryAt,
    });
}

async function markRecipientFailed(
  campaignId: string,
  recipientId: string,
  message: string,
): Promise<void> {
  await db("campaign_recipients")
    .where({ campaign_id: campaignId, recipient_id: recipientId, status: "processing" })
    .update({
      status: "failed",
      last_error_message: message,
      next_attempt_at: null,
    });
}

async function resetClaimedRecipients(campaignId: string, recipientIds: string[]): Promise<void> {
  if (recipientIds.length === 0) {
    return;
  }

  await db("campaign_recipients")
    .where({ campaign_id: campaignId, status: "processing" })
    .whereIn("recipient_id", recipientIds)
    .update({ status: "pending", next_attempt_at: null });
}

async function hasReadyPendingRecipients(campaignId: string): Promise<boolean> {
  const row = await db("campaign_recipients")
    .where({ campaign_id: campaignId, status: "pending" })
    .where((queryBuilder) => {
      queryBuilder.whereNull("next_attempt_at").orWhere("next_attempt_at", "<=", db.fn.now());
    })
    .first("recipient_id");

  return row !== undefined;
}

async function hasProcessingRecipients(campaignId: string): Promise<boolean> {
  const row = await db("campaign_recipients")
    .where({ campaign_id: campaignId, status: "processing" })
    .first("recipient_id");

  return row !== undefined;
}

async function getNextRetryAt(campaignId: string): Promise<Date | null> {
  const row = await db("campaign_recipients")
    .where({ campaign_id: campaignId, status: "pending" })
    .whereNotNull("next_attempt_at")
    .andWhere("next_attempt_at", ">", db.fn.now())
    .orderBy("next_attempt_at", "asc")
    .first<CampaignProgressRow>("next_attempt_at");

  const nextAttemptAtValue = row?.next_attempt_at;

  return nextAttemptAtValue === null || nextAttemptAtValue === undefined
    ? null
    : new Date(nextAttemptAtValue);
}

async function finalizeCampaignDispatch(campaignId: string): Promise<void> {
  if (await hasProcessingRecipients(campaignId)) {
    return;
  }

  if (await hasReadyPendingRecipients(campaignId)) {
    const immediateJobId = createImmediateDispatchJobId(campaignId);
    await emailSendingQueue.add(
      immediateJobId,
      { campaignId },
      {
        jobId: immediateJobId,
      },
    );

    return;
  }

  const nextAttemptAt = await getNextRetryAt(campaignId);

  if (nextAttemptAt) {
    await emailSendingQueue.remove(getDispatchSeedJobId(campaignId));
    await emailSendingQueue.add(
      getDispatchSeedJobId(campaignId),
      { campaignId },
      {
        jobId: getDispatchSeedJobId(campaignId),
        delay: Math.max(0, nextAttemptAt.getTime() - Date.now()),
      },
    );

    return;
  }

  await db("campaigns").where({ id: campaignId }).update({ status: "sent" });
}

function stringifyFailureReason(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown email sending failure";
  }
}

async function processRecipientChunk(
  campaignId: string,
  recipients: ClaimedRecipient[],
  sendEmail: (recipientId: string) => Promise<void>,
): Promise<void> {
  await Promise.all(
    recipients.map(async ({ recipientId, attemptCount }) => {
      try {
        await sendEmail(recipientId);
        await markRecipientSent(campaignId, recipientId);
      } catch (error) {
        const message = stringifyFailureReason(error);

        if (attemptCount >= env.EMAIL_SEND_MAX_ATTEMPTS) {
          await markRecipientFailed(campaignId, recipientId, message);

          return;
        }

        await markRecipientForRetry(
          campaignId,
          recipientId,
          message,
          new Date(Date.now() + env.EMAIL_SEND_RETRY_DELAY_MS),
        );
      }
    }),
  );
}

export async function processCampaignDispatchJob(
  job: Job<CampaignDispatchJobData>,
  opts?: {
    sendEmail?: (recipientId: string) => Promise<void>;
  },
): Promise<void> {
  const { campaignId } = job.data;
  const sendEmail = opts?.sendEmail ?? simulateSendEmail;

  await db("campaigns")
    .where({ id: campaignId, status: "scheduled" })
    .update({ status: "sending" });

  const claimedRecipients = await claimRecipientBatch(campaignId, EMAIL_SEND_BATCH_SIZE);

  if (claimedRecipients.length === 0) {
    await finalizeCampaignDispatch(campaignId);

    return;
  }

  try {
    for (let i = 0; i < claimedRecipients.length; i += EMAIL_SEND_CONCURRENCY_PER_CAMPAIGN) {
      const chunk = claimedRecipients.slice(i, i + EMAIL_SEND_CONCURRENCY_PER_CAMPAIGN);
      await processRecipientChunk(campaignId, chunk, sendEmail);
    }
  } catch (error) {
    await resetClaimedRecipients(
      campaignId,
      claimedRecipients.map((recipient) => recipient.recipientId),
    );
    throw error;
  }

  await finalizeCampaignDispatch(campaignId);
}

export function createEmailSendingWorker(): Worker {
  return new Worker<CampaignDispatchJobData>(
    "email-sending",
    async (job: Job<CampaignDispatchJobData>) => processCampaignDispatchJob(job),
    { connection: redisConnection, concurrency: 10 },
  );
}
