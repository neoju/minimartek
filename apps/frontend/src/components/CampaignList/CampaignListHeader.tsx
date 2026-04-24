import { Link } from "react-router-dom";
import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CampaignListHeader() {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
        <p className="text-muted-foreground">Manage and track your marketing campaigns.</p>
      </div>

      <Link to="/campaigns/new">
        <Button className="gap-2">
          <PlusCircle className="h-4 w-4" />
          New Campaign
        </Button>
      </Link>
    </div>
  );
}
