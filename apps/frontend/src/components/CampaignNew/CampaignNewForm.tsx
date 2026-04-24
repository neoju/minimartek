import type { ChangeEvent, SubmitEvent } from "react";
import { Save } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CampaignNewContentField } from "./CampaignNewContentField";
import { CampaignNewDetailsFields } from "./CampaignNewDetailsFields";
import { CampaignNewRecipientsField } from "./CampaignNewRecipientsField";
import type { CampaignNewFormData, CampaignNewValidationErrors } from "./types";

interface CampaignNewFormProps {
  formData: CampaignNewFormData;
  isSubmitting: boolean;
  validationErrors: CampaignNewValidationErrors;
  cardTitle?: string;
  cardDescription?: string;
  submitIdleLabel?: string;
  submitBusyLabel?: string;
  onCancel: () => void;
  onInputChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onRecipientEmailsChange: (emails: string[]) => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => Promise<void>;
}

export function CampaignNewForm({
  formData,
  isSubmitting,
  validationErrors,
  cardTitle = "Campaign Details",
  cardDescription = "Fill in the information below to create your new email campaign.",
  submitIdleLabel = "Save Draft",
  submitBusyLabel = "Creating...",
  onCancel,
  onInputChange,
  onRecipientEmailsChange,
  onSubmit,
}: CampaignNewFormProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{cardTitle}</CardTitle>
        <CardDescription>{cardDescription}</CardDescription>
      </CardHeader>

      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4 pb-4">
          <CampaignNewDetailsFields
            formData={formData}
            validationErrors={validationErrors}
            onInputChange={onInputChange}
          />
          <CampaignNewRecipientsField
            formData={formData}
            validationErrors={validationErrors}
            onRecipientEmailsChange={onRecipientEmailsChange}
          />
          <CampaignNewContentField
            formData={formData}
            validationErrors={validationErrors}
            onInputChange={onInputChange}
          />
        </CardContent>

        <CardFooter className="flex justify-between">
          <Button variant="outline" type="button" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} className="gap-2">
            {isSubmitting ? (
              <LoadingSpinner className="size-4 text-primary-foreground" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSubmitting ? submitBusyLabel : submitIdleLabel}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
