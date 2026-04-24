import type { CampaignStatsResponse } from "@repo/dto";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface CampaignStatsCardsProps {
  stats?: CampaignStatsResponse;
}

export function CampaignStatsCards({ stats }: CampaignStatsCardsProps) {
  const counterItems = [
    { label: "Total", value: stats?.total ?? "—" },
    { label: "Sent", value: stats?.sent ?? "—" },
    { label: "Failed", value: stats?.failed ?? "—" },
    { label: "Opened", value: stats?.opened ?? "—" },
  ];

  const sendRate = stats?.send_rate ?? 0;
  const openRate = stats?.open_rate ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {counterItems.map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-2">
              <CardDescription>{item.label}</CardDescription>
              <CardTitle className="text-2xl">{item.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Send rate</CardDescription>
            <CardTitle className="text-2xl">{stats ? `${sendRate}%` : "—"}</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={sendRate} aria-label="Send rate" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open rate</CardDescription>
            <CardTitle className="text-2xl">{stats ? `${openRate}%` : "—"}</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={openRate} aria-label="Open rate" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
