import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  type CampaignRecipientSortBy,
  type CampaignRecipientStatus,
  type PaginatedCampaignRecipientList,
  type SortOrderType,
  type CampaignStatus,
} from "@repo/dto";
import { DEFAULT_PAGE_SIZE } from "@repo/utils";
import { buildApiPath, useQuery } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { shouldPollCampaign } from "@/lib/campaign";
import { CampaignListPagination } from "@/components/CampaignList/CampaignListPagination";
import { CampaignRecipientsFilters, type RecipientFilters } from "./CampaignRecipientsFilters";
import { CampaignRecipientsTable } from "./CampaignRecipientsTable";

const FIRST_PAGE = 1;
const AUTO_REFRESH_INTERVAL_MS = 3000;
const SORT_COLUMNS: readonly CampaignRecipientSortBy[] = ["name", "email", "status", "sent_at"];
const RECIPIENT_STATUSES: readonly CampaignRecipientStatus[] = ["pending", "sent", "failed"];

const PARAM_PAGE = "rPage";
const PARAM_SORT_BY = "rSortBy";
const PARAM_SORT_ORDER = "rSortOrder";
const PARAM_NAME = "rName";
const PARAM_EMAIL = "rEmail";
const PARAM_STATUS = "rStatus";

function parsePageParam(value: string | null): number {
  if (!value) {
    return FIRST_PAGE;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : FIRST_PAGE;
}

function parseSortBy(value: string | null): CampaignRecipientSortBy {
  return SORT_COLUMNS.includes(value as CampaignRecipientSortBy)
    ? (value as CampaignRecipientSortBy)
    : "name";
}

function parseSortOrder(value: string | null): SortOrderType {
  return value === "desc" ? "desc" : "asc";
}

function parseStatus(value: string | null): CampaignRecipientStatus | undefined {
  return RECIPIENT_STATUSES.includes(value as CampaignRecipientStatus)
    ? (value as CampaignRecipientStatus)
    : undefined;
}

function parseTrimmedString(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : undefined;
}

interface CampaignRecipientsListProps {
  campaignId: string;
  campaignStatus: CampaignStatus;
  scheduledAt: string | null;
}

export function CampaignRecipientsList({
  campaignId,
  campaignStatus,
  scheduledAt,
}: CampaignRecipientsListProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  const currentPage = parsePageParam(searchParams.get(PARAM_PAGE));
  const sortBy = parseSortBy(searchParams.get(PARAM_SORT_BY));
  const sortOrder = parseSortOrder(searchParams.get(PARAM_SORT_ORDER));
  const filters = useMemo<RecipientFilters>(
    () => ({
      name: parseTrimmedString(searchParams.get(PARAM_NAME)),
      email: parseTrimmedString(searchParams.get(PARAM_EMAIL)),
      status: parseStatus(searchParams.get(PARAM_STATUS)),
    }),
    [searchParams],
  );

  const [expandedRecipientIds, setExpandedRecipientIds] = useState<Set<string>>(() => new Set());

  const [autoRefresh, setAutoRefresh] = useState(true);

  const updateSearchParams = useCallback(
    (updater: (params: URLSearchParams) => void, options: { replace?: boolean } = {}) => {
      const next = new URLSearchParams(searchParams);
      updater(next);
      setSearchParams(next, { replace: options.replace });
    },
    [searchParams, setSearchParams],
  );

  const setPage = useCallback(
    (page: number, replace = false) => {
      const nextPage = Math.max(FIRST_PAGE, Math.trunc(page));
      updateSearchParams(
        (params) => {
          if (nextPage === FIRST_PAGE) {
            params.delete(PARAM_PAGE);
          } else {
            params.set(PARAM_PAGE, String(nextPage));
          }
        },
        { replace },
      );
    },
    [updateSearchParams],
  );

  const buildPageHref = useCallback(
    (page: number) => {
      const nextPage = Math.max(FIRST_PAGE, Math.trunc(page));
      const next = new URLSearchParams(searchParams);

      if (nextPage === FIRST_PAGE) {
        next.delete(PARAM_PAGE);
      } else {
        next.set(PARAM_PAGE, String(nextPage));
      }

      const queryString = next.toString();

      return queryString ? `/campaigns/${campaignId}?${queryString}` : `/campaigns/${campaignId}`;
    },
    [campaignId, searchParams],
  );

  const handleSortChange = useCallback(
    (column: CampaignRecipientSortBy) => {
      updateSearchParams((params) => {
        params.delete(PARAM_PAGE);

        if (column === sortBy) {
          const nextOrder: SortOrderType = sortOrder === "asc" ? "desc" : "asc";

          if (nextOrder === "asc") {
            params.delete(PARAM_SORT_ORDER);
          } else {
            params.set(PARAM_SORT_ORDER, nextOrder);
          }

          return;
        }

        if (column === "name") {
          params.delete(PARAM_SORT_BY);
        } else {
          params.set(PARAM_SORT_BY, column);
        }

        params.delete(PARAM_SORT_ORDER);
      });
    },
    [sortBy, sortOrder, updateSearchParams],
  );

  const handleFiltersChange = useCallback(
    (next: RecipientFilters) => {
      updateSearchParams((params) => {
        params.delete(PARAM_PAGE);

        if (next.name) {
          params.set(PARAM_NAME, next.name);
        } else {
          params.delete(PARAM_NAME);
        }

        if (next.email) {
          params.set(PARAM_EMAIL, next.email);
        } else {
          params.delete(PARAM_EMAIL);
        }

        if (next.status) {
          params.set(PARAM_STATUS, next.status);
        } else {
          params.delete(PARAM_STATUS);
        }
      });
    },
    [updateSearchParams],
  );

  const toggleExpanded = useCallback((recipientId: string) => {
    setExpandedRecipientIds((prev) => {
      const next = new Set(prev);

      if (next.has(recipientId)) {
        next.delete(recipientId);
      } else {
        next.add(recipientId);
      }

      return next;
    });
  }, []);

  const query = useMemo(
    () => ({
      page: currentPage,
      page_size: DEFAULT_PAGE_SIZE,
      sort_by: sortBy,
      sort_order: sortOrder,
      name: filters.name,
      email: filters.email,
      status: filters.status,
    }),
    [currentPage, sortBy, sortOrder, filters],
  );

  const recipientsPath = useMemo(
    () => buildApiPath(`/campaigns/${campaignId}/recipients`, query),
    [campaignId, query],
  );

  const pollingAllowed = shouldPollCampaign(campaignStatus, scheduledAt);
  const effectiveRefreshInterval = autoRefresh && pollingAllowed ? AUTO_REFRESH_INTERVAL_MS : 0;

  const { data, error, isLoading, isValidating } = useQuery<PaginatedCampaignRecipientList>(
    recipientsPath,
    {
      keepPreviousData: true,
      refreshInterval: effectiveRefreshInterval,
    },
  );

  const pageSize = data?.page_size ?? DEFAULT_PAGE_SIZE;
  const totalPages = Math.max(FIRST_PAGE, Math.ceil((data?.total ?? 0) / pageSize));

  useEffect(() => {
    if (!data || data.total === 0 || currentPage <= totalPages) {
      return;
    }

    setPage(totalPages, true);
  }, [currentPage, data, setPage, totalPages]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>Recipients</CardTitle>
            <CardDescription>
              Delivery status for every recipient in this campaign. Click a failed row to see the
              error.
            </CardDescription>
          </div>

          {pollingAllowed && (
            <div className="flex items-center gap-2 *:hover:cursor-pointer">
              <Switch
                id="recipients-auto-refresh"
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
                aria-label="Auto-refresh recipients"
              />
              <Label
                htmlFor="recipients-auto-refresh"
                className="text-sm font-medium text-muted-foreground"
              >
                Auto-refresh
              </Label>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <CampaignRecipientsFilters filters={filters} onChange={handleFiltersChange} />

        <CampaignRecipientsTable
          data={data}
          error={error}
          isLoading={isLoading}
          isRefreshing={Boolean(data) && isValidating}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          expandedRecipientIds={expandedRecipientIds}
          onToggleExpanded={toggleExpanded}
        />

        <CampaignListPagination
          buildPageHref={buildPageHref}
          currentPage={data?.page ?? currentPage}
          pageSize={pageSize}
          totalItems={data?.total ?? 0}
          onPageChange={setPage}
        />
      </CardContent>
    </Card>
  );
}
