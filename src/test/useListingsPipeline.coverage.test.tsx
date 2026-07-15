import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  paginated: {} as Record<string, unknown>,
  fullFetch: {} as Record<string, unknown>,
  paginatedArgs: [] as unknown[],
  fullFetchArgs: [] as unknown[],
  fetchNextPage: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/hooks/useListings", () => ({
  useListingsPaginated: (...args: unknown[]) => {
    mocks.paginatedArgs = args;
    return mocks.paginated;
  },
  useListings: (...args: unknown[]) => {
    mocks.fullFetchArgs = args;
    return mocks.fullFetch;
  },
}));

vi.mock("@/lib/listingsCardUtils", () => ({
  listingToCard: (row: unknown) => row,
}));

vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mocks.toastError(...args) },
}));

import { useListingsPipeline, type ListingsSort, type ListingsViewMode } from "@/hooks/useListingsPipeline";

type Card = {
  id: string;
  price: number;
  isFeatured?: boolean;
  priorityPlacement?: number;
  aiScore?: number;
  views?: number;
  _raw?: {
    created_at?: string;
    has_video_tour?: boolean;
    has_virtual_tour?: boolean;
    ai_score?: number | string | null;
    walkability_score?: number | string | null;
  };
};

const filters = { listing_type: "sale" };

const card = (id: string, overrides: Partial<Card> = {}): Card => ({
  id,
  price: 100,
  isFeatured: false,
  priorityPlacement: 0,
  aiScore: 0,
  views: 0,
  _raw: { created_at: "2026-01-01T00:00:00.000Z" },
  ...overrides,
});

const defaultPaginated = () => ({
  data: { pages: [] },
  isLoading: false,
  isError: false,
  error: null,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: mocks.fetchNextPage,
});

const defaultFullFetch = () => ({
  data: [],
  isLoading: false,
  isError: false,
  error: null,
});

const options = (overrides: Partial<{
  viewMode: ListingsViewMode;
  selectedSort: ListingsSort;
  hasVideoViewing: boolean;
  hasVirtualTour: boolean;
  minAiScore: number;
  minWalkability: number;
}> = {}) => ({
  filters,
  viewMode: "grid" as ListingsViewMode,
  selectedSort: "price-asc" as ListingsSort,
  ...overrides,
});

describe("useListingsPipeline branch coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.paginated = defaultPaginated();
    mocks.fullFetch = defaultFullFetch();
  });

  it("preserves the server's paid-slot order as paginated grid pages append", () => {
    mocks.paginated = {
      ...defaultPaginated(),
      data: {
        pages: [
          { data: [card("regular-cheap", { price: 10 }), card("featured", { price: 500, isFeatured: true })] },
          { data: [card("priority", { price: 300, priorityPlacement: 4 }), card("regular-expensive", { price: 20 })] },
        ],
      },
      hasNextPage: true,
      isFetchingNextPage: true,
    };

    const { result } = renderHook(() => useListingsPipeline(options()));

    expect(result.current.filtered.map((row) => row.id)).toEqual([
      "regular-cheap",
      "featured",
      "priority",
      "regular-expensive",
    ]);
    expect(result.current.totalLoaded).toBe(4);
    expect(result.current.hasNextPage).toBe(true);
    expect(result.current.isFetchingNextPage).toBe(true);
    expect(mocks.paginatedArgs).toEqual([filters, { enabled: true }]);
    expect(mocks.fullFetchArgs).toEqual([filters, { enabled: false }]);
  });

  it("uses the bounded full fetch for split/map views and reports its loading and error state", async () => {
    const failure = new Error("map query failed");
    mocks.fullFetch = {
      data: [card("map-row")],
      isLoading: true,
      isError: true,
      error: failure,
    };

    const { result } = renderHook(() => useListingsPipeline(options({ viewMode: "map" })));

    expect(result.current.filtered.map((row) => row.id)).toEqual(["map-row"]);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isError).toBe(true);
    expect(result.current.hasNextPage).toBe(false);
    expect(mocks.paginatedArgs).toEqual([filters, { enabled: false }]);
    expect(mocks.fullFetchArgs).toEqual([filters, { enabled: true }]);
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Could not load listings. Please try again."));
  });

  it("applies video, virtual-tour, AI, and walkability visibility thresholds without hiding exact matches", () => {
    mocks.paginated = {
      ...defaultPaginated(),
      data: {
        pages: [{
          data: [
            card("eligible", { _raw: { has_video_tour: true, has_virtual_tour: true, ai_score: "80", walkability_score: 70 } }),
            card("no-video", { _raw: { has_virtual_tour: true, ai_score: 90, walkability_score: 90 } }),
            card("no-virtual", { _raw: { has_video_tour: true, ai_score: 90, walkability_score: 90 } }),
            card("low-ai", { _raw: { has_video_tour: true, has_virtual_tour: true, ai_score: 79, walkability_score: 90 } }),
            card("low-walk", { _raw: { has_video_tour: true, has_virtual_tour: true, ai_score: 90, walkability_score: 69 } }),
            card("missing-raw"),
          ],
        }],
      },
    };

    const { result } = renderHook(() => useListingsPipeline(options({
      hasVideoViewing: true,
      hasVirtualTour: true,
      minAiScore: 80,
      minWalkability: 70,
    })));

    expect(result.current.filtered.map((row) => row.id)).toEqual(["eligible"]);
    expect(result.current.totalLoaded).toBe(6);
  });

  it.each([
    ["price-asc", [card("high", { price: 900 }), card("low", { price: 100 })], ["low", "high"]],
    ["price-desc", [card("low", { price: 100 }), card("high", { price: 900 })], ["high", "low"]],
    ["newest", [card("old"), card("new", { _raw: { created_at: "2026-02-01T00:00:00Z" } })], ["new", "old"]],
    ["ai-score", [card("missing-ai", { aiScore: undefined }), card("high-ai", { aiScore: 95 })], ["high-ai", "missing-ai"]],
    ["views", [card("unseen", { views: undefined }), card("popular", { views: 50 })], ["popular", "unseen"]],
    ["future-sort", [card("first"), card("second")], ["first", "second"]],
  ] as const)("applies the %s user sort to the bounded map/split fallback", (selectedSort, rows, expected) => {
    mocks.fullFetch = { ...defaultFullFetch(), data: rows };

    const { result } = renderHook(() => useListingsPipeline(options({ selectedSort, viewMode: "split" })));

    expect(result.current.filtered.map((row) => row.id)).toEqual(expected);
  });

  it("keeps Spotlight visual-only in the default relevance sort", () => {
    mocks.fullFetch = {
      ...defaultFullFetch(),
      data: [
          card("priority-low", { priorityPlacement: 1 }),
          card("featured-old", { isFeatured: true, priorityPlacement: 1 }),
          card("featured-new", { isFeatured: true, priorityPlacement: 1, _raw: { created_at: "2026-03-01T00:00:00Z" } }),
          card("priority-high", { priorityPlacement: 8 }),
      ],
    };

    const { result } = renderHook(() => useListingsPipeline(options({ selectedSort: "featured", viewMode: "split" })));

    expect(result.current.filtered.map((row) => row.id)).toEqual([
      "priority-high",
      "featured-new",
      "priority-low",
      "featured-old",
    ]);
  });

  it("only fetches the next grid page when the sentinel intersects and no fetch is active", () => {
    const originalIntersectionObserver = window.IntersectionObserver;
    let callback: IntersectionObserverCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    window.IntersectionObserver = class {
      constructor(next: IntersectionObserverCallback) {
        callback = next;
      }
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
      takeRecords = vi.fn(() => []);
      root = null;
      rootMargin = "";
      thresholds = [];
    } as unknown as typeof IntersectionObserver;

    const { result, rerender, unmount } = renderHook(() => useListingsPipeline(options()));
    const sentinel = document.createElement("div");
    act(() => {
      result.current.sentinelRef.current = sentinel;
      mocks.paginated = { ...defaultPaginated(), hasNextPage: true };
      rerender();
    });

    expect(observe).toHaveBeenCalledWith(sentinel);
    act(() => callback?.([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(mocks.fetchNextPage).not.toHaveBeenCalled();

    act(() => callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(mocks.fetchNextPage).toHaveBeenCalledTimes(1);

    act(() => {
      mocks.paginated = { ...defaultPaginated(), hasNextPage: true, isFetchingNextPage: true };
      rerender();
    });
    act(() => callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(mocks.fetchNextPage).toHaveBeenCalledTimes(1);

    unmount();
    expect(disconnect).toHaveBeenCalled();
    window.IntersectionObserver = originalIntersectionObserver;
  });
});
