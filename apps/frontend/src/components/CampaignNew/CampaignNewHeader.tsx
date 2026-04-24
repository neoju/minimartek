import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CampaignNewHeaderProps {
  onBack: () => void;
  title?: string;
}

export function CampaignNewHeader({ onBack, title = "Create Campaign" }: CampaignNewHeaderProps) {
  return (
    <div className="flex items-center gap-4">
      <Button variant="ghost" size="icon" onClick={onBack}>
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
    </div>
  );
}
