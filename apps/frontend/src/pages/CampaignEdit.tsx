import { useEffect, useState, type ChangeEvent, type SubmitEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import {
  UpdateCampaignRequestSchema,
  type CampaignResponse,
  type PaginatedCampaignRecipientList,
  type UpdateCampaignRequest,
} from "@repo/dto";
import { ApiError, buildApiPath, swrFetcher, useQuery, usePatch } from "@/lib/api-client";
import { LoadingState } from "@/components/LoadingState";
import { Button } from "@/components/ui/button";
import { CampaignNewForm } from "@/components/CampaignNew/CampaignNewForm";
import { CampaignNewHeader } from "@/components/CampaignNew/CampaignNewHeader";
import type {
  CampaignNewFormData,
  CampaignNewValidationErrors,
} from "@/components/CampaignNew/types";

const RECIPIENTS_FETCH_PAGE_SIZE = 100;

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }

  return true;
}

export default function CampaignEditPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { mutate } = useSWRConfig();
  const campaignPath = id ? `/campaigns/${id}` : null;

  const [formData, setFormData] = useState<CampaignNewFormData>({
    name: "",
    subject: "",
    body: "",
    recipientEmails: [],
  });

  const [initialRecipientEmails, setInitialRecipientEmails] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<CampaignNewValidationErrors>({});

  useEffect(() => {
    setHydrated(false);
    setHydrationError(null);
    setFormData({ name: "", subject: "", body: "", recipientEmails: [] });
    setInitialRecipientEmails([]);
    setValidationErrors({});
  }, [id]);

  useEffect(() => {
    if (!id) {
      navigate("/not-found", { replace: true });
    }
  }, [id, navigate]);

  const { data: campaign, error, isLoading } = useQuery<CampaignResponse>(campaignPath);

  useEffect(() => {
    if (error && error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      navigate("/not-found", { replace: true });
    }
  }, [error, navigate]);

  useEffect(() => {
    if (error && !(error instanceof ApiError && (error.status === 404 || error.status === 400))) {
      toast.error(error.message || "Failed to load campaign");
    }
  }, [error]);

  useEffect(() => {
    if (!campaign || hydrated || !id) return;

    if (campaign.status !== "draft") {
      toast.error("Only draft campaigns can be edited");
      navigate(`/campaigns/${campaign.id}`, { replace: true });

      return;
    }

    let cancelled = false;

    async function hydrate() {
      let emails: string[] = [];
      let page = 1;

      while (true) {
        const path = buildApiPath(`/campaigns/${id}/recipients`, {
          page,
          page_size: RECIPIENTS_FETCH_PAGE_SIZE,
          sort_by: "email",
          sort_order: "asc",
        });

        const resp = await swrFetcher<PaginatedCampaignRecipientList>(path);

        if (cancelled) return;

        emails = emails.concat(resp.items.map((r) => r.email));

        if (resp.items.length < RECIPIENTS_FETCH_PAGE_SIZE || emails.length >= resp.total) {
          break;
        }

        page += 1;
      }

      if (cancelled || !campaign) return;

      setFormData({
        name: campaign.name,
        subject: campaign.subject,
        body: campaign.body,
        recipientEmails: emails,
      });
      setInitialRecipientEmails(emails);
      setHydrated(true);
    }

    hydrate().catch((e) => {
      if (cancelled) return;

      const message = e instanceof ApiError ? e.message : "Failed to load campaign recipients";
      setHydrationError(message);
      toast.error(message);
    });

    return () => {
      cancelled = true;
    };
  }, [campaign, hydrated, id, navigate]);

  const { trigger, isMutating } = usePatch<CampaignResponse, UpdateCampaignRequest>(campaignPath, {
    onSuccess: () => {
      toast.success("Campaign updated");
      void mutate(campaignPath);
      void mutate("/campaigns");

      if (id) navigate(`/campaigns/${id}`);
    },
  });

  const handleInputChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id: fieldId, value } = event.target;
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleRecipientEmailsChange = (emails: string[]) => {
    setFormData((prev) => ({ ...prev, recipientEmails: emails }));
  };

  const handleCancel = () => {
    if (id) {
      navigate(`/campaigns/${id}`);
    } else {
      navigate("/campaigns");
    }
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationErrors({});

    const recipientsChanged = !arraysEqual(formData.recipientEmails, initialRecipientEmails);

    const payload: UpdateCampaignRequest = {
      name: formData.name,
      subject: formData.subject,
      body: formData.body,
    };

    if (recipientsChanged) {
      payload.recipient_emails = formData.recipientEmails;
    }

    const result = UpdateCampaignRequestSchema.safeParse(payload);

    if (!result.success) {
      setValidationErrors(result.error.flatten().fieldErrors as CampaignNewValidationErrors);

      return;
    }

    try {
      await trigger(payload);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to update campaign");
    }
  };

  const handleRetryHydration = () => {
    setHydrated(false);
    setHydrationError(null);
    setInitialRecipientEmails([]);
    setFormData((prev) => ({ ...prev, recipientEmails: [] }));
  };

  if (isLoading || (!hydrated && !hydrationError)) {
    return (
      <LoadingState title="Loading campaign..." description="Fetching campaign data for editing." />
    );
  }

  if (hydrationError) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <CampaignNewHeader onBack={handleCancel} title="Edit Campaign" />
        <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-lg border border-destructive/40 bg-destructive/5 px-6 py-10 text-center">
          <div className="space-y-1">
            <p className="text-base font-medium">Failed to load campaign</p>
            <p className="text-sm text-muted-foreground">{hydrationError}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCancel}>
              Back to campaign
            </Button>
            <Button onClick={handleRetryHydration}>Retry</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <CampaignNewHeader onBack={handleCancel} title="Edit Campaign" />
      <CampaignNewForm
        formData={formData}
        isSubmitting={isMutating}
        validationErrors={validationErrors}
        cardTitle="Campaign Details"
        cardDescription="Update campaign content and recipients. Changes apply immediately."
        submitIdleLabel="Save Changes"
        submitBusyLabel="Saving..."
        onCancel={handleCancel}
        onInputChange={handleInputChange}
        onRecipientEmailsChange={handleRecipientEmailsChange}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
