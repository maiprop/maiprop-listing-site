import { beforeEach, describe, expect, it, vi } from "vitest";

const { authState, infiniteQueryMock, invokeMock, publicApiMock, queryMock, rpcMock } = vi.hoisted(() => ({
  authState: { user: null as null | { id: string } },
  infiniteQueryMock: vi.fn((options: unknown) => options),
  invokeMock: vi.fn(),
  publicApiMock: vi.fn(),
  queryMock: vi.fn((options: unknown) => options),
  rpcMock: vi.fn(),
}));

const makeBuilder = (data: unknown[] = []) => {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "order", "limit", "range", "ilike", "or", "eq", "is", "in", "gte", "lte"]) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  builder.abortSignal = vi.fn().mockReturnValue(builder);
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) =>
    Promise.resolve({ data, error: null }).then(resolve, reject);
  return builder;
};

const fromMock = vi.fn(() => makeBuilder());

vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: infiniteQueryMock,
  useQuery: queryMock,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

vi.mock("@/lib/publicApi", () => ({
  fetchPublicApi: (...args: unknown[]) => publicApiMock(...args),
  isPublicApiAbort: () => false,
}));

import {
  useActorOwnedListings,
  useListing,
  useListings,
  useListingsPaginated,
  useManageableListingSummary,
  useMyListings,
  useOwnerProStatus,
} from "@/hooks/useListings";

type InfiniteOptions = {
  queryFn: (context: { pageParam?: unknown; signal?: AbortSignal }) => Promise<unknown>;
  getNextPageParam: (
    lastPage: {
      data: unknown[];
      hasMore: boolean;
      nextCursor?: string | null;
      page?: number;
      pageSize?: number;
      offset?: number;
    },
    allPages: Array<{
      data: unknown[];
      hasMore: boolean;
      nextCursor?: string | null;
      page?: number;
      pageSize?: number;
      offset?: number;
    }>,
  ) => unknown;
  enabled: boolean;
  staleTime: number;
  initialPageParam: unknown;
  queryKey: unknown[];
};

type QueryOptions = {
  queryFn: (context?: { signal?: AbortSignal }) => Promise<unknown>;
  enabled: boolean;
  staleTime: number;
  placeholderData?: unknown;
  initialData?: unknown;
  queryKey: unknown[];
};

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = null;
  publicApiMock.mockResolvedValue({
    data: [],
    hasMore: false,
    nextCursor: null,
    page: 1,
    pageSize: 12,
    offset: 0,
  });
  invokeMock.mockResolvedValue({ data: { isPro: true }, error: null });
  rpcMock.mockResolvedValue({ data: null, error: null });
});

describe("useListings query configuration", () => {
  it("normalizes numeric, object, invalid, and initial infinite-page parameters", async () => {
    const options = useListingsPaginated({ listing_type: "sale" }) as unknown as InfiniteOptions;
    const signal = new AbortController().signal;

    await options.queryFn({ pageParam: 2.9, signal });
    expect(publicApiMock.mock.calls.at(-1)?.[0]).toContain("page=2&pageSize=40");

    await options.queryFn({ pageParam: { page: "bad", pageSize: 1000, offset: -4 }, signal });
    expect(publicApiMock.mock.calls.at(-1)?.[0]).toContain("page=1&pageSize=40");
    expect(publicApiMock.mock.calls.at(-1)?.[0]).not.toContain("offset=");

    await options.queryFn({ pageParam: { page: 3.8, pageSize: 0, offset: 41.9 }, signal });
    expect(publicApiMock.mock.calls.at(-1)?.[0]).toContain("page=3&pageSize=1&offset=41");

    await options.queryFn({ pageParam: null, signal });
    expect(publicApiMock.mock.calls.at(-1)?.[0]).toContain("page=1&pageSize=12");
    expect(publicApiMock.mock.calls.at(-1)?.[0]).not.toContain("offset=");
    expect(options.initialPageParam).toEqual({ page: 1, pageSize: 12 });
  });

  it("carries opaque cursors while retaining fallback offsets without duplicates", () => {
    const options = useListingsPaginated() as unknown as InfiniteOptions;
    expect(options.getNextPageParam(
      { data: [], hasMore: false, page: 1, pageSize: 12, offset: 0 },
      [],
    )).toBeUndefined();

    expect(options.getNextPageParam(
      {
        data: Array(12),
        hasMore: true,
        nextCursor: "v1.first-cursor",
        page: 1,
        pageSize: 12,
        offset: 0,
      },
      [{
        data: Array(12),
        hasMore: true,
        nextCursor: "v1.first-cursor",
        page: 1,
        pageSize: 12,
        offset: 0,
      }],
    )).toEqual({
      page: 1,
      pageSize: 28,
      cursor: "v1.first-cursor",
      offset: 12,
    });

    expect(options.getNextPageParam(
      {
        data: Array(28),
        hasMore: true,
        nextCursor: "v1.second-cursor",
        page: 1,
        pageSize: 28,
        offset: 12,
      },
      [
        { data: Array(12), hasMore: true, page: 1, pageSize: 12, offset: 0 },
        {
          data: Array(28),
          hasMore: true,
          nextCursor: "v1.second-cursor",
          page: 1,
          pageSize: 28,
          offset: 12,
        },
      ],
    )).toEqual({
      page: 2,
      pageSize: 40,
      cursor: "v1.second-cursor",
      offset: 40,
    });

    expect(options.getNextPageParam(
      { data: [1, 2, 3], hasMore: true, page: 1, pageSize: Number.NaN, offset: Number.NaN },
      [
        { data: [0], hasMore: true },
        { data: [1, 2, 3], hasMore: true },
      ],
    )).toEqual({ page: 1, pageSize: 36, offset: 4 });
  });

  it("serializes every supported public filter without leaking blank values", async () => {
    const options = useListings({
      city: "Athens",
      location_lat: 37.98,
      location_lng: 23.73,
      location_radius_m: 1500,
      boundsWest: 23.7,
      boundsSouth: 37.9,
      boundsEast: 23.8,
      boundsNorth: 38.05,
      listing_type: "sale",
      property_type: "apartment",
      includeAuctions: false,
      price_min: 100000,
      price_max: 500000,
      beds_min: 0,
      beds_max: 4,
      baths_min: 1,
      baths_max: 3,
      sqm_min: 40,
      sqm_max: 180,
      floor_min: -1,
      floor_max: 8,
      year_min: 1980,
      year_max: 2026,
      energy_class: ["A", "B+"],
      heating_system: "autonomous_gas",
      construction_status: "new",
      commercial_subtype: "",
      is_pre_sale: false,
      is_off_market: false,
      has_video_tour: true,
      has_virtual_tour: true,
      ai_score_min: 80,
      walkability_min: 70,
      features: ["has_parking", "has_balcony"],
      sort: "price-asc",
      limit: 80,
    }) as unknown as QueryOptions;

    await options.queryFn({ signal: new AbortController().signal });
    const path = String(publicApiMock.mock.calls[0][0]);
    expect(path).toContain("city=Athens");
    expect(path).toContain("location_lat=37.98");
    expect(path).toContain("boundsWest=23.7");
    expect(path).toContain("boundsSouth=37.9");
    expect(path).toContain("boundsEast=23.8");
    expect(path).toContain("boundsNorth=38.05");
    expect(path).toContain("includeAuctions=false");
    expect(path).toContain("beds_min=0");
    expect(path).toContain("energy_class=A&energy_class=B%2B");
    expect(path).toContain("features=has_parking&features=has_balcony");
    expect(path).toContain("has_video_tour=true");
    expect(path).toContain("has_virtual_tour=true");
    expect(path).toContain("ai_score_min=80");
    expect(path).toContain("walkability_min=70");
    expect(path).not.toContain("commercial_subtype=");
    expect(path).not.toContain("limit=");
    expect(path).toContain("pageSize=80");
  });

  it("does not change catalogue authority when public list or detail requests fail", async () => {
    publicApiMock.mockRejectedValue(new Error("canonical listings API unavailable"));
    const mapOptions = useListings({ listing_type: "sale" }) as unknown as QueryOptions;
    const pageOptions = useListingsPaginated({ listing_type: "sale" }) as unknown as InfiniteOptions;
    const detailOptions = useListing("listing-1", { publicScope: true }) as unknown as QueryOptions;
    const signal = new AbortController().signal;

    await expect(mapOptions.queryFn({ signal })).rejects.toThrow("canonical listings API unavailable");
    await expect(pageOptions.queryFn({ pageParam: null, signal })).rejects.toThrow("canonical listings API unavailable");
    await expect(detailOptions.queryFn({ signal })).rejects.toThrow("canonical listings API unavailable");

    expect(rpcMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("keeps user-scoped reads disabled and short-lived when requested", () => {
    const ownerOptions = useListings({ owner_id: "owner-1" }, { enabled: false }) as unknown as QueryOptions;
    const publicOptions = useListings({ owner_id: "owner-1" }, { publicScope: true }) as unknown as QueryOptions;

    expect(ownerOptions.enabled).toBe(false);
    expect(publicOptions.enabled).toBe(true);
    expect(ownerOptions.staleTime).toBeLessThan(publicOptions.staleTime);
    expect(ownerOptions.queryKey).toEqual([
      "listings",
      { owner_id: "owner-1" },
      { publicScope: false, manageableScope: false },
    ]);
    expect(publicOptions.queryKey).toEqual([
      "listings",
      { owner_id: "owner-1" },
      { publicScope: true, manageableScope: false },
    ]);
  });

  it("normalizes detail placeholders and respects empty identifiers", () => {
    const options = useListing("listing-1", {
      publicScope: true,
      initialData: {
        id: "listing-1",
        profiles: undefined,
        listing_images: undefined,
        ownerIsPro: undefined,
        ownerParticipantType: undefined,
      } as never,
    }) as unknown as QueryOptions;
    const disabled = useListing("") as unknown as QueryOptions;

    expect(options.enabled).toBe(true);
    expect(options.placeholderData).toEqual(expect.objectContaining({
      id: "listing-1",
      profiles: null,
      listing_images: [],
      ownerIsPro: false,
      ownerParticipantType: null,
    }));
    expect(disabled.enabled).toBe(false);
  });

  it("gates owner entitlement calls and returns strict boolean results", async () => {
    const disabled = useOwnerProStatus(undefined, null) as unknown as QueryOptions;
    expect(disabled.enabled).toBe(false);
    await expect(disabled.queryFn()).resolves.toBe(false);

    const anonymous = useOwnerProStatus("listing-1", "owner-1") as unknown as QueryOptions;
    expect(anonymous.enabled).toBe(false);
    expect(anonymous.queryKey).toEqual(["owner-pro-status", null, "listing-1", "owner-1"]);
    expect(invokeMock).not.toHaveBeenCalled();

    authState.user = { id: "user-42" };
    const enabled = useOwnerProStatus("listing-1", "owner-1", { initialData: false }) as unknown as QueryOptions;
    expect(enabled.enabled).toBe(true);
    expect(enabled.queryKey).toEqual(["owner-pro-status", "user-42", "listing-1", "owner-1"]);
    expect(enabled.initialData).toBe(false);
    await expect(enabled.queryFn()).resolves.toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("owner-pro-status", { body: { listingId: "listing-1" } });

    invokeMock.mockResolvedValueOnce({ data: null, error: null });
    await expect(enabled.queryFn()).resolves.toBe(false);
    invokeMock.mockResolvedValueOnce({ data: null, error: new Error("entitlement unavailable") });
    await expect(enabled.queryFn()).rejects.toThrow("entitlement unavailable");

    const explicitlyDisabled = useOwnerProStatus("listing-1", "owner-1", { enabled: false }) as unknown as QueryOptions;
    expect(explicitlyDisabled.enabled).toBe(false);
  });

  it("separates actor-funded quota inventory from capability-managed inventory", async () => {
    authState.user = { id: "user-42" };
    const owned = useActorOwnedListings() as unknown as QueryOptions;
    const managed = useMyListings() as unknown as InfiniteOptions;
    const summary = useManageableListingSummary() as unknown as QueryOptions;

    expect(owned.queryKey).toEqual([
      "listings",
      { owner_id: "user-42", personalOnly: true },
      { publicScope: false, manageableScope: false },
    ]);
    expect(managed.queryKey).toEqual(["manageable-listings", "user-42"]);
    expect(managed.initialPageParam).toBeNull();
    expect(summary.queryKey).toEqual(["manageable-listing-summary", "user-42"]);
    expect(owned.enabled).toBe(true);
    expect(managed.enabled).toBe(true);
    expect(summary.enabled).toBe(true);

    rpcMock.mockResolvedValueOnce({
      data: [{
        data: [
          { id: "listing-3", created_at: "2026-07-28T09:00:00Z" },
          { id: "listing-2", created_at: "2026-07-28T09:00:00Z" },
        ],
        total_count: 203,
        next_created_at: "2026-07-28T09:00:00Z",
        next_id: "listing-2",
      }],
      error: null,
    });
    const firstPage = await managed.queryFn({ pageParam: null }) as {
      data: Array<{ id: string }>;
      total: number;
      nextCursor: { createdAt: string; id: string } | null;
    };
    expect(rpcMock).toHaveBeenLastCalledWith("get_manageable_listing_catalogue_page", {
      p_limit: 50,
    });
    expect(firstPage.data.map((listing) => listing.id)).toEqual(["listing-3", "listing-2"]);
    expect(firstPage.total).toBe(203);
    expect(firstPage.nextCursor).toEqual({
      createdAt: "2026-07-28T09:00:00Z",
      id: "listing-2",
    });
    expect(managed.getNextPageParam(firstPage as never, [firstPage as never])).toEqual(firstPage.nextCursor);

    rpcMock.mockResolvedValueOnce({
      data: {
        totalListings: 203,
        activeListings: 120,
        totalViews: 9999,
        averageViews: 49,
        averageActiveDays: 31,
        bestListing: { id: "listing-3", title: "Top listing", viewsCount: 800 },
      },
      error: null,
    });
    await expect(summary.queryFn()).resolves.toEqual({
      totalListings: 203,
      activeListings: 120,
      totalViews: 9999,
      averageViews: 49,
      averageActiveDays: 31,
      bestListing: { id: "listing-3", title: "Top listing", viewsCount: 800 },
    });

    authState.user = null;
    const signedOutOwned = useActorOwnedListings() as unknown as QueryOptions;
    const signedOutManaged = useMyListings() as unknown as InfiniteOptions;
    const signedOutSummary = useManageableListingSummary() as unknown as QueryOptions;
    expect(signedOutOwned.enabled).toBe(false);
    expect(signedOutManaged.enabled).toBe(false);
    expect(signedOutSummary.enabled).toBe(false);
  });
});
