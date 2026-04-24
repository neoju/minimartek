import knex from "knex";
import type { Knex } from "knex";
import { knexConfigs } from "@/db/config.js";
import { env } from "@/config/env.js";

const configuration = knexConfigs[env.NODE_ENV] ?? knexConfigs.development;

export const db: Knex = knex(configuration as Knex.Config);
