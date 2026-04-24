import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import {
  type CampaignResponse,
  type CampaignStatsResponse,
  type ScheduleCampaignRequest,
} from "@repo/dto";
import { useQuery, useDelete, useMutation, ApiError } from "@/lib/api-client";
import { shouldPollCampaign } from "@/lib/campaign";
import { LoadingState } from "@/components/LoadingState";
import { CampaignDetailsCard } from "@/components/CampaignDetail/CampaignDetailsCard";
import { CampaignHeader } from "@/components/CampaignDetail/CampaignHeader";
import { CampaignScheduleForm } from "@/components/CampaignDetail/CampaignScheduleForm";
import { CampaignStatsCards } from "@/components/CampaignDetail/CampaignStatsCards";
import { CampaignRecipientsList } from "@/components/CampaignDetail/CampaignRecipientsList";

const STATS_POLL_INTERVAL_MS = 3000;

export default function CampaignDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { mutate } = useSWRConfig();
  const [showSchedule, setShowSchedule] = useState(false);
  const campaignPath = id ? `/campaigns/${id}` : null;
  const statsPath = id ? `/campaigns/${id}/stats` : null;

  useEffect(() => {
    if (!id) {
      navigate("/not-found", { replace: true });
    }
  }, [id, navigate]);

  const {
    data: campaignData,
    error,
    isLoading,
  } = useQuery<CampaignResponse>(campaignPath, {
    refreshInterval: (latest) =>
      shouldPollCampaign(latest?.status, latest?.scheduled_at) ? STATS_POLL_INTERVAL_MS : 0,
  });

  const pollInterval = shouldPollCampaign(campaignData?.status, campaignData?.scheduled_at)
    ? STATS_POLL_INTERVAL_MS
    : 0;

  const { data: statsData } = useQuery<CampaignStatsResponse>(statsPath, {
    refreshInterval: pollInterval,
  });

  useEffect(() => {
    if (error && error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      navigate("/not-found", { replace: true });
    }
  }, [error, navigate]);

  useEffect(() => {
    if (error) {
      toast.error(error.message || "Failed to load campaign");
    }
  }, [error]);

  useEffect(() => {
    if (campaignData?.status === "scheduled") {
      setShowSchedule(false);
    }
  }, [campaignData?.status]);

  const { trigger: deleteMut, isMutating: isDeleting } = useDelete(campaignPath, {
    onSuccess: () => {
      toast.success("Campaign deleted");
      mutate("/campaigns");
      navigate("/campaigns");
    },
  });

  const { trigger: sendMut, isMutating: isSending } = useMutation<CampaignResponse>(
    `/campaigns/${id}/send`,
  );

  const { trigger: scheduleMut, isMutating: isScheduling } = useMutation<
    CampaignResponse,
    ScheduleCampaignRequest
  >(`/campaigns/${id}/schedule`);

  const handleDelete = async () => {
    try {
      await deleteMut();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to delete campaign");
      throw e;
    }
  };

  const handleSend = async () => {
    try {
      await sendMut();
      toast.success("Campaign sent");
      mutate(campaignPath);
      mutate(statsPath);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to send campaign");
      throw e;
    }
  };

  const handleSchedule = async (data: ScheduleCampaignRequest) => {
    try {
      await scheduleMut(data);
      toast.success("Campaign scheduled");
      mutate(campaignPath);
      mutate(statsPath);
      setShowSchedule(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to schedule campaign");
    }
  };

  if (isLoading) {
    return (
      <LoadingState
        title="Loading campaign details..."
        description="Fetching the latest campaign information."
      />
    );
  }

  if (error) {
    return <div className="text-red-500">Failed to load campaign: {error.message}</div>;
  }

  if (!campaignData) {
    return <div className="text-center py-10">Campaign not found</div>;
  }

  return (
    <div className="space-y-6">
      <CampaignHeader
        campaign={campaignData}
        isDeleting={isDeleting}
        isSending={isSending}
        isScheduling={isScheduling}
        onDelete={handleDelete}
        onSend={handleSend}
        onOpenSchedule={() => setShowSchedule(true)}
        onEdit={() => id && navigate(`/campaigns/${id}/edit`)}
        onBack={() => navigate("/campaigns")}
      />

      {campaignData.status === "draft" && (
        <CampaignScheduleForm
          open={showSchedule}
          isScheduling={isScheduling}
          onSchedule={handleSchedule}
          onOpenChange={setShowSchedule}
        />
      )}

      <CampaignStatsCards stats={statsData} />

      <CampaignDetailsCard body={campaignData.body} />

      {id && (
        <CampaignRecipientsList
          campaignId={id}
          campaignStatus={campaignData.status}
          scheduledAt={campaignData.scheduled_at}
        />
      )}
    </div>
  );
}
