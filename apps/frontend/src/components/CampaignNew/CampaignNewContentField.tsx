import type { ChangeEvent } from "react";
import { Label } from "@/components/ui/label";
import type { CampaignNewFormData, CampaignNewValidationErrors } from "./types";

interface CampaignNewContentFieldProps {
  formData: CampaignNewFormData;
  validationErrors: CampaignNewValidationErrors;
  onInputChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

export function CampaignNewContentField({
  formData,
  validationErrors,
  onInputChange,
}: CampaignNewContentFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="body" className={validationErrors.body ? "text-red-500" : ""}>
        Email Content
      </Label>
      <textarea
        id="body"
        className={`flex min-h-50 w-full rounded-md border ${
          validationErrors.body ? "border-red-500" : "border-input"
        } bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50`}
        placeholder="Write your email content here..."
        required
        value={formData.body}
        onChange={onInputChange}
      />
      {validationErrors.body && <p className="text-xs text-red-500">{validationErrors.body[0]}</p>}
    </div>
  );
}
