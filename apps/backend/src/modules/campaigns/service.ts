import type { Knex } from "knex";
import { normalizeEmail } from "@repo/utils";
import { HttpError } from "@/lib/http-error.js";
import type { Campaign, CampaignRecipient, Recipient } from "@/types/db.js";
import type {
  CreateCampaignRequest,
  UpdateCampaignRequest,
  ScheduleCampaignRequest,
  CampaignStatsResponse,
  PaginatedCampaignList,
  CampaignRecipientListQuery,
  CampaignRecipientSortBy,
  PaginatedCampaignRecipientList,
} from "@repo/dto";
import { emailSendingQueue, getDispatchSeedJobId } from "@/queues/queues.js";
import { serializeCampaignRecipientListItem } from "@/modules/campaigns/serialize.js";

interface StatsRow {
  total: string | number;
  sent: string | number;
  failed: string | number;
  opened: string | number;
}

type CampaignListRow = Partial<Campaign> & { recipient_count: string | number };

export class CampaignService {
  constructor(private readonly db: Knex) { }

  async listCampaigns(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedCampaignList> {
    const offset = (page - 1) * pageSize;

    const [rows, countResult] = await Promise.all([
      this.ownedActiveCampaignsQuery(this.db, userId)
        .leftJoin("campaign_recipients as cr", "cr.campaign_id", "campaigns.id")
        .groupBy("campaigns.id")
        .select<CampaignListRow[]>(
          //
          "campaigns.id as id",
          "campaigns.name as name",
          "campaigns.subject as subject",
          "campaigns.body as body",
          "campaigns.status as status",
          "campaigns.scheduled_at as scheduled_at",
          "campaigns.created_at as created_at",
          this.db.raw("count(cr.recipient_id) as recipient_count"),
        )
        .orderBy("campaigns.created_at", "desc")
        .offset(offset)
        .limit(pageSize),
      this.ownedActiveCampaignsQuery(this.db, userId)
        .count("* as count")
        .first<{ count: string | number }>(),
    ]);

    const items = rows.map((row) => ({
      id: row.id,
      name: row.name,
      subject: row.subject,
      body: row.body,
      status: row.status,
      recipient_count: Number(row.recipient_count ?? 0),
      scheduled_at: row.scheduled_at?.toISOString() ?? null,
      created_at: row.created_at!.toISOString(),
    })) as PaginatedCampaignList["items"];

    return {
      items,
      page,
      page_size: pageSize,
      total: Number(countResult?.count ?? 0),
    };
  }

  async createCampaign(userId: string, input: CreateCampaignRequest): Promise<Campaign> {
    let createdCampaign: Campaign | undefined;
    const recipientEmails = Array.isArray(input.recipient_emails) ? input.recipient_emails : [];

    await this.db.transaction(async (trx) => {
      const [campaign] = await trx<Campaign>("campaigns")
        .insert({
          name: input.name,
          subject: input.subject,
          body: input.body,
          created_by: userId,
        })
        .returning("*");

      if (!campaign) {
        throw new HttpError(500, "CREATE_FAILED", "Failed to create campaign");
      }

      createdCampaign = campaign;

      const recipientIds = await this.materializeCampaignRecipients(trx, recipientEmails);

      if (recipientIds.length > 0) {
        await trx("campaign_recipients").insert(
          recipientIds.map((recipientId) => ({
            campaign_id: campaign.id,
            recipient_id: recipientId,
            status: "pending",
          })),
        );
      }
    });

    return createdCampaign!;
  }

  async getCampaignById(userId: string, campaignId: string) {
    const campaign = await this.getOwnedActiveCampaign(userId, campaignId);

    return campaign;
  }

  async getStats(userId: string, campaignId: string): Promise<CampaignStatsResponse> {
    const campaign = await this.getOwnedActiveCampaign(userId, campaignId);

    const stats = await this.db("campaign_recipients")
      .where({ campaign_id: campaignId })
      .select(
        this.db.raw("count(*) as total"),
        this.db.raw("count(*) filter (where status = 'sent') as sent"),
        this.db.raw("count(*) filter (where status = 'failed') as failed"),
        this.db.raw("count(*) filter (where opened_at is not null) as opened"),
      )
      .first<StatsRow>();

    if (!stats) {
      throw new HttpError(500, "STATS_QUERY_FAILED", "Failed to retrieve campaign stats");
    }

    const total = Number(stats.total ?? 0);
    const sent = Number(stats.sent ?? 0);
    const failed = Number(stats.failed ?? 0);
    const opened = Number(stats.opened ?? 0);

    return {
      status: campaign.status,
      scheduled_at: campaign.scheduled_at?.toISOString() ?? null,
      total,
      sent,
      failed,
      opened,
      open_rate: total > 0 ? Math.round((opened / total) * 10000) / 100 : 0,
      send_rate: total > 0 ? Math.round((sent / total) * 10000) / 100 : 0,
    };
  }

  async listCampaignRecipients(
    userId: string,
    campaignId: string,
    query: CampaignRecipientListQuery,
  ): Promise<PaginatedCampaignRecipientList> {
    await this.getOwnedActiveCampaign(userId, campaignId);

    const { page, page_size: pageSize, sort_by: sortBy, sort_order: sortOrder } = query;
    const offset = (page - 1) * pageSize;

    const baseQuery = () => {
      const q = this.db("campaign_recipients as cr")
        .innerJoin("recipients as r", "r.id", "cr.recipient_id")
        .where("cr.campaign_id", campaignId)
        .whereNot("cr.status", "processing");

      if (query.name) {
        q.whereILike("r.name", `%${query.name}%`);
      }

      if (query.email) {
        q.whereILike("r.email", `%${query.email}%`);
      }

      if (query.status) {
        q.where("cr.status", query.status);
      }

      return q;
    };

    const SORT_COLUMNS: Record<CampaignRecipientSortBy, string> = {
      name: "r.name",
      email: "r.email",
      status: "cr.status",
      sent_at: "cr.sent_at",
    };

    type Row = Pick<
      CampaignRecipient,
      "recipient_id" | "status" | "sent_at" | "last_error_message"
    > &
      Pick<Recipient, "name" | "email">;

    const [rows, countResult] = await Promise.all([
      baseQuery()
        .select<Row[]>(
          //
          "cr.recipient_id as recipient_id",
          "cr.status as status",
          "cr.sent_at as sent_at",
          "cr.last_error_message as last_error_message",
          "r.name as name",
          "r.email as email",
        )
        .orderBy(SORT_COLUMNS[sortBy], sortOrder)
        .orderBy("r.id", "asc")
        .offset(offset)
        .limit(pageSize),
      baseQuery().count("* as count").first<{ count: string | number }>(),
    ]);

    const items = rows.map((row) =>
      serializeCampaignRecipientListItem({
        recipient_id: row.recipient_id,
        name: row.name,
        email: row.email,
        status: row.status as Exclude<CampaignRecipient["status"], "processing">,
        sent_at: row.sent_at,
        last_error_message: row.last_error_message,
      }),
    );

    return {
      items,
      page,
      page_size: pageSize,
      total: Number(countResult?.count ?? 0),
    };
  }

  async updateCampaign(
    userId: string,
    campaignId: string,
    input: UpdateCampaignRequest,
  ): Promise<Campaign> {
    let updatedCampaign: Campaign | undefined;

    await this.db.transaction(async (trx) => {
      const campaign = await this.getOwnedActiveCampaignForUpdate(trx, userId, campaignId);

      this.assertDraftOnlyAction(campaign, "update");

      const { recipient_emails, ...scalarFields } = input;

      const hasScalarUpdates =
        scalarFields.name !== undefined ||
        scalarFields.subject !== undefined ||
        scalarFields.body !== undefined;

      const recipientsChanged = recipient_emails !== undefined;

      const updatePayload: Partial<Campaign> = { ...scalarFields };

      if (recipientsChanged) {
        updatePayload.status = "draft";
      }

      if (!hasScalarUpdates && !recipientsChanged) {
        updatedCampaign = campaign;

        return;
      }

      const [updated] = await this.ownedActiveCampaignsQuery(trx, userId)
        .where({ id: campaignId })
        .update(updatePayload)
        .returning("*");

      if (!updated) {
        throw new HttpError(500, "UPDATE_FAILED", "Failed to update campaign");
      }

      updatedCampaign = updated as Campaign;

      if (recipientsChanged) {
        const desiredIds = new Set(await this.materializeCampaignRecipients(trx, recipient_emails || []));

        const existingRows = await trx("campaign_recipients")
          .where({ campaign_id: campaignId })
          .select<{ recipient_id: string }[]>("recipient_id");
        const existingIds = new Set(existingRows.map((row) => row.recipient_id));

        const toAdd = [...desiredIds].filter((id) => !existingIds.has(id));
        const toRemove = [...existingIds].filter((id) => !desiredIds.has(id));

        if (toRemove.length > 0) {
          await trx("campaign_recipients")
            .where({ campaign_id: campaignId })
            .whereIn("recipient_id", toRemove)
            .del();
        }

        if (toAdd.length > 0) {
          await trx("campaign_recipients").insert(
            toAdd.map((recipientId) => ({
              campaign_id: campaignId,
              recipient_id: recipientId,
              status: "pending",
            })),
          );
        }
      }
    });

    return updatedCampaign!;
  }

  async deleteCampaign(userId: string, campaignId: string): Promise<void> {
    const campaign = await this.getOwnedActiveCampaign(userId, campaignId);

    this.assertDraftOnlyAction(campaign, "delete");

    const updatedCount = await this.ownedActiveCampaignsQuery(this.db, userId)
      .where({ id: campaignId })
      .update({ deleted_at: this.db.fn.now() });

    if (Number(updatedCount) === 0) {
      throw new HttpError(500, "DELETE_FAILED", "Failed to delete campaign");
    }
  }

  async scheduleCampaign(
    userId: string,
    campaignId: string,
    input: ScheduleCampaignRequest,
  ): Promise<Campaign> {
    const scheduledAt = new Date(input.scheduled_at);
    let updatedCampaign: Campaign | undefined;

    if (scheduledAt <= new Date()) {
      throw new HttpError(400, "PAST_SCHEDULED_AT", "scheduled_at must be a future timestamp");
    }

    await this.db.transaction(async (trx) => {
      const campaign = await this.getOwnedActiveCampaignForUpdate(trx, userId, campaignId);

      this.assertDraftOnlyAction(campaign, "schedule");

      const [updated] = await this.ownedActiveCampaignsQuery(trx, userId)
        .where({ id: campaignId })
        .update({ status: "scheduled", scheduled_at: scheduledAt })
        .returning("*");

      if (!updated) {
        throw new HttpError(500, "SCHEDULE_FAILED", "Failed to schedule campaign");
      }

      updatedCampaign = updated as Campaign;
    });

    const delay = scheduledAt.getTime() - Date.now();
    await emailSendingQueue.add(
      getDispatchSeedJobId(campaignId),
      { campaignId },
      {
        jobId: getDispatchSeedJobId(campaignId),
        delay,
      },
    );

    return updatedCampaign!;
  }

  async sendCampaign(userId: string, campaignId: string): Promise<Campaign> {
    let updatedCampaign: Campaign | undefined;

    await this.db.transaction(async (trx) => {
      const campaign = await this.getOwnedActiveCampaignForUpdate(trx, userId, campaignId);

      if (campaign.status === "sent") {
        throw new HttpError(409, "CAMPAIGN_BUSY", "Campaign is still being processed, please wait");
      }

      if (campaign.status === "sending") {
        throw new HttpError(409, "CAMPAIGN_BUSY", "Campaign is still being processed, please wait");
      }

      if (campaign.status !== "draft" && campaign.status !== "scheduled") {
        throw new HttpError(403, "CANNOT_SEND", "Cannot send a campaign in its current status");
      }

      if (campaign.status === "scheduled") {
        await emailSendingQueue.remove(getDispatchSeedJobId(campaignId));
      }

      const [updated] = await this.ownedActiveCampaignsQuery(trx, userId)
        .where({ id: campaignId })
        .update({ status: "sending", scheduled_at: null })
        .returning("*");

      if (!updated) {
        throw new HttpError(500, "SEND_FAILED", "Failed to initiate send");
      }

      updatedCampaign = updated as Campaign;
    });

    await emailSendingQueue.add(
      getDispatchSeedJobId(campaignId),
      { campaignId },
      {
        jobId: getDispatchSeedJobId(campaignId),
      },
    );

    return updatedCampaign!;
  }

  private async materializeCampaignRecipients(
    trx: Knex.Transaction,
    emails: string[],
  ): Promise<string[]> {
    const cleaned = Array.from(new Set(emails.map(normalizeEmail)));

    if (cleaned.length === 0) {
      return [];
    }

    // Upsert recipients: insert any missing emails with name defaulting to email.
    // ON CONFLICT DO UPDATE with a no-op on `email` ensures RETURNING includes pre-existing rows too.
    const result = await trx.raw<{ rows: { id: string }[] }>(
      `INSERT INTO recipients (email, name)
       SELECT unnest(?::text[]), unnest(?::text[])
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      [cleaned, cleaned],
    );

    return result.rows.map((row) => row.id);
  }

  private ownedActiveCampaignsQuery(db: Knex | Knex.Transaction, userId: string) {
    return db("campaigns").where({ created_by: userId }).whereNull("deleted_at");
  }

  private async getOwnedActiveCampaign(userId: string, campaignId: string): Promise<Campaign> {
    const campaign = await this.ownedActiveCampaignsQuery(this.db, userId)
      .where({ id: campaignId })
      .first();

    if (!campaign) {
      throw new HttpError(404, "NOT_FOUND", "Campaign not found");
    }

    return campaign;
  }

  private async getOwnedActiveCampaignForUpdate(
    trx: Knex.Transaction,
    userId: string,
    campaignId: string,
  ): Promise<Campaign> {
    const campaign = await this.ownedActiveCampaignsQuery(trx, userId)
      .where({ id: campaignId })
      .forUpdate()
      .first();

    if (!campaign) {
      throw new HttpError(404, "NOT_FOUND", "Campaign not found");
    }

    return campaign;
  }

  private assertDraftOnlyAction(
    campaign: Campaign,
    action: "update" | "delete" | "schedule",
  ): void {
    if (campaign.status === "sending") {
      throw new HttpError(
        409,
        "CAMPAIGN_BUSY",
        `Cannot ${action} campaign while it is being processed`,
      );
    }

    if (campaign.status !== "draft") {
      throw new HttpError(
        403,
        "CAMPAIGN_NOT_DRAFT",
        `Cannot ${action} a campaign that is not in draft status`,
      );
    }
  }
}
