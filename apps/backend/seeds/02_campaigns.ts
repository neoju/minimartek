import type { Knex } from "knex";
import bcrypt from "bcryptjs";

const SEED_USER_EMAIL = "seed@example.com";
const SEED_USER_NAME = "Seed User";
const SEED_USER_PASSWORD = "password123";

const SUBJECTS = [
  "Welcome to our newsletter",
  "Exclusive offer just for you",
  "Your weekly digest",
  "Don't miss out on this deal",
  "Important update from us",
  "New features you'll love",
  "Special announcement",
  "Your account summary",
  "Limited time offer",
  "We miss you!",
];

const BODIES = [
  "<p>Hello {{name}}, welcome to our platform! We're excited to have you on board.</p>",
  "<p>Hi {{name}}, we have an exclusive offer just for you. Check it out now!</p>",
  "<p>Dear {{name}}, here is your weekly digest of the latest news and updates.</p>",
  "<p>Hey {{name}}, don't miss out on this limited-time deal. Act fast!</p>",
  "<p>Hello {{name}}, we have an important update to share with you today.</p>",
];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length]!;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function seed(knex: Knex): Promise<void> {
  await knex("campaign_recipients").del();
  await knex("campaigns").del();

  let [user] = await knex("users").where({ email: SEED_USER_EMAIL }).select("id");
  if (!user) {
    const password_hash = await bcrypt.hash(SEED_USER_PASSWORD, 10);
    [user] = await knex("users")
      .insert({ email: SEED_USER_EMAIL, name: SEED_USER_NAME, password_hash })
      .returning("id");
  }
  const userId: string = user.id;

  const recipientRows = await knex("recipients").select("id");
  const recipientIds = recipientRows.map((r: { id: string }) => r.id);

  const now = new Date();

  if (recipientIds.length === 0) {
    console.warn("No recipients found — skipping campaign seed.");
    return;
  }

  const draftCampaigns = Array.from({ length: 20 }, (_, i) => ({
    name: `Draft Campaign ${i + 1}`,
    subject: pick(SUBJECTS, i),
    body: pick(BODIES, i),
    status: "draft",
    created_by: userId,
    created_at: now,
    updated_at: now,
  }));

  const insertedDraft = await knex("campaigns").insert(draftCampaigns).returning("id");

  for (const row of insertedDraft) {
    const campaignId: string = row.id;
    const count = randomInt(5, 20);
    const start = randomInt(0, Math.max(0, recipientIds.length - count));
    const slice = recipientIds.slice(start, start + count);

    const campaignRecipients = slice.map((recipientId: string) => ({
      campaign_id: campaignId,
      recipient_id: recipientId,
      status: "pending",
      attempt_count: 0,
    }));

    if (campaignRecipients.length > 0) {
      await knex("campaign_recipients").insert(campaignRecipients);
    }
  }

  const specificCampaigns = Array.from({ length: 5 }, (_, i) => ({
    name: `Specific Campaign ${i + 1}`,
    subject: pick(SUBJECTS, i + 20),
    body: pick(BODIES, i + 20),
    status: "sent",
    created_by: userId,
    created_at: now,
    updated_at: now,
  }));

  const insertedSpecific = await knex("campaigns").insert(specificCampaigns).returning("id");

  const RECIPIENT_STATUSES = ["sent", "sent", "sent", "failed"] as const;

  for (const row of insertedSpecific) {
    const campaignId: string = row.id;
    const count = randomInt(5, 20);
    const start = randomInt(0, Math.max(0, recipientIds.length - count));
    const slice = recipientIds.slice(start, start + count);

    const campaignRecipients = slice.map((recipientId: string, idx: number) => ({
      campaign_id: campaignId,
      recipient_id: recipientId,
      status: pick([...RECIPIENT_STATUSES], idx),
      attempt_count: 1,
    }));

    if (campaignRecipients.length > 0) {
      await knex("campaign_recipients").insert(campaignRecipients);
    }
  }
}
