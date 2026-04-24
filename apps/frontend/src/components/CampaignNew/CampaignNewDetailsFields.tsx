import type { ChangeEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CampaignNewFormData, CampaignNewValidationErrors } from "./types";

interface CampaignNewDetailsFieldsProps {
  formData: CampaignNewFormData;
  validationErrors: CampaignNewValidationErrors;
  onInputChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

export function CampaignNewDetailsFields({
  formData,
  validationErrors,
  onInputChange,
}: CampaignNewDetailsFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="name" className={validationErrors.name ? "text-red-500" : ""}>
          Campaign Name
        </Label>
        <Input
          id="name"
          placeholder="e.g. Summer Sale 2026"
          required
          value={formData.name}
          onChange={onInputChange}
          className={validationErrors.name ? "border-red-500" : ""}
        />
        {validationErrors.name && (
          <p className="text-xs text-red-500">{validationErrors.name[0]}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="subject" className={validationErrors.subject ? "text-red-500" : ""}>
          Email Subject
        </Label>
        <Input
          id="subject"
          placeholder="e.g. Don't miss out on our summer deals!"
          required
          value={formData.subject}
          onChange={onInputChange}
          className={validationErrors.subject ? "border-red-500" : ""}
        />
        {validationErrors.subject && (
          <p className="text-xs text-red-500">{validationErrors.subject[0]}</p>
        )}
      </div>
    </div>
  );
}
