import { createApp } from "@/app.js";
import { db } from "@/db/knex.js";
import { env } from "@/config/env.js";
import { startStalledRecipientReclaimer, startWorkers } from "@/queues/index.js";

const app = createApp(db);
const { emailSendingWorker } = startWorkers();
const stalledReclaimer = startStalledRecipientReclaimer(db);

const server = app.listen(env.PORT, () => {
  console.log(`[backend] listening on :${env.PORT} (${env.NODE_ENV})`);
});

void stalledReclaimer.runNow();

async function shutdown() {
  server.close();
  await emailSendingWorker.close();
  stalledReclaimer.stop();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
