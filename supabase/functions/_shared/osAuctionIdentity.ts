const OS_AUCTION_ID_RE = /^[a-z0-9:_-]{1,120}$/;
const PLACEHOLDER_IDS = new Set([
  "unknown",
  "null",
  "undefined",
  "none",
  "na",
  "n/a",
]);
const REFRESHED_TAG_PREFIXES = [
  "os_auction:",
  "auction_status:",
  "round:",
  "ownership:",
  "ownership_pct:",
  "land_type:",
  "commercial_type:",
] as const;
const POOL_TAG_PREFIX = "auction_pool:";

export function normalizeOsAuctionId(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) return null;
    value = String(value);
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!OS_AUCTION_ID_RE.test(normalized) || PLACEHOLDER_IDS.has(normalized)) {
    return null;
  }
  return normalized;
}

export function requireOsAuctionId(value: unknown): string {
  const normalized = normalizeOsAuctionId(value);
  if (normalized == null) throw new TypeError("invalid_os_auction_id");
  return normalized;
}

export function dedupeByOsAuctionTag<T extends { tagKey: string }>(
  rows: readonly T[],
): T[] {
  const byIdentity = new Map<string, T>();
  for (const row of rows) byIdentity.set(row.tagKey, row);
  return [...byIdentity.values()];
}

function stableValueKey(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return `[${value.map(stableValueKey).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) =>
          `${JSON.stringify(key)}:${stableValueKey(entry)}`
        )
        .join(",")
    }}`;
  }
  if (typeof value === "string") return `string:${JSON.stringify(value)}`;
  return `${typeof value}:${String(value)}`;
}

function getFiniteRound(value: unknown): number | null {
  const round = Number(value);
  return Number.isFinite(round) ? round : null;
}

export function dedupeOsAuctionsById<
  T extends { auctionListingId?: unknown; currentRound?: unknown },
>(rows: readonly T[]): T[] {
  const byIdentity = new Map<string, T>();
  for (const row of rows) {
    const identity = normalizeOsAuctionId(row.auctionListingId);
    if (identity == null) continue;
    const previous = byIdentity.get(identity);
    if (previous == null) {
      byIdentity.set(identity, row);
      continue;
    }
    const previousRound = getFiniteRound(previous.currentRound);
    const incomingRound = getFiniteRound(row.currentRound);
    const incomingWinsRound = incomingRound != null &&
      (previousRound == null || incomingRound > previousRound);
    const roundsTie = incomingRound === previousRound;
    if (
      incomingWinsRound ||
      (roundsTie && stableValueKey(row) > stableValueKey(previous))
    ) byIdentity.set(identity, row);
  }
  return [...byIdentity.values()];
}

export function mergeOsAuctionTags(
  existing: readonly string[],
  incoming: readonly string[],
): string[] {
  const incomingReplacesPool = incoming.some((tag) =>
    tag.startsWith(POOL_TAG_PREFIX)
  );
  const retained = existing.filter((tag) =>
    tag !== "source:maiprop-os" &&
    !REFRESHED_TAG_PREFIXES.some((prefix) => tag.startsWith(prefix)) &&
    !(incomingReplacesPool && tag.startsWith(POOL_TAG_PREFIX))
  );
  return [...new Set([...retained, ...incoming])];
}

type OsQueryError = { message?: string } | null;
type OsQueryResult<T> = {
  data?: T[] | null;
  count?: number | null;
  error?: OsQueryError;
};
type OsListingQuery<T> = PromiseLike<OsQueryResult<T>> & {
  in: (column: string, values: readonly unknown[]) => OsListingQuery<T>;
  eq: (column: string, value: unknown) => OsListingQuery<T>;
  is: (column: string, value: null) => OsListingQuery<T>;
  contains: (column: string, values: readonly unknown[]) => OsListingQuery<T>;
  select: (columns: string) => OsListingQuery<T>;
};

export type CanonicalOsListing = {
  id: string;
  os_auction_id: string;
  tags?: string[] | null;
};

export type OsAuctionListingTable = {
  select: (columns: string) => OsListingQuery<CanonicalOsListing>;
  update: (
    values: Record<string, unknown>,
    options: { count: "exact" },
  ) => OsListingQuery<CanonicalOsListing>;
  upsert: (
    values: readonly Record<string, unknown>[],
    options: { onConflict: "os_auction_id"; ignoreDuplicates: true },
  ) => OsListingQuery<{ id: string }>;
};

export function requireValidOsAuctionBatch(
  rawCount: number,
  validCount: number,
): void {
  if (rawCount > 0 && validCount === 0) {
    throw new TypeError("no_valid_os_auction_identities");
  }
}

export async function lookupCanonicalOsListings(
  table: OsAuctionListingTable,
  osIds: readonly string[],
): Promise<CanonicalOsListing[]> {
  const { data, error } = await table
    .select("id, os_auction_id, tags")
    .in("os_auction_id", osIds)
    .eq("listing_type", "auction")
    .is("owner_id", null)
    .contains("tags", ["source:maiprop-os"]);
  if (error) {
    throw new Error(error.message ?? "canonical_os_listing_lookup_failed");
  }
  return data ?? [];
}

export async function updateCanonicalOsListing(
  table: OsAuctionListingTable,
  input: {
    id: string;
    osId: string;
    data: Record<string, unknown>;
    requiredTags?: readonly string[];
  },
): Promise<boolean> {
  const { count, error } = await table
    .update(input.data, { count: "exact" })
    .eq("id", input.id)
    .eq("os_auction_id", input.osId)
    .eq("listing_type", "auction")
    .is("owner_id", null)
    .contains("tags", ["source:maiprop-os", ...(input.requiredTags ?? [])]);
  if (error) {
    throw new Error(error.message ?? "canonical_os_listing_update_failed");
  }
  return count === 1;
}

export async function insertOsAuctionRows(
  table: OsAuctionListingTable,
  rows: readonly Record<string, unknown>[],
): Promise<number> {
  const { data, error } = await table.upsert(rows, {
    onConflict: "os_auction_id",
    ignoreDuplicates: true,
  }).select("id");
  if (error) {
    throw new Error(error.message ?? "canonical_os_listing_insert_failed");
  }
  return data?.length ?? 0;
}
