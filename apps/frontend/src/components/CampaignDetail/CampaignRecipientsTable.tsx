import { Fragment } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight } from "lucide-react";
import type {
  CampaignRecipientSortBy,
  SortOrderType,
  PaginatedCampaignRecipientList,
} from "@repo/dto";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingState } from "@/components/LoadingState";
import { cn } from "@/lib/utils";
import { getRecipientStatusBadgeClass } from "@/lib/campaign";

interface CampaignRecipientsTableProps {
  data?: PaginatedCampaignRecipientList;
  error?: Error;
  isLoading: boolean;
  isRefreshing?: boolean;
  sortBy: CampaignRecipientSortBy;
  sortOrder: SortOrderType;
  onSortChange: (sortBy: CampaignRecipientSortBy) => void;
  expandedRecipientIds: Set<string>;
  onToggleExpanded: (recipientId: string) => void;
}

interface SortableHeaderProps {
  column: CampaignRecipientSortBy;
  label: string;
  sortBy: CampaignRecipientSortBy;
  sortOrder: SortOrderType;
  onSortChange: (sortBy: CampaignRecipientSortBy) => void;
  className?: string;
}

function SortableHeader({
  column,
  label,
  sortBy,
  sortOrder,
  onSortChange,
  className,
}: SortableHeaderProps) {
  const isActive = sortBy === column;
  const Icon = !isActive ? ArrowUpDown : sortOrder === "asc" ? ArrowUp : ArrowDown;

  return (
    <TableHead className={className}>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "-ml-3 h-8 gap-1 data-[active=true]:text-foreground",
          !isActive && "text-muted-foreground",
        )}
        data-active={isActive}
        onClick={() => onSortChange(column)}
        aria-label={`Sort by ${label}`}
      >
        {label}
        <Icon className="h-3.5 w-3.5" />
      </Button>
    </TableHead>
  );
}

export function CampaignRecipientsTable({
  data,
  error,
  isLoading,
  isRefreshing = false,
  sortBy,
  sortOrder,
  onSortChange,
  expandedRecipientIds,
  onToggleExpanded,
}: CampaignRecipientsTableProps) {
  const shouldShowLoadingState = isLoading && !data;
  const shouldShowErrorState = Boolean(error) && !data;

  if (shouldShowLoadingState) {
    return (
      <div className="min-h-64">
        <LoadingState
          title="Loading recipients..."
          description="Fetching the latest recipient list."
        />
      </div>
    );
  }

  if (shouldShowErrorState) {
    return (
      <div className="flex min-h-64 items-center justify-center text-center text-red-500">
        Failed to load recipients: {error?.message}
      </div>
    );
  }

  const columnCount = 5;

  return (
    <div
      className={cn("relative overflow-x-auto transition-opacity", isRefreshing && "opacity-60")}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" aria-label="Expand" />
            <SortableHeader
              column="name"
              label="Name"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={onSortChange}
            />
            <SortableHeader
              column="email"
              label="Email"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={onSortChange}
            />
            <SortableHeader
              column="status"
              label="Status"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={onSortChange}
            />
            <SortableHeader
              column="sent_at"
              label="Sent At"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={onSortChange}
            />
          </TableRow>
        </TableHeader>

        <TableBody>
          {!data || data.items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnCount} className="h-40 text-center text-muted-foreground">
                No recipients match the current filters.
              </TableCell>
            </TableRow>
          ) : (
            data.items.map((recipient) => {
              const isFailed = recipient.status === "failed";
              const isExpanded = expandedRecipientIds.has(recipient.recipient_id);

              return (
                <Fragment key={recipient.recipient_id}>
                  <TableRow
                    data-state={isExpanded ? "expanded" : undefined}
                    className={cn(isFailed && "cursor-pointer hover:bg-muted/40")}
                    onClick={isFailed ? () => onToggleExpanded(recipient.recipient_id) : undefined}
                  >
                    <TableCell className="w-10">
                      {isFailed ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={isExpanded ? "Collapse error" : "Expand error"}
                          aria-expanded={isExpanded}
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleExpanded(recipient.recipient_id);
                          }}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-medium">{recipient.name}</TableCell>
                    <TableCell className="text-muted-foreground">{recipient.email}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={getRecipientStatusBadgeClass(recipient.status)}
                      >
                        {recipient.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {recipient.sent_at ? new Date(recipient.sent_at).toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>

                  {isFailed && isExpanded ? (
                    <TableRow
                      className="bg-red-50/60 hover:bg-red-50/60 dark:bg-red-950/20"
                      data-state="expanded-detail"
                    >
                      <TableCell />
                      <TableCell colSpan={columnCount - 1} className="py-3">
                        <div className="space-y-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
                            Failure reason
                          </p>
                          <p className="text-sm whitespace-pre-wrap break-words text-red-900 dark:text-red-200">
                            {recipient.last_error_message?.trim() ||
                              "No error message was recorded."}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
