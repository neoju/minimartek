import { useState, type MouseEvent } from "react";
import type { CampaignResponse } from "@repo/dto";
import { ArrowLeft, Calendar, Pencil, Send, Trash2 } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getStatusBadgeClass } from "@/lib/campaign";

interface CampaignHeaderProps {
  campaign: CampaignResponse;
  isDeleting: boolean;
  isSending: boolean;
  isScheduling: boolean;
  onDelete: () => Promise<void>;
  onSend: () => Promise<void>;
  onOpenSchedule: () => void;
  onEdit: () => void;
  onBack: () => void;
}

export function CampaignHeader({
  campaign,
  isDeleting,
  isSending,
  isScheduling,
  onDelete,
  onSend,
  onOpenSchedule,
  onEdit,
  onBack,
}: CampaignHeaderProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);
  const canDelete = campaign.status === "draft";

  const handleDeleteConfirm = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    try {
      await onDelete();
    } catch {
      // Keep dialog open so the user can see the failure and retry.
    }
  };

  const handleSendConfirm = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    try {
      await onSend();
      setIsSendDialogOpen(false);
    } catch {
      // Keep dialog open so the user can see the failure and retry.
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{campaign.name}</h1>
            <Badge variant="outline" className={getStatusBadgeClass(campaign.status)}>
              {campaign.status}
            </Badge>
          </div>
          <p className="text-muted-foreground">{campaign.subject}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {campaign.status === "draft" ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={onEdit}
              disabled={isScheduling || isSending || isDeleting}
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={onOpenSchedule}
              disabled={isScheduling}
            >
              {isScheduling ? (
                <LoadingSpinner className="size-4" />
              ) : (
                <Calendar className="h-4 w-4" />
              )}
              {isScheduling ? "Scheduling..." : "Schedule"}
            </Button>

            <AlertDialog
              open={isSendDialogOpen}
              onOpenChange={(open) => {
                if (!isSending) {
                  setIsSendDialogOpen(open);
                }
              }}
            >
              <AlertDialogTrigger asChild>
                <Button size="sm" className="gap-2" disabled={isSending}>
                  {isSending ? (
                    <LoadingSpinner className="size-4 text-primary-foreground" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {isSending ? "Sending..." : "Send"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Send Campaign</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to send this campaign? This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isSending}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="gap-2"
                    disabled={isSending}
                    onClick={handleSendConfirm}
                  >
                    {isSending ? (
                      <LoadingSpinner className="size-4 text-primary-foreground" />
                    ) : null}
                    {isSending ? "Sending..." : "Send"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : null}

        <AlertDialog
          open={isDeleteDialogOpen}
          onOpenChange={(open) => {
            if (!isDeleting && canDelete) {
              setIsDeleteDialogOpen(open);
            }
          }}
        >
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-destructive hover:bg-destructive/10"
              disabled={!canDelete || isDeleting}
            >
              {isDeleting ? (
                <LoadingSpinner className="size-4 text-destructive" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this campaign? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                className="gap-2"
                disabled={!canDelete || isDeleting}
                onClick={handleDeleteConfirm}
              >
                {isDeleting ? <LoadingSpinner className="size-4 text-destructive" /> : null}
                {isDeleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
