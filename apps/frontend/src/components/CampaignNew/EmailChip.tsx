import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmailChipProps {
  email: string;
  invalid?: boolean;
  onRemove: () => void;
}

export function EmailChip({ email, invalid = false, onRemove }: EmailChipProps) {
  return (
    <span
      data-invalid={invalid || undefined}
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs font-medium text-foreground",
        "data-[invalid]:border-destructive data-[invalid]:bg-destructive/10 data-[invalid]:text-destructive",
      )}
    >
      <span className="truncate">{email}</span>
      <button
        type="button"
        aria-label={`Remove ${email}`}
        onClick={onRemove}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:cursor-pointer hover:bg-background hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
