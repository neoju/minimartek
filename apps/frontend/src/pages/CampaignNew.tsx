import { useState, type ChangeEvent, type SubmitEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useSWRConfig } from "swr";
import {
  CreateCampaignRequestSchema,
  type CampaignResponse,
  type CreateCampaignRequest,
} from "@repo/dto";
import { useMutation } from "@/lib/api-client";
import { CampaignNewForm } from "@/components/CampaignNew/CampaignNewForm";
import { CampaignNewHeader } from "@/components/CampaignNew/CampaignNewHeader";
import type {
  CampaignNewFormData,
  CampaignNewValidationErrors,
} from "@/components/CampaignNew/types";

export default function CampaignNewPage() {
  const navigate = useNavigate();
  const { mutate } = useSWRConfig();

  const [formData, setFormData] = useState<CampaignNewFormData>({
    name: "",
    subject: "",
    body: "",
    recipientEmails: [],
  });

  const [validationErrors, setValidationErrors] = useState<CampaignNewValidationErrors>({});

  const { trigger, isMutating } = useMutation<CampaignResponse, CreateCampaignRequest>(
    "/campaigns",
    {
      onSuccess: (data) => {
        void mutate("/campaigns");
        navigate(`/campaigns/${data.id}`);
      },
    },
  );

  const handleInputChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = event.target;

    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleRecipientEmailsChange = (emails: string[]) => {
    setFormData((prev) => ({ ...prev, recipientEmails: emails }));
  };

  const handleCancel = () => {
    navigate("/campaigns");
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationErrors({});

    const payload: CreateCampaignRequest = {
      name: formData.name,
      subject: formData.subject,
      body: formData.body,
      recipient_emails: formData.recipientEmails,
    };

    const result = CreateCampaignRequestSchema.safeParse(payload);

    if (!result.success) {
      setValidationErrors(result.error.flatten().fieldErrors as CampaignNewValidationErrors);

      return;
    }

    try {
      await trigger(payload);
    } catch (error) {
      console.error("Failed to create campaign:", error);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <CampaignNewHeader onBack={handleCancel} />
      <CampaignNewForm
        formData={formData}
        isSubmitting={isMutating}
        validationErrors={validationErrors}
        onCancel={handleCancel}
        onInputChange={handleInputChange}
        onRecipientEmailsChange={handleRecipientEmailsChange}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
