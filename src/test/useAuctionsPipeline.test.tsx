import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const { useAuctionListingsMock, useAuthMock, useSubscriptionMock, isPlatformAdminMock, refetchMock } = vi.hoisted(() => ({
  useAuctionListingsMock: vi.fn(),
  useAuthMock: vi.fn(),
  useSubscriptionMock: vi.fn(),
  isPlatformAdminMock: vi.fn(),
  refetchMock: vi.fn(),
}));

vi.mock("@/hooks/useAuctionListings", () => ({
  useAuctionListings: (...args: unknown[]) => useAuctionListingsMock(...args),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => useSubscriptionMock(),
}));

vi.mock("@/lib/authUtils", () => ({
  isPlatformAdmin: (...args: unknown[]) => isPlatformAdminMock(...args),
}));

import {
  AUCTIONS_MAX_PAGES_FREE,
  AUCTIONS_MAX_PAGES_PRO,
  AUCTIONS_PAGE_SIZE,
  useAuctionsPipeline,
} from "@/hooks/useAuctionsPipeline";

const defaultOpts = {
  selectedCity: "All Cities",
  filterType: "",
  filterBidRange: "",
  filterYearRange: "",
  filterOwnership: "",
  filterRound: "",
  filterYield: "",
  polygonFilterIds: null,
  currentPage: 1,
  setCurrentPage: vi.fn(),
};

describe("useAuctionsPipeline auction fetch limits", () => {
  beforeEach(() => {
    useAuctionListingsMock.mockReset();
    useAuthMock.mockReset();
    useSubscriptionMock.mockReset();
    isPlatformAdminMock.mockReset();
    defaultOpts.setCurrentPage.mockReset();

    useAuctionListingsMock.mockReturnValue({
      data: [],
      auctionPage: {
        data: [],
        revision: "auction-v1",
        page: 1,
        pageSize: AUCTIONS_PAGE_SIZE,
        total: 0,
        totalRaw: 0,
        totalPages: 1,
        facets: { cities: [], rounds: [] },
        stats: { thisWeek: 0, avgBid: 0, mappableCount: 0 },
      },
      isLoading: false,
      isSuccess: true,
      isFetching: false,
      error: null,
      refetch: refetchMock,
    });
    useAuthMock.mockReturnValue({ profile: null });
    useSubscriptionMock.mockReturnValue({ isPro: false });
    isPlatformAdminMock.mockReturnValue(false);
  });

  it("requests only the free-tier auction window for free users", () => {
    renderHook(() => useAuctionsPipeline(defaultOpts));

    expect(useAuctionListingsMock).toHaveBeenCalledTimes(1);
    expect(useAuctionListingsMock).toHaveBeenCalledWith(
      AUCTIONS_MAX_PAGES_FREE * AUCTIONS_PAGE_SIZE,
      expect.objectContaining({
        page: 1,
        pageSize: AUCTIONS_PAGE_SIZE,
        filters: expect.objectContaining({ city: undefined }),
      }),
    );
  });

  it("exposes the active auction query refetch for targeted retries", async () => {
    refetchMock.mockResolvedValue({ data: undefined });

    const { result } = renderHook(() => useAuctionsPipeline(defaultOpts));
    await result.current.refetch();

    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps page two selected while its server metadata is loading", () => {
    const { rerender } = renderHook(
      ({ currentPage }) => useAuctionsPipeline({ ...defaultOpts, currentPage }),
      { initialProps: { currentPage: 1 } },
    );
    defaultOpts.setCurrentPage.mockClear();
    useAuctionListingsMock.mockReturnValue({
      data: undefined,
      auctionPage: undefined,
      isLoading: true,
      error: null,
      refetch: refetchMock,
    });

    rerender({ currentPage: 2 });

    expect(defaultOpts.setCurrentPage).not.toHaveBeenCalled();
  });

  it("requests one canonical server-paginated Pro query without hydration", () => {
    useSubscriptionMock.mockReturnValue({ isPro: true });

    renderHook(() => useAuctionsPipeline(defaultOpts));

    expect(useAuctionListingsMock).toHaveBeenCalledTimes(1);
    expect(useAuctionListingsMock).toHaveBeenCalledWith(
      AUCTIONS_MAX_PAGES_PRO * AUCTIONS_PAGE_SIZE,
      expect.objectContaining({
        page: 1,
        pageSize: AUCTIONS_PAGE_SIZE,
      }),
    );
  });

  it("uses the canonical 600-row entitlement cap for platform admins", () => {
    useAuthMock.mockReturnValue({ profile: { is_platform_admin: true } });
    isPlatformAdminMock.mockReturnValue(true);

    renderHook(() => useAuctionsPipeline(defaultOpts));

    expect(useAuctionListingsMock).toHaveBeenCalledWith(
      AUCTIONS_MAX_PAGES_PRO * AUCTIONS_PAGE_SIZE,
      expect.objectContaining({ pageSize: AUCTIONS_PAGE_SIZE }),
    );
  });

  it("uses the canonical 600-row cap for unlimited investor profiles", () => {
    useAuthMock.mockReturnValue({ profile: { role: "investor", participant_type: "investor" } });
    useSubscriptionMock.mockReturnValue({ isPro: true });

    renderHook(() => useAuctionsPipeline(defaultOpts));

    expect(useAuctionListingsMock).toHaveBeenCalledWith(
      AUCTIONS_MAX_PAGES_PRO * AUCTIONS_PAGE_SIZE,
      expect.objectContaining({ pageSize: AUCTIONS_PAGE_SIZE }),
    );
  });

  it("passes every standard and premium filter to the canonical server query", () => {
    useSubscriptionMock.mockReturnValue({ isPro: true });
    const polygonFilterIds = new Set(["auction-a", "auction-b"]);
    renderHook(() => useAuctionsPipeline({
      ...defaultOpts,
      selectedCity: "Patras",
      filterType: "land:plot",
      filterBidRange: "50000-150000",
      filterYearRange: "1980-2000",
      filterSqmRange: "80-140",
      filterOwnership: "full",
      filterRound: "3plus",
      filterYield: "high",
      polygonFilterIds,
      currentPage: 3,
    }));

    expect(useAuctionListingsMock).toHaveBeenCalledWith(
      AUCTIONS_MAX_PAGES_PRO * AUCTIONS_PAGE_SIZE,
      expect.objectContaining({
        page: 3,
        pageSize: AUCTIONS_PAGE_SIZE,
        filters: {
          city: "Patras",
          propertyType: "land:plot",
          bidRange: "50000-150000",
          yearRange: "1980-2000",
          sqmRange: "80-140",
          ownership: "full",
          round: "3plus",
          yield: "high",
          ids: ["auction-a", "auction-b"],
        },
      }),
    );
  });

  it("trusts the server-filtered page and uses server totals and facets", () => {
    useAuctionListingsMock.mockReturnValue({
      data: [{ id: "server-row", city: "Patras", tags: [] }],
      auctionPage: {
        data: [{ id: "server-row", city: "Patras", tags: [] }],
        revision: "auction-v1",
        page: 2,
        pageSize: AUCTIONS_PAGE_SIZE,
        total: 41,
        totalRaw: 73,
        totalPages: 3,
        facets: { cities: ["Athens", "Patras"], rounds: [1, 3] },
        stats: { thisWeek: 8, avgBid: 125_000, mappableCount: 30 },
      },
      isLoading: false,
      isSuccess: true,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useAuctionsPipeline({
      ...defaultOpts,
      selectedCity: "Athens",
      currentPage: 2,
    }));

    expect(result.current.paginated.map((row) => row.id)).toEqual(["server-row"]);
    expect(result.current.visibleFiltered.map((row) => row.id)).toEqual(["server-row"]);
    expect(result.current.visibleCount).toBe(41);
    expect(result.current.polygonFilteredCount).toBe(41);
    expect(result.current.totalPages).toBe(3);
    expect(result.current.totalRaw).toBe(73);
    expect(result.current.cityOptions).toEqual(["All Cities", "Athens", "Patras"]);
    expect(result.current.roundOptions.map((row) => row.value)).toEqual(["", "1", "3plus"]);
    expect(result.current.thisWeek).toBe(8);
    expect(result.current.avgBid).toBe(125_000);
  });
});
