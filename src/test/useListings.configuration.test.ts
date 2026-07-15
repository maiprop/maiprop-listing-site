import { beforeEach, describe, expect, it, vi } from "vitest";

const { authState, infiniteQueryMock, invokeMock, publicApiMock, queryMock } = vi.hoisted(() => ({
  authState: { user: null as null | { id: string } },
  infiniteQueryMock: vi.fn((options: unknown) => options),
  invokeMock: vi.fn(),
  publicApiMock: vi.fn(),
  queryMock: vi.fn((options: unknown) => options),
}));

const makeBuilder = (data: unknown[] = []) => {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "order", "limit", "range", "ilike", "or", "eq", "in", "gte", "lte"]) {
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
  },
}));

vi.mock("@/lib/publicApi", () => ({
  fetchPublicApi: (...args: unknown[]) => publicApiMock(...args),
  isPublicApiAbort: () => false,
}));

import {
  useListing,
  useListings,
  useListingsPaginated,
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
      features: ["has_parking", "has_balcony"],
      sort: "price-asc",
      limit: 80,
    }) as unknown as QueryOptions;

    await options.queryFn({ signal: new AbortController().signal });
    const path = String(publicApiMock.mock.calls[0][0]);
    expect(path).toContain("city=Athens");
    expect(path).toContain("location_lat=37.98");
    expect(path).toContain("includeAuctions=false");
    expect(path).toContain("beds_min=0");
    expect(path).toContain("energy_class=A&energy_class=B%2B");
    expect(path).toContain("features=has_parking&features=has_balcony");
    expect(path).not.toContain("commercial_subtype=");
    expect(path).not.toContain("limit=");
    expect(path).toContain("pageSize=80");
  });

  it("keeps user-scoped reads disabled and short-lived when requested", () => {
    const ownerOptions = useListings({ owner_id: "owner-1" }, { enabled: false }) as unknown as QueryOptions;
    const publicOptions = useListings({ owner_id: "owner-1" }, { publicScope: true }) as unknown as QueryOptions;

    expect(ownerOptions.enabled).toBe(false);
    expect(publicOptions.enabled).toBe(true);
    expect(ownerOptions.staleTime).toBeLessThan(publicOptions.staleTime);
    expect(ownerOptions.queryKey).toEqual(["listings", { owner_id: "owner-1" }, { publicScope: false }]);
    expect(publicOptions.queryKey).toEqual(["listings", { owner_id: "owner-1" }, { publicScope: true }]);
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

    const enabled = useOwnerProStatus("listing-1", "owner-1", { initialData: false }) as unknown as QueryOptions;
    expect(enabled.enabled).toBe(true);
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

  it("scopes the shorthand listing query to the authenticated owner", () => {
    authState.user = { id: "user-42" };
    const options = useMyListings() as unknown as QueryOptions;
    expect(options.queryKey).toEqual(["listings", { owner_id: "user-42" }, { publicScope: false }]);

    authState.user = null;
    const signedOut = useMyListings() as unknown as QueryOptions;
    expect(signedOut.queryKey).toEqual(["listings", { owner_id: undefined }, { publicScope: false }]);
  });
});
