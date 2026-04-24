import type { Knex } from "knex";
import { onUpdateTrigger } from "../knexfile.js";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION on_update_timestamp()
    RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
  $$ language 'plpgsql';
  `);

  // Required for GIN trigram indexes used by ILIKE '%term%' searches on recipients.name / email
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

  await knex.schema
    .createTable("users", (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("uuidv7()"));
      table.string("email", 255).notNullable().unique();
      table.string("name", 120).notNullable();
      table.string("password_hash", 255).notNullable();
      table.timestamps(true, true);
    })
    .then(() => knex.raw(onUpdateTrigger("users")));

  await knex.schema
    .createTable("recipients", (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("uuidv7()"));
      table.string("email", 255).notNullable().unique();
      table.string("name", 120).notNullable();
      table.timestamps(true, true);
    })
    .then(() => knex.raw(onUpdateTrigger("recipients")))
    .then(() =>
      knex.raw(`CREATE INDEX recipients_name_trgm_idx ON recipients USING GIN (name gin_trgm_ops)`),
    )
    .then(() =>
      knex.raw(
        `CREATE INDEX recipients_email_trgm_idx ON recipients USING GIN (email gin_trgm_ops)`,
      ),
    )
    .then(() => knex.raw(`CREATE INDEX recipients_name_idx ON recipients (name)`));

  await knex.schema
    .createTable("campaigns", (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("uuidv7()"));
      table.string("name", 200).notNullable();
      table.string("subject", 255).notNullable();
      table.text("body").notNullable();
      table
        .enu("status", ["draft", "scheduled", "sending", "sent"], {
          useNative: true,
          enumName: "campaign_status",
        })
        .notNullable()
        .defaultTo("draft");
      table.timestamp("scheduled_at", { useTz: true }).nullable();
      table.timestamp("deleted_at", { useTz: true }).nullable();
      table.uuid("created_by").notNullable().references("id").inTable("users").onDelete("RESTRICT");
      table.timestamps(true, true);

      // Indexes:
      // - composite (created_by, status) covers "my campaigns" and "my drafts"
      // - partial covering index optimizes active campaign listing by owner ordered by newest first
      // - partial index on scheduled_at only for rows awaiting dispatch (scheduler worker hot path)
      table.index(["created_by", "status"], "campaigns_owner_status_idx");
      table.index(["scheduled_at"], "campaigns_scheduled_due_idx", {
        predicate: knex.whereRaw("status = 'scheduled'"),
      });
    })
    .then(() => knex.raw(onUpdateTrigger("campaigns")))
    .then(() =>
      knex.raw(`
        CREATE INDEX campaigns_owner_active_created_at_idx
        ON campaigns (created_by, created_at DESC, id)
        INCLUDE (name, subject, status)
        WHERE deleted_at IS NULL
      `),
    );

  await knex.schema.createTable("campaign_recipients", (table) => {
    table
      .uuid("campaign_id")
      .notNullable()
      .references("id")
      .inTable("campaigns")
      .onDelete("CASCADE");
    table
      .uuid("recipient_id")
      .notNullable()
      .references("id")
      .inTable("recipients")
      .onDelete("CASCADE");
    table.timestamp("sent_at", { useTz: true }).nullable();
    table.timestamp("opened_at", { useTz: true }).nullable();
    table.integer("attempt_count").notNullable().defaultTo(0);
    table.text("last_error_message").nullable();
    table.timestamp("last_attempt_at", { useTz: true }).nullable();
    table.timestamp("next_attempt_at", { useTz: true }).nullable();
    table
      .enu("status", ["pending", "processing", "sent", "failed"], {
        useNative: true,
        enumName: "campaign_recipient_status",
      })
      .notNullable()
      .defaultTo("pending");

    // Indexes:
    // - composite PK prevents duplicate (campaign, recipient) pairs and supports campaign-scoped scans
    // - reverse lookup (all campaigns a recipient received)
    // - campaign/status/next_attempt_at covers campaign-scoped status filters and retry scheduling
    // - partial pending index keeps the dispatch hot path smaller by indexing only pending rows
    table.primary(["campaign_id", "recipient_id"]);
    table.index(["recipient_id"], "campaign_recipients_recipient_id_idx");
    table.index(
      ["campaign_id", "status", "next_attempt_at"],
      "campaign_recipients_campaign_status_idx",
    );
    table.index(
      ["campaign_id", "next_attempt_at", "recipient_id"],
      "campaign_recipients_pending_due_idx",
      {
        predicate: knex.whereRaw("status = 'pending'"),
      },
    );
    table.index(["campaign_id", "sent_at"], "campaign_recipients_campaign_sent_at_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("campaign_recipients");
  await knex.schema.dropTableIfExists("campaigns");
  await knex.schema.dropTableIfExists("recipients");
  await knex.schema.dropTableIfExists("users");
  await knex.raw("DROP TYPE IF EXISTS campaign_recipient_status");
  await knex.raw("DROP TYPE IF EXISTS campaign_status");
  await knex.raw("DROP FUNCTION IF EXISTS on_update_timestamp() CASCADE");
  await knex.raw("DROP EXTENSION IF EXISTS pg_trgm");
}
