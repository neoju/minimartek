import { useState } from "react";
import { Shuffle, Sparkles } from "lucide-react";
import type { RandomRecipientsResponse } from "@repo/dto";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { swrFetcher } from "@/lib/api-client";
import { EmailChipsInput } from "./EmailChipsInput";
import type { CampaignNewFormData, CampaignNewValidationErrors } from "./types";

interface CampaignNewRecipientsFieldProps {
  formData: CampaignNewFormData;
  validationErrors: CampaignNewValidationErrors;
  onRecipientEmailsChange: (emails: string[]) => void;
}

const RANDOM_LIMIT = 50;
const GENERATE_LIMIT = 50;
const GENERATE_DOMAINS = ["example.com", "test.com", "mail.com", "demo.io", "sample.org"];

function mergeEmails(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing);
  const merged = [...existing];

  for (const email of incoming) {
    if (!seen.has(email)) {
      merged.push(email);
      seen.add(email);
    }
  }

  return merged;
}

function randomLocalPart(): string {
  const length = 5 + Math.floor(Math.random() * 6);
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";

  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }

  return out;
}

function generateEmails(count: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  while (out.length < count) {
    const domain = GENERATE_DOMAINS[Math.floor(Math.random() * GENERATE_DOMAINS.length)];
    const email = `${randomLocalPart()}@${domain}`;

    if (!seen.has(email)) {
      seen.add(email);
      out.push(email);
    }
  }

  return out;
}

export function CampaignNewRecipientsField({
  formData,
  validationErrors,
  onRecipientEmailsChange,
}: CampaignNewRecipientsFieldProps) {
  const [isFetchingRandom, setIsFetchingRandom] = useState(false);

  const handleRandomExisting = async () => {
    setIsFetchingRandom(true);

    try {
      const data = await swrFetcher<RandomRecipientsResponse>(
        `/recipients/random?limit=${RANDOM_LIMIT}`,
      );

      onRecipientEmailsChange(mergeEmails(formData.recipientEmails, data.emails));
    } catch (error) {
      console.error("Failed to fetch random recipients:", error);
    } finally {
      setIsFetchingRandom(false);
    }
  };

  const handleGenerate = () => {
    const generated = generateEmails(GENERATE_LIMIT);
    onRecipientEmailsChange(mergeEmails(formData.recipientEmails, generated));
  };

  return (
    <div className="space-y-2">
      <Label className={validationErrors.recipient_emails ? "text-red-500" : ""}>Recipients</Label>

      <EmailChipsInput
        emails={formData.recipientEmails}
        placeholder="Type an email and press space or enter"
        invalid={Boolean(validationErrors.recipient_emails)}
        onChange={onRecipientEmailsChange}
      />

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={handleRandomExisting}
          disabled={isFetchingRandom}
        >
          <Shuffle className="h-4 w-4" />
          {isFetchingRandom ? "Loading..." : "Random recipients (Existing)"}
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleGenerate}
            >
              <Sparkles className="h-4 w-4" />
              Generate recipients (New)
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Generates 50 random emails. Some may already exist in the system.
          </TooltipContent>
        </Tooltip>
      </div>

      {validationErrors.recipient_emails && (
        <p className="text-xs text-red-500">{validationErrors.recipient_emails[0]}</p>
      )}
    </div>
  );
}
