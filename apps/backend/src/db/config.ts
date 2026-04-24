import type { Knex } from "knex";
import { env } from "@/config/env.js";

const connection = {
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
};

export const knexConfigs: Record<string, Knex.Config> = {
  development: {
    client: "pg",
    connection,
    migrations: { directory: "./migrations", extension: "ts" },
    seeds: { directory: "./seeds", extension: "ts" },
  },
  test: {
    client: "pg",
    connection: {
      ...connection,
      database: process.env.DB_NAME_TEST ?? `${connection.database}_test`,
    },
    migrations: { directory: "./migrations", extension: "ts" },
    seeds: { directory: "./seeds", extension: "ts" },
  },
  production: {
    client: "pg",
    connection,
    pool: { min: 2, max: 10 },
    migrations: { directory: "./migrations", extension: "js" },
  },
};
