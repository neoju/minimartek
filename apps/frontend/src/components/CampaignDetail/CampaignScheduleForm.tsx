import { useState } from "react";
import { ScheduleCampaignRequestSchema, type ScheduleCampaignRequest } from "@repo/dto";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CampaignScheduleFormProps {
  open: boolean;
  isScheduling: boolean;
  onSchedule: (data: ScheduleCampaignRequest) => Promise<void>;
  onOpenChange: (open: boolean) => void;
}

function toDateTimeLocalValue(date: Date): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);

  return localDate.toISOString().slice(0, 16);
}

export function CampaignScheduleForm({
  open,
  isScheduling,
  onSchedule,
  onOpenChange,
}: CampaignScheduleFormProps) {
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const minScheduleDate = open ? toDateTimeLocalValue(new Date()) : undefined;

  const handleSubmit = async () => {
    setScheduleError("");

    if (!scheduledDate) {
      setScheduleError("Please select a date and time.");

      return;
    }

    const payload: ScheduleCampaignRequest = {
      scheduled_at: new Date(scheduledDate).toISOString(),
    };

    if (new Date(payload.scheduled_at).getTime() <= Date.now()) {
      setScheduleError("Please select a future date and time.");

      return;
    }

    const result = ScheduleCampaignRequestSchema.safeParse(payload);

    if (!result.success) {
      setScheduleError(
        result.error.flatten().fieldErrors.scheduled_at?.[0] ?? "Invalid date/time format.",
      );

      return;
    }

    await onSchedule(payload);
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isScheduling && !nextOpen) {
          return;
        }

        if (!nextOpen) {
          setScheduledDate("");
          setScheduleError("");
        }

        onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader className="place-items-start text-left">
          <AlertDialogTitle>Schedule Campaign</AlertDialogTitle>
          <AlertDialogDescription>
            Choose a future date and time to send this campaign.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 px-1">
          <Label htmlFor="scheduledAt" className={scheduleError ? "text-red-500" : ""}>
            Schedule Date & Time
          </Label>
          <Input
            id="scheduledAt"
            type="datetime-local"
            min={minScheduleDate}
            value={scheduledDate}
            aria-invalid={Boolean(scheduleError)}
            onChange={(event) => setScheduledDate(event.target.value)}
          />
          {scheduleError ? <p className="text-xs text-red-500">{scheduleError}</p> : null}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isScheduling}>Cancel</AlertDialogCancel>
          <Button
            onClick={handleSubmit}
            disabled={!scheduledDate || isScheduling}
            className="gap-2"
          >
            {isScheduling ? <LoadingSpinner className="size-4 text-primary-foreground" /> : null}
            {isScheduling ? "Scheduling..." : "Confirm Schedule"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
