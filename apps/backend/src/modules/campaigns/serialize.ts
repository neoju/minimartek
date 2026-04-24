import type { CampaignRecipientListItem } from "@repo/dto";
import type { Campaign, CampaignRecipient, Recipient } from "@/types/db.js";

export function serializeCampaign(campaign: Campaign) {
  return {
    id: campaign.id,
    name: campaign.name,
    subject: campaign.subject,
    body: campaign.body,
    status: campaign.status,
    scheduled_at: campaign.scheduled_at?.toISOString() ?? null,
    created_by: campaign.created_by,
    created_at: campaign.created_at.toISOString(),
    updated_at: campaign.updated_at.toISOString(),
  };
}

type SerializableCampaignRecipientRow = Pick<
  CampaignRecipient,
  "recipient_id" | "sent_at" | "last_error_message"
> & {
  status: Exclude<CampaignRecipient["status"], "processing">;
} & Pick<Recipient, "name" | "email">;

export function serializeCampaignRecipientListItem(
  row: SerializableCampaignRecipientRow,
): CampaignRecipientListItem {
  return {
    recipient_id: row.recipient_id,
    name: row.name,
    email: row.email,
    status: row.status,
    sent_at: row.sent_at ? row.sent_at.toISOString() : null,
    last_error_message: row.status === "failed" ? row.last_error_message : null,
  };
}
