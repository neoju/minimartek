import type { ConnectionOptions } from "bullmq";
import { env } from "@/config/env.js";

export const redisConnection: ConnectionOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
};
