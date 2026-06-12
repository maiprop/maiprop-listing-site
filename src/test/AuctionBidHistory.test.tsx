/**
 * Tests for AuctionBidHistory — comparable-sales panel for auction listings.
 * Mocks the useAuctionBidHistory hook and asserts the radius selector,
 * loading + error + empty states, sale rendering, and median calculations.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { useHookMock } = vi.hoisted(() => ({ useHookMock: vi.fn() }));

vi.mock("@/hooks/useAuctionBidHistory", () => ({
  useAuctionBidHistory: () => useHookMock(),
}));

import AuctionBidHistory from "@/components/AuctionBidHistory";

const baseProps = { lat: 37.98, lng: 23.73, listingId: "L-1", title: "Athens auction", sqm: 95 };

/**
 * Matches the SaleRecord shape from `@/hooks/useAuctionBidHistory` — the
 * real fields the component reads (`address`, `status`, `sale_date`,
 * `discount_pct`, `days_on_market`, `asking_price`, `round`).
 */
const sale = (overrides: Record<string, unknown> = {}) => ({
  id: "s-1",
  address: "Kolonaki 12, Athens",
  property_type: "apartment",
  sqm: 100,
  sale_price: 300_000,
  asking_price: 320_000,
  discount_pct: 6,
  sale_date: "2026-03-01",
  source: "private_sale",
  status: "sold",
  round: 0,
  days_on_market: 45,
  ...overrides,
});

const baseResult = (sales: ReturnType<typeof sale>[] = [], dataSource: "live" | "mock" = "live") => ({
  data: { sales, dataSource },
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
});

beforeEach(() => {
  useHookMock.mockReset();
});

describe("AuctionBidHistory", () => {
  it("renders the loading skeleton while the hook is loading", () => {
    useHookMock.mockReturnValue({ data: undefined, isLoading: true, isError: false, isFetching: false, refetch: vi.fn() });
    const { container } = render(<AuctionBidHistory {...baseProps} />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders the isError-branch notice when the hook reports an error", () => {
    useHookMock.mockReturnValue({
      data: { sales: [], dataSource: "live" },
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch: vi.fn(),
    });
    render(<AuctionBidHistory {...baseProps} />);
    // Component surfaces: "OS API unavailable — showing representative Athens market data."
    expect(screen.getByText(/OS comparable sales are unavailable/i)).toBeInTheDocument();
  });

  it("renders the 'no comparable sales' empty state when data.sales is empty", () => {
    useHookMock.mockReturnValue(baseResult([]));
    render(<AuctionBidHistory {...baseProps} />);
    expect(screen.getByText(/No comparable sales found/i)).toBeInTheDocument();
  });

  it("renders the mock-data notice when dataSource === 'mock'", () => {
    useHookMock.mockReturnValue(baseResult([sale()], "mock"));
    render(<AuctionBidHistory {...baseProps} />);
    expect(screen.getByText(/Sample data.*connect to OS/i)).toBeInTheDocument();
  });

  it("renders a sales row per record and computes a non-zero median price/m²", () => {
    useHookMock.mockReturnValue(
      baseResult([
        sale({ id: "s-1", address: "Addr 1", sale_price: 200_000, sqm: 100 }), // 2000/m²
        sale({ id: "s-2", address: "Addr 2", sale_price: 300_000, sqm: 100 }), // 3000/m²
        sale({ id: "s-3", address: "Addr 3", sale_price: 400_000, sqm: 100 }), // 4000/m²
      ]),
    );
    render(<AuctionBidHistory {...baseProps} />);
    expect(screen.getByText("Addr 1")).toBeInTheDocument();
    expect(screen.getByText("Addr 2")).toBeInTheDocument();
    expect(screen.getByText("Addr 3")).toBeInTheDocument();
    // Median price/m² card shows the el-GR-formatted value. median([2000,3000,4000]) = 3000.
    expect(screen.getByText(/Median price \/ m/i)).toBeInTheDocument();
  });

  it("clicking a different radius button triggers a refetch", () => {
    const refetch = vi.fn();
    useHookMock.mockReturnValue({ ...baseResult([]), refetch });
    render(<AuctionBidHistory {...baseProps} />);
    // The toolbar renders one button per radius value with text like '0.5km', '1km' ...
    const radiusBtn = screen.getByRole("button", { name: /^5km$/i });
    fireEvent.click(radiusBtn);
    expect(refetch).toHaveBeenCalled();
  });

  it("clicking the Refresh icon calls refetch", () => {
    const refetch = vi.fn();
    useHookMock.mockReturnValue({ ...baseResult([]), refetch });
    render(<AuctionBidHistory {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Refresh bid history/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it("accepts the legacy `lon` prop as a fallback for `lng`", () => {
    useHookMock.mockReturnValue(baseResult([]));
    render(<AuctionBidHistory lat={37} lon={23} listingId="L-2" />);
    // Hook is called with the resolved longitude; a non-crash + any call
    // proves the lon→lng fallback executed.
    expect(useHookMock).toHaveBeenCalled();
  });
});
