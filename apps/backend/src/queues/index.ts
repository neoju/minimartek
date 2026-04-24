import { createEmailSendingWorker } from "@/queues/workers/email-sending.js";
export {
  startStalledRecipientReclaimer,
  runReclaimerOnce,
  reclaimStalledRecipients,
} from "@/queues/workers/stalled-reclaimer.js";

export { emailSendingQueue } from "@/queues/queues.js";

export function startWorkers() {
  return {
    emailSendingWorker: createEmailSendingWorker(),
  };
}
