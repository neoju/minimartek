import { z } from "zod";

export const RandomRecipientsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type RandomRecipientsQuery = z.infer<typeof RandomRecipientsQuerySchema>;

export const RandomRecipientsResponseSchema = z.object({
  emails: z.array(z.string().email()),
});
export type RandomRecipientsResponse = z.infer<typeof RandomRecipientsResponseSchema>;
