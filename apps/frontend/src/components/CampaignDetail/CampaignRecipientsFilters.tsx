import { useEffect, useState } from "react";
import type { CampaignRecipientStatus } from "@repo/dto";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DEBOUNCE_MS = 300;
const STATUS_ANY = "__any__";

export interface RecipientFilters {
  name?: string;
  email?: string;
  status?: CampaignRecipientStatus;
}

interface CampaignRecipientsFiltersProps {
  filters: RecipientFilters;
  onChange: (next: RecipientFilters) => void;
}

export function CampaignRecipientsFilters({ filters, onChange }: CampaignRecipientsFiltersProps) {
  const [nameDraft, setNameDraft] = useState(filters.name ?? "");
  const [emailDraft, setEmailDraft] = useState(filters.email ?? "");

  useEffect(() => {
    setNameDraft(filters.name ?? "");
  }, [filters.name]);

  useEffect(() => {
    setEmailDraft(filters.email ?? "");
  }, [filters.email]);

  useEffect(() => {
    const trimmed = nameDraft.trim();
    const current = filters.name ?? "";

    if (trimmed === current) {
      return;
    }

    const handle = window.setTimeout(() => {
      onChange({ ...filters, name: trimmed ? trimmed : undefined });
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [nameDraft, filters, onChange]);

  useEffect(() => {
    const trimmed = emailDraft.trim();
    const current = filters.email ?? "";

    if (trimmed === current) {
      return;
    }

    const handle = window.setTimeout(() => {
      onChange({ ...filters, email: trimmed ? trimmed : undefined });
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [emailDraft, filters, onChange]);

  const handleStatusChange = (value: string) => {
    if (value === STATUS_ANY) {
      onChange({ ...filters, status: undefined });

      return;
    }

    onChange({ ...filters, status: value as CampaignRecipientStatus });
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div className="space-y-1.5">
        <Label htmlFor="recipients-filter-name">Name</Label>
        <Input
          id="recipients-filter-name"
          placeholder="Filter by name"
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="recipients-filter-email">Email</Label>
        <Input
          id="recipients-filter-email"
          placeholder="Filter by email"
          value={emailDraft}
          onChange={(event) => setEmailDraft(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="recipients-filter-status">Status</Label>
        <Select value={filters.status ?? STATUS_ANY} onValueChange={handleStatusChange}>
          <SelectTrigger id="recipients-filter-status" className="w-full">
            <SelectValue placeholder="Any status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={STATUS_ANY}>Any status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
