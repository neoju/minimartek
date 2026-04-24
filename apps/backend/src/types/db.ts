export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent";
export type SendingStatus = "pending" | "processing" | "sent" | "failed";

export interface User {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
}

export interface Recipient {
  id: string;
  email: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  body: string;
  status: CampaignStatus;
  scheduled_at: Date | null;
  deleted_at: Date | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface CampaignRecipient {
  campaign_id: string;
  recipient_id: string;
  sent_at: Date | null;
  opened_at: Date | null;
  attempt_count: number;
  last_error_message: string | null;
  last_attempt_at: Date | null;
  next_attempt_at: Date | null;
  status: SendingStatus;
}
