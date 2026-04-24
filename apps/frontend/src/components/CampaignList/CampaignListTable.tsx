import { Link } from "react-router-dom";
import type { PaginatedCampaignList } from "@repo/dto";
import { Eye } from "lucide-react";
import { LoadingState } from "@/components/LoadingState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getStatusBadgeClass } from "@/lib/campaign";

interface CampaignListTableProps {
  data?: PaginatedCampaignList;
  error?: Error;
  isLoading: boolean;
  isRefreshing?: boolean;
}

export function CampaignListTable({
  data,
  error,
  isLoading,
  isRefreshing = false,
}: CampaignListTableProps) {
  const shouldShowLoadingState = isRefreshing || (isLoading && !data);
  const shouldShowErrorState = Boolean(error) && !data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Campaigns</CardTitle>
        <CardDescription>A list of all your campaigns and their current status.</CardDescription>
      </CardHeader>

      <CardContent className="min-h-112">
        {shouldShowLoadingState ? (
          <LoadingState
            title="Loading campaigns..."
            description="Fetching your latest campaign list."
          />
        ) : shouldShowErrorState ? (
          <div className="flex min-h-96 items-center justify-center text-center text-red-500">
            Failed to load campaigns: {error?.message}
          </div>
        ) : (
          <div className="relative overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {!data || data.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-80 text-center text-muted-foreground">
                      No campaigns yet. Create your first one!
                    </TableCell>
                  </TableRow>
                ) : (
                  data.items.map((campaign) => (
                    <TableRow key={campaign.id}>
                      <TableCell className="font-medium">{campaign.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getStatusBadgeClass(campaign.status)}>
                          {campaign.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{campaign.recipient_count.toLocaleString()}</TableCell>
                      <TableCell>{new Date(campaign.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <Link to={`/campaigns/${campaign.id}`}>
                          <Button variant="ghost" size="sm" className="gap-1">
                            <Eye className="h-4 w-4" />
                            View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
