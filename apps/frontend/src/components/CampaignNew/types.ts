import type { CreateCampaignRequest } from "@repo/dto";

export interface CampaignNewFormData {
  name: string;
  subject: string;
  body: string;
  recipientEmails: string[];
}

export type CampaignNewValidationErrors = Partial<Record<keyof CreateCampaignRequest, string[]>>;
