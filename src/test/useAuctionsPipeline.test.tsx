import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const { useAuctionListingsMock, useAuthMock, useSubscriptionMock, isPlatformAdminMock } = vi.hoisted(() => ({
  useAuctionListingsMock: vi.fn(),
  useAuthMock: vi.fn(),
  useSubscriptionMock: vi.fn(),
  isPlatformAdminMock: vi.fn(),
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

    useAuctionListingsMock.mockReturnValue({ data: [], isLoading: false, error: null });
    useAuthMock.mockReturnValue({ profile: null });
    useSubscriptionMock.mockReturnValue({ isPro: false });
    isPlatformAdminMock.mockReturnValue(false);
  });

  it("requests only the free-tier auction window for free users", () => {
    renderHook(() => useAuctionsPipeline(defaultOpts));

    expect(useAuctionListingsMock).toHaveBeenCalledWith(AUCTIONS_MAX_PAGES_FREE * AUCTIONS_PAGE_SIZE);
  });

  it("requests only the pro-tier auction window for Pro users", () => {
    useSubscriptionMock.mockReturnValue({ isPro: true });

    renderHook(() => useAuctionsPipeline(defaultOpts));

    expect(useAuctionListingsMock).toHaveBeenCalledWith(AUCTIONS_MAX_PAGES_PRO * AUCTIONS_PAGE_SIZE);
  });

  it("uses the hook default fetch limit for platform admins", () => {
    useAuthMock.mockReturnValue({ profile: { is_platform_admin: true } });
    isPlatformAdminMock.mockReturnValue(true);

    renderHook(() => useAuctionsPipeline(defaultOpts));

    expect(useAuctionListingsMock).toHaveBeenCalledWith(undefined);
  });
});
