import { z } from "zod";
import { PaginationQuerySchema, SortOrderSchema } from "./common.js";

export const CampaignStatusSchema = z.enum(["draft", "scheduled", "sending", "sent"]);
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;

export const CampaignRecipientStatusSchema = z.enum(["pending", "sent", "failed"]);
export type CampaignRecipientStatus = z.infer<typeof CampaignRecipientStatusSchema>;

export const CreateCampaignRequestSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  recipient_emails: z.array(z.string().email()).min(1).max(1000),
});
export type CreateCampaignRequest = z.infer<typeof CreateCampaignRequestSchema>;

export const UpdateCampaignRequestSchema = CreateCampaignRequestSchema.partial();
export type UpdateCampaignRequest = z.infer<typeof UpdateCampaignRequestSchema>;

export const ScheduleCampaignRequestSchema = z.object({
  scheduled_at: z.string().datetime(),
});
export type ScheduleCampaignRequest = z.infer<typeof ScheduleCampaignRequestSchema>;

export const CampaignResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  subject: z.string(),
  body: z.string(),
  status: CampaignStatusSchema,
  scheduled_at: z.string().datetime().nullable(),
  created_by: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type CampaignResponse = z.infer<typeof CampaignResponseSchema>;

export type CampaignListItem = Omit<CampaignResponse, "created_by" | "updated_at"> & {
  recipient_count: number;
};

export interface PaginatedCampaignList {
  items: CampaignListItem[];
  page: number;
  page_size: number;
  total: number;
}

export const CampaignStatsResponseSchema = z.object({
  status: CampaignStatusSchema,
  scheduled_at: z.string().datetime().nullable(),
  total: z.number().int(),
  sent: z.number().int(),
  failed: z.number().int(),
  opened: z.number().int(),
  open_rate: z.number(),
  send_rate: z.number(),
});
export type CampaignStatsResponse = z.infer<typeof CampaignStatsResponseSchema>;

export const CampaignRecipientSortBySchema = z.enum(["name", "email", "status", "sent_at"]);
export type CampaignRecipientSortBy = z.infer<typeof CampaignRecipientSortBySchema>;

export const CampaignRecipientListQuerySchema = PaginationQuerySchema.extend({
  sort_by: CampaignRecipientSortBySchema.default("name"),
  sort_order: SortOrderSchema.default("asc"),
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().min(1).max(200).optional(),
  status: CampaignRecipientStatusSchema.optional(),
});
export type CampaignRecipientListQuery = z.infer<typeof CampaignRecipientListQuerySchema>;

export interface CampaignRecipientListItem {
  recipient_id: string;
  name: string;
  email: string;
  status: CampaignRecipientStatus;
  sent_at: string | null;
  last_error_message: string | null;
}

export interface PaginatedCampaignRecipientList {
  items: CampaignRecipientListItem[];
  page: number;
  page_size: number;
  total: number;
}
