import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface CampaignDetailsCardProps {
  body: string;
}

export function CampaignDetailsCard({ body }: CampaignDetailsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
        <CardDescription>Campaign body content.</CardDescription>
      </CardHeader>
      <CardContent>
        <pre className="whitespace-pre-wrap text-sm">{body}</pre>
      </CardContent>
    </Card>
  );
}
