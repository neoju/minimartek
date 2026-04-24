import { LoadingSpinner } from "@/components/LoadingSpinner";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  className?: string;
  description?: string;
  title: string;
}

export function LoadingState({ className, description, title }: LoadingStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-96 flex-col items-center justify-center gap-4 px-6 py-10 text-center",
        className,
      )}
    >
      <LoadingSpinner className="relative z-10 size-8" />

      <div className="space-y-1">
        <p className="text-base font-medium">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );
}
