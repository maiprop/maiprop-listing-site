import { Button } from "@/components/ui/button";
import { AUCTIONS_PAGE_SIZE } from "@/hooks/useAuctionsPipeline";
import { useTranslation } from "react-i18next";

interface AuctionPaginationProps {
  currentPage: number;
  totalPages: number;
  polygonFilteredCount: number;
  setCurrentPage: (page: number | ((p: number) => number)) => void;
}

/** Renders the "Previous / numbered pages / Next" pagination row for the auctions list. */
export function AuctionPagination({
  currentPage,
  totalPages,
  polygonFilteredCount,
  setCurrentPage,
}: AuctionPaginationProps) {
  const { i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;

  if (totalPages <= 1) return null;

  const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  const pages: (number | "…")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 4) pages.push("…");
    const start = Math.max(2, currentPage - 2);
    const end = Math.min(totalPages - 1, currentPage + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 3) pages.push("…");
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-center gap-2 mt-8 flex-wrap">
      <Button
        variant="outline"
        size="sm"
        className="border-border"
        disabled={currentPage === 1}
        onClick={() => { setCurrentPage((p) => Math.max(1, p - 1)); scrollTop(); }}
      >
        ← {isGreek ? "Προηγούμενη" : "Previous"}
      </Button>

      {pages.map((p, idx) =>
        p === "…" ? (
          <span key={`ellipsis-${idx}`} className="text-sm text-muted-foreground px-1 select-none">…</span>
        ) : (
          <Button
            key={p}
            variant={p === currentPage ? "default" : "outline"}
            size="sm"
            aria-current={p === currentPage ? "page" : undefined}
            className={p === currentPage ? "bg-gradient-primary border-0 text-primary-foreground font-bold" : "border-border"}
            onClick={() => { setCurrentPage(p as number); scrollTop(); }}
          >
            {p}
          </Button>
        )
      )}

      <Button
        size="sm"
        className="border-border"
        variant="outline"
        disabled={currentPage === totalPages}
        onClick={() => { setCurrentPage((p) => Math.min(totalPages, p + 1)); scrollTop(); }}
      >
        {isGreek ? "Επόμενη" : "Next"} →
      </Button>

      <span className="w-full text-center text-xs text-muted-foreground mt-1">
        {isGreek
          ? `Σελίδα ${currentPage} από ${totalPages} · ${polygonFilteredCount} αποτελέσματα · ${AUCTIONS_PAGE_SIZE} ανά σελίδα`
          : `Page ${currentPage} of ${totalPages} · ${polygonFilteredCount} results · ${AUCTIONS_PAGE_SIZE} per page`}
      </span>
    </div>
  );
}
