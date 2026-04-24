import "dotenv/config";
import { z } from "zod";

const DEFAULT_JWT_SECRET = "dev-secret-change-me";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3001),

    DB_HOST: z.string().default("localhost"),
    DB_PORT: z.coerce.number().int().positive().default(5432),
    DB_USER: z.string().default("postgres"),
    DB_PASSWORD: z.string().default("postgres"),
    DB_NAME: z.string().default("mini_martech"),

    JWT_SECRET: z.string().min(8).default(DEFAULT_JWT_SECRET),
    JWT_EXPIRES_IN: z
      .string()
      .regex(/^\d+[smhd]$/, "JWT_EXPIRES_IN must be a number followed by s, m, h, or d (e.g. 1h)")
      .default("1h"),

    REDIS_HOST: z.string().default("localhost"),
    REDIS_PORT: z.coerce.number().int().positive().default(6379),

    EMAIL_SEND_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(3),
    EMAIL_SEND_RETRY_DELAY_MS: z.coerce.number().int().min(0).default(5000),
    EMAIL_SEND_FAILURE_RATE: z.coerce
      .number()
      .min(0)
      .max(1)
      .default(process.env.NODE_ENV === "test" ? 0 : 0.2),
    // A recipient stuck in `processing` for longer than this is treated as orphaned
    // (worker crashed mid-batch) and reclaimed back to `pending` by the stalled reclaimer.
    EMAIL_SEND_STALLED_TIMEOUT_MS: z.coerce.number().int().min(1000).default(120000),
    // How often the stalled reclaimer sweeps. 0 disables it.
    EMAIL_SEND_RECLAIM_INTERVAL_MS: z.coerce.number().int().min(0).default(60000),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production" && value.JWT_SECRET === DEFAULT_JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_SECRET"],
        message: "JWT_SECRET must be overridden in production",
      });
    }
  });

export const env = envSchema.parse(process.env);
export type Env = typeof env;
