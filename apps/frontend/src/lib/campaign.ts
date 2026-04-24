export const STATUS_BADGE_CLASS: Record<string, string> = {
  draft: "bg-gray-200 text-gray-800 border-transparent hover:bg-gray-200",
  scheduled: "bg-blue-100 text-blue-800 border-transparent hover:bg-blue-100",
  sending: "bg-yellow-100 text-yellow-800 border-transparent hover:bg-yellow-100",
  sent: "bg-green-100 text-green-800 border-transparent hover:bg-green-100",
};

export function getStatusBadgeClass(status: string): string {
  return STATUS_BADGE_CLASS[status] ?? "bg-gray-100 text-gray-700 border-transparent";
}

export const RECIPIENT_STATUS_BADGE_CLASS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700 border-transparent hover:bg-gray-100",
  sent: "bg-green-100 text-green-800 border-transparent hover:bg-green-100",
  failed: "bg-red-100 text-red-800 border-transparent hover:bg-red-100",
};

export function getRecipientStatusBadgeClass(status: string): string {
  return RECIPIENT_STATUS_BADGE_CLASS[status] ?? "bg-gray-100 text-gray-700 border-transparent";
}

export const SCHEDULED_POLLING_LEAD_MS = 5 * 60 * 1000;

export function shouldPollCampaign(
  status: string | undefined,
  scheduledAt: string | null | undefined,
): boolean {
  if (status === "sending") {
    return true;
  }

  if (status === "scheduled" && scheduledAt) {
    const delta = new Date(scheduledAt).getTime() - Date.now();

    return delta <= SCHEDULED_POLLING_LEAD_MS && delta >= -SCHEDULED_POLLING_LEAD_MS;
  }

  return false;
}
