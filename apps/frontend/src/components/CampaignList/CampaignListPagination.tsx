import type { MouseEvent } from "react";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface CampaignListPaginationProps {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  buildPageHref: (page: number) => string;
}

type PaginationEntry = number | "ellipsis-start" | "ellipsis-end";

function getPaginationEntries(currentPage: number, totalPages: number): PaginationEntry[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis-end", totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [
      1,
      "ellipsis-start",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [
    1,
    "ellipsis-start",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "ellipsis-end",
    totalPages,
  ];
}

export function CampaignListPagination({
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  buildPageHref,
}: CampaignListPaginationProps) {
  if (totalItems === 0) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const pageEntries = getPaginationEntries(safeCurrentPage, totalPages);
  const startItem = (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, totalItems);
  const hasPreviousPage = safeCurrentPage > 1;
  const hasNextPage = safeCurrentPage < totalPages;

  const handlePageClick =
    (page: number, disabled = false) =>
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (disabled || page === safeCurrentPage) {
        event.preventDefault();

        return;
      }

      event.preventDefault();
      onPageChange(page);
    };

  return (
    <div className="flex flex-col gap-4 border-t pt-4 md:flex-row md:items-center md:justify-between">
      <p className="text-sm text-muted-foreground">
        Showing {startItem}-{endItem} of {totalItems} campaigns
      </p>

      <Pagination className="mx-0 w-auto justify-start md:justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              aria-disabled={!hasPreviousPage}
              className={!hasPreviousPage ? "pointer-events-none opacity-50" : undefined}
              href={buildPageHref(safeCurrentPage - 1)}
              onClick={handlePageClick(safeCurrentPage - 1, !hasPreviousPage)}
            />
          </PaginationItem>

          {pageEntries.map((entry) =>
            typeof entry === "number" ? (
              <PaginationItem key={entry}>
                <PaginationLink
                  href={buildPageHref(entry)}
                  isActive={entry === safeCurrentPage}
                  onClick={handlePageClick(entry)}
                >
                  {entry}
                </PaginationLink>
              </PaginationItem>
            ) : (
              <PaginationItem key={entry}>
                <PaginationEllipsis />
              </PaginationItem>
            ),
          )}

          <PaginationItem>
            <PaginationNext
              aria-disabled={!hasNextPage}
              className={!hasNextPage ? "pointer-events-none opacity-50" : undefined}
              href={buildPageHref(safeCurrentPage + 1)}
              onClick={handlePageClick(safeCurrentPage + 1, !hasNextPage)}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
