type AuctionMutationIdentity = {
  id?: unknown;
  listing_id?: unknown;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeUuid = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return UUID_RE.test(normalized) ? normalized : null;
};

/** Resolves the database listing identity without changing the public auction route identity. */
export const resolveAuctionMutationListingId = (auction: AuctionMutationIdentity): string | null =>
  normalizeUuid(auction.listing_id) ?? normalizeUuid(auction.id);
