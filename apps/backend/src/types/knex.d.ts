import { User, Recipient, Campaign, CampaignRecipient } from "@/types/db.js";

declare module "knex/types/tables.js" {
  interface Tables {
    users: User;
    recipients: Recipient;
    campaigns: Campaign;
    campaign_recipients: CampaignRecipient;
  }
}
