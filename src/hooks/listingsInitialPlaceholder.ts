import type { InitialListingsPage } from "@/lib/homepageSnapshotCache";

type DefaultCatalogueSnapshot = "sale" | "rent" | "mixed";

type SnapshotListing = {
  id: string;
  created_at: string;
  listing_type: string | null;
};

type InitialListingsPageParam = {
  page: number;
  pageSize: number;
  cursor?: string;
  offset?: number;
};

type InitialListingsPlaceholderPage<T> = {
  data: T[];
  hasMore: boolean;
  nextCursor?: string | null;
  page: number;
  pageSize: number;
  offset?: number;
  publicationId?: number;
};

type InitialListingsPlaceholder<T> = {
  pages: InitialListingsPlaceholderPage<T>[];
  pageParams: InitialListingsPageParam[];
};

type InitialListingsPlaceholderOptions<T extends SnapshotListing> = {
  filters?: Record<string, unknown>;
  initialGridPageSize: number;
  initialPageParam: InitialListingsPageParam;
  normalizeListing: (listing: T) => T;
  readInitialListingsPage: (listingType: "sale" | "rent") => InitialListingsPage<T> | undefined;
};

function getDefaultCatalogueSnapshot(filters?: Record<string, unknown>): DefaultCatalogueSnapshot | undefined {
  const listingType = filters?.listing_type;
  if (listingType && listingType !== "sale" && listingType !== "rent") return undefined;

  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (key === "listing_type") continue;
    if (key === "sort" && value === "relevant") continue;
    return undefined;
  }

  return listingType === "sale" || listingType === "rent" ? listingType : "mixed";
}

function mixedPlaceholderCreatedAt(listing: SnapshotListing): number | null {
  const createdAt = Date.parse(listing.created_at);
  return Number.isFinite(createdAt) ? createdAt : null;
}

export function getInitialListingsPlaceholder<T extends SnapshotListing>(
  {
    filters,
    initialGridPageSize,
    initialPageParam,
    normalizeListing,
    readInitialListingsPage,
  }: InitialListingsPlaceholderOptions<T>,
): InitialListingsPlaceholder<T> | undefined {
  const snapshot = getDefaultCatalogueSnapshot(filters);
  if (!snapshot) return undefined;

  if (snapshot === "mixed") {
    const salePage = readInitialListingsPage("sale");
    const rentPage = readInitialListingsPage("rent");
    if (!salePage || !rentPage) return undefined;

    const listingsById = new Map<string, T>();
    for (const listing of [...salePage.data, ...rentPage.data]) {
      const id = typeof listing.id === "string" ? listing.id.trim() : "";
      if (!id || listingsById.has(id)) continue;
      if (listing.listing_type !== "sale" && listing.listing_type !== "rent" && listing.listing_type !== "new_build") {
        continue;
      }
      listingsById.set(id, listing);
    }

    const listings = [...listingsById.values()]
      .sort((left, right) => {
        const leftCreatedAt = mixedPlaceholderCreatedAt(left);
        const rightCreatedAt = mixedPlaceholderCreatedAt(right);
        if (leftCreatedAt !== null && rightCreatedAt !== null && leftCreatedAt !== rightCreatedAt) {
          return rightCreatedAt - leftCreatedAt;
        }
        if (leftCreatedAt !== null && rightCreatedAt === null) return -1;
        if (leftCreatedAt === null && rightCreatedAt !== null) return 1;
        return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
      })
      .slice(0, initialGridPageSize)
      .map(normalizeListing);
    if (listings.length === 0) return undefined;

    return {
      pages: [{
        data: listings,
        hasMore: false,
        nextCursor: null,
        page: 1,
        pageSize: initialGridPageSize,
        offset: 0,
      }],
      pageParams: [initialPageParam],
    };
  }

  const page = readInitialListingsPage(snapshot);
  if (!page || page.data.length === 0) return undefined;
  return {
    pages: [{ ...page, data: page.data.map(normalizeListing) }],
    pageParams: [initialPageParam],
  };
}
