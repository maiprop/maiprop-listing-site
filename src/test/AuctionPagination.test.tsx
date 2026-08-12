/**
 * Unit tests for AuctionPagination component.
 * Verifies: null render guard, ellipsis window logic, prev/next navigation,
 * footer text, and page boundary behaviour.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AuctionPagination } from "@/components/auctions/AuctionPagination";
import { AUCTIONS_PAGE_SIZE } from "@/hooks/useAuctionsPipeline";

// AuctionPagination uses Button from @/components/ui/button which is a plain
// Radix/Tailwind component — no provider needed.

const renderPagination = (props: Partial<React.ComponentProps<typeof AuctionPagination>> = {}) => {
  const defaults = {
    currentPage: 1,
    totalPages: 3,
    polygonFilteredCount: 50,
    setCurrentPage: vi.fn(),
  };
  return render(<AuctionPagination {...defaults} {...props} />);
};

// ── null render guard ─────────────────────────────────────────────────────────

describe("AuctionPagination — null guard", () => {
  it("renders nothing when totalPages is 1", () => {
    const { container } = renderPagination({ totalPages: 1 });
    expect(container.firstChild).toBeNull();
  });

  it("renders when totalPages is 2", () => {
    const { container } = renderPagination({ totalPages: 2 });
    expect(container.firstChild).not.toBeNull();
  });
});

// ── navigation buttons ────────────────────────────────────────────────────────

describe("AuctionPagination — navigation", () => {
  it("Previous button is disabled on first page", () => {
    renderPagination({ currentPage: 1, totalPages: 3 });
    const prev = screen.getByRole("button", { name: /Previous/i });
    expect(prev).toBeDisabled();
  });

  it("Next button is disabled on last page", () => {
    renderPagination({ currentPage: 3, totalPages: 3 });
    const next = screen.getByRole("button", { name: /Next/i });
    expect(next).toBeDisabled();
  });

  it("clicking Next calls setCurrentPage with incrementor", () => {
    const setCurrentPage = vi.fn();
    renderPagination({ currentPage: 2, totalPages: 5, setCurrentPage });
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    expect(setCurrentPage).toHaveBeenCalledOnce();
    // the call receives a function (incrementor) — verify it increments correctly
    const arg = setCurrentPage.mock.calls[0][0];
    expect(typeof arg === "function" ? arg(2) : arg).toBe(3);
  });

  it("clicking Previous calls setCurrentPage with decrementor", () => {
    const setCurrentPage = vi.fn();
    renderPagination({ currentPage: 3, totalPages: 5, setCurrentPage });
    fireEvent.click(screen.getByRole("button", { name: /Previous/i }));
    const arg = setCurrentPage.mock.calls[0][0];
    expect(typeof arg === "function" ? arg(3) : arg).toBe(2);
  });

  it("clicking a numbered page calls setCurrentPage with that number", () => {
    const setCurrentPage = vi.fn();
    renderPagination({ currentPage: 1, totalPages: 5, setCurrentPage });
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(setCurrentPage).toHaveBeenCalledWith(3);
  });
});

// ── page number rendering ─────────────────────────────────────────────────────

describe("AuctionPagination — page numbers (≤7 pages)", () => {
  it("exposes the current page to assistive technology", () => {
    renderPagination({ currentPage: 3, totalPages: 5 });

    expect(screen.getByRole("button", { name: "3" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "2" })).not.toHaveAttribute("aria-current");
  });

  it("shows all page buttons for 5-page set", () => {
    renderPagination({ currentPage: 3, totalPages: 5 });
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByRole("button", { name: String(i) })).toBeInTheDocument();
    }
  });

  it("shows exactly 7 buttons for 7-page set (no ellipsis)", () => {
    renderPagination({ currentPage: 4, totalPages: 7 });
    expect(screen.queryByText("…")).toBeNull();
    for (let i = 1; i <= 7; i++) {
      expect(screen.getByRole("button", { name: String(i) })).toBeInTheDocument();
    }
  });
});

describe("AuctionPagination — ellipsis (>7 pages)", () => {
  it("always shows first and last page", () => {
    renderPagination({ currentPage: 5, totalPages: 10 });
    expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "10" })).toBeInTheDocument();
  });

  it("shows ellipsis when current page is far from edges", () => {
    renderPagination({ currentPage: 5, totalPages: 10 });
    const ellipses = screen.getAllByText("…");
    expect(ellipses.length).toBeGreaterThanOrEqual(1);
  });

  it("shows window around current page (±2)", () => {
    renderPagination({ currentPage: 5, totalPages: 10 });
    // pages 3..7 should all be visible (window = 5-2..5+2)
    for (const p of [3, 4, 5, 6, 7]) {
      expect(screen.getByRole("button", { name: String(p) })).toBeInTheDocument();
    }
  });
});

// ── footer text ───────────────────────────────────────────────────────────────

describe("AuctionPagination — footer text", () => {
  it("displays page count, result count, and items-per-page", () => {
    renderPagination({ currentPage: 2, totalPages: 4, polygonFilteredCount: 75 });
    const footer = screen.getByText(/Page 2 of 4/);
    expect(footer).toBeInTheDocument();
    expect(footer.textContent).toContain("75 results");
    expect(footer.textContent).toContain(`${AUCTIONS_PAGE_SIZE} per page`);
  });
});
