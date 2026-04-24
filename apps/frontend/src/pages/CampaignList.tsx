import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { type PaginatedCampaignList, type PaginationQuery } from "@repo/dto";
import { DEFAULT_PAGE_SIZE } from "@repo/utils";
import { buildApiPath, useQuery } from "@/lib/api-client";
import { CampaignListHeader } from "@/components/CampaignList/CampaignListHeader";
import { CampaignListPagination } from "@/components/CampaignList/CampaignListPagination";
import { CampaignListTable } from "@/components/CampaignList/CampaignListTable";

const FIRST_PAGE = 1;

function parsePageParam(value: string | null): number {
  if (!value) {
    return FIRST_PAGE;
  }

  const page = Number.parseInt(value, 10);

  return Number.isInteger(page) && page > 0 ? page : FIRST_PAGE;
}

export default function CampaignListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = parsePageParam(searchParams.get("page"));

  const setPage = useCallback(
    (page: number, replace = false) => {
      const nextPage = Math.max(FIRST_PAGE, Math.trunc(page));
      const nextSearchParams = new URLSearchParams(searchParams);

      if (nextPage === FIRST_PAGE) {
        nextSearchParams.delete("page");
      } else {
        nextSearchParams.set("page", String(nextPage));
      }

      setSearchParams(nextSearchParams, { replace });
    },
    [searchParams, setSearchParams],
  );

  const buildPageHref = useCallback(
    (page: number) => {
      const nextPage = Math.max(FIRST_PAGE, Math.trunc(page));
      const nextSearchParams = new URLSearchParams(searchParams);

      if (nextPage === FIRST_PAGE) {
        nextSearchParams.delete("page");
      } else {
        nextSearchParams.set("page", String(nextPage));
      }

      const queryString = nextSearchParams.toString();

      return queryString ? `/campaigns?${queryString}` : "/campaigns";
    },
    [searchParams],
  );

  const query = useMemo<PaginationQuery>(
    () => ({
      page: currentPage,
      page_size: DEFAULT_PAGE_SIZE,
    }),
    [currentPage],
  );

  const campaignsPath = useMemo(() => buildApiPath("/campaigns", query), [query]);

  const { data, error, isLoading, isValidating } = useQuery<PaginatedCampaignList>(campaignsPath, {
    keepPreviousData: true,
  });

  const pageSize = data?.page_size ?? DEFAULT_PAGE_SIZE;
  const totalPages = Math.max(FIRST_PAGE, Math.ceil((data?.total ?? 0) / pageSize));

  useEffect(() => {
    if (!data || data.total === 0 || currentPage <= totalPages) {
      return;
    }

    setPage(totalPages, true);
  }, [currentPage, data, setPage, totalPages]);

  return (
    <div className="space-y-6">
      <CampaignListHeader />
      <CampaignListTable
        data={data}
        error={error}
        isLoading={isLoading}
        isRefreshing={Boolean(data) && isValidating}
      />
      <CampaignListPagination
        buildPageHref={buildPageHref}
        currentPage={data?.page ?? currentPage}
        pageSize={pageSize}
        totalItems={data?.total ?? 0}
        onPageChange={setPage}
      />
    </div>
  );
}
