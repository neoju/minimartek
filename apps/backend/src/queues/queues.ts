import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import { env } from "@/config/env.js";
import { redisConnection } from "@/queues/connection.js";

export interface CampaignDispatchJobData {
  campaignId: string;
}

const emailJobOptions = {
  attempts: env.EMAIL_SEND_MAX_ATTEMPTS,
  backoff: { type: "fixed", delay: env.EMAIL_SEND_RETRY_DELAY_MS },
  removeOnComplete: 100,
  removeOnFail: 100,
};

export const emailSendingQueue = new Queue<CampaignDispatchJobData>("email-sending", {
  connection: redisConnection,
  defaultJobOptions: emailJobOptions,
});

export function getDispatchSeedJobId(campaignId: string): string {
  return `campaign-dispatch__${campaignId}`;
}

export function createImmediateDispatchJobId(campaignId: string): string {
  return `campaign-dispatch__immediate__${campaignId}__${randomUUID()}`;
}
