import {
  cachedJson,
  getPublicCataloguePublication,
  isPublicCatalogueSnapshotExpiredError,
  isSupabaseTransientError,
  jsonResponse,
  methodNotAllowed,
  missingRuntime,
  normalizedCacheUrl,
  publicCatalogueValidityHeaders,
  safeDecimal,
  safeInt,
  safeText,
  safeToken,
  supabaseRpcJson,
  upstreamUnavailable,
  type PublicCatalogueQueryRpcRow,
  type PublicApiCtx,
  type PublicApiEnv,
} from "./_cache";
import { getSupabaseRuntime } from "../../_seo";
import { publicListingRows } from "./_fixture-content";
import { hasActivePriority, normalizePublicPromotionState } from "./_promotionState";
import { fetchPublicProfileSummaries, publicProfileDisplay } from "./_publicProfiles";

type ListingRow = {
  id: string;
  owner_id?: string | null;
  created_at?: string | null;
  price?: number | string | null;
  listing_type?: string | null;
  title?: string | null;
  address?: string | null;
  city?: string | null;
  property_type?: string | null;
  sqm?: number | string | null;
  auction_date?: string | null;
  auction_starting_bid?: number | string | null;
  is_featured?: boolean | null;
  featured_until?: string | null;
  priority_placement?: number | null;
  priority_until?: string | null;
  tags?: unknown;
  [key: string]: unknown;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LISTING_TYPES = ["sale", "rent", "firesale", "auction", "open_house", "new_build"] as const;
const PROPERTY_TYPES = ["apartment", "house", "villa", "land", "commercial", "office", "warehouse", "hotel"] as const;
const SIMILAR_LISTINGS_CANDIDATE_LIMIT = 48;
const SIMILAR_LISTINGS_LIMIT_MAX = 24;
const SIMILAR_LISTINGS_CACHE_VERSION = "publication-similar-v3";

function buildSimilarParams(requestUrl: URL): {
  cacheParams: URLSearchParams;
  city: string | null;
  propertyType: (typeof PROPERTY_TYPES)[number] | null;
  listingType: (typeof LISTING_TYPES)[number] | null;
  excludeId: string | null;
  publicationId: number | null;
  limit: number;
  price: number | null;
} | null {
  const city = safeText(requestUrl.searchParams.get("city"));
  const propertyType = safeToken(requestUrl.searchParams.get("propertyType"), PROPERTY_TYPES);
  const listingType = safeToken(requestUrl.searchParams.get("listingType"), LISTING_TYPES);
  const excludeId = requestUrl.searchParams.get("excludeId")?.trim() ?? "";
  const priceValue = safeDecimal(requestUrl.searchParams.get("price"));
  const price = priceValue ? Number(priceValue) : null;
  const limit = safeInt(requestUrl.searchParams.get("limit"), 8, 1, SIMILAR_LISTINGS_LIMIT_MAX);
  const publicationValue = requestUrl.searchParams.get("publicationId");
  const publicationId = publicationValue == null ? null : Number(publicationValue);

  if (
    (!city && !propertyType) ||
    (
      publicationValue != null &&
      (
        publicationId == null ||
        !Number.isSafeInteger(publicationId) ||
        publicationId < 1
      )
    )
  ) {
    return null;
  }

  const cacheParams = new URLSearchParams([
    ["limit", String(limit)],
    ["publicationId", publicationId == null ? "current" : String(publicationId)],
  ]);
  if (UUID_RE.test(excludeId)) cacheParams.set("excludeId", excludeId);
  if (city) cacheParams.set("city", city);
  if (propertyType) cacheParams.set("propertyType", propertyType);
  if (listingType) cacheParams.set("listingType", listingType);
  if (price != null) cacheParams.set("price", String(price));

  return {
    cacheParams,
    city,
    propertyType,
    listingType,
    excludeId: UUID_RE.test(excludeId) ? excludeId : null,
    publicationId,
    limit,
    price,
  };
}

function sortBySimilarity(rows: ListingRow[], price: number | null, nowMs: number): ListingRow[] {
  return [...rows].sort((a, b) => {
    if (price != null && price > 0) {
      const aPrice = Math.abs(Number(a.price ?? 0) - price);
      const bPrice = Math.abs(Number(b.price ?? 0) - price);
      const relevanceDelta = aPrice - bPrice;
      if (relevanceDelta !== 0) return relevanceDelta;
    }

    // The capped similarity set keeps relevance first; Priority only resolves exact relevance ties.
    const priorityDelta = Number(hasActivePriority(b, nowMs)) - Number(hasActivePriority(a, nowMs));
    if (priorityDelta !== 0) return priorityDelta;

    const aCreatedAt = typeof a.created_at === "string" ? Date.parse(a.created_at) : 0;
    const bCreatedAt = typeof b.created_at === "string" ? Date.parse(b.created_at) : 0;
    const createdAtDelta = (Number.isFinite(bCreatedAt) ? bCreatedAt : 0) -
      (Number.isFinite(aCreatedAt) ? aCreatedAt : 0);
    if (createdAtDelta !== 0) return createdAtDelta;
    return String(a.id).localeCompare(String(b.id));
  });
}

function normalizeIdentityPart(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getOsAuctionTag(tags: unknown): string | null {
  if (!Array.isArray(tags)) return null;
  const tag = tags.find((value): value is string =>
    typeof value === "string" && /^os_auction:/i.test(value.trim()),
  );
  return tag ? normalizeIdentityPart(tag) : null;
}

function similarListingIdentity(row: ListingRow): string {
  const id = normalizeIdentityPart(row.id);
  if (normalizeIdentityPart(row.listing_type) !== "auction") return `id:${id}`;

  const osAuctionTag = getOsAuctionTag(row.tags);
  if (osAuctionTag) return `auction:${osAuctionTag}`;

  const parts = [
    row.title,
    row.address,
    row.city,
    row.property_type,
    row.price,
    row.sqm,
    row.auction_date,
    row.auction_starting_bid,
  ].map(normalizeIdentityPart);
  const hasEnoughAuctionShape = parts.slice(0, 3).every(Boolean) && (parts[4] || parts[5] || parts[6]);
  return hasEnoughAuctionShape ? `auction:${parts.join("|")}` : `id:${id}`;
}

function dedupeSimilarRows<T extends ListingRow>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const identity = similarListingIdentity(row);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

async function publicSimilarListings(ctx: PublicApiCtx, requestUrl: URL): Promise<Response> {
  if (!getSupabaseRuntime(ctx.env)) return missingRuntime();

  const built = buildSimilarParams(requestUrl);
  if (!built) return jsonResponse({ data: [] });

  const cacheParams = new URLSearchParams(built.cacheParams);
  cacheParams.set("v", SIMILAR_LISTINGS_CACHE_VERSION);
  const cacheKey = normalizedCacheUrl(requestUrl, "similar-listings", cacheParams);

  return cachedJson(ctx, cacheKey, async () => {
    try {
      const publication = await getPublicCataloguePublication(
        ctx.env,
        built.publicationId,
      );
      const nowMs = Date.parse(publication.snapshotMinute);
      const rpcRows = await supabaseRpcJson<PublicCatalogueQueryRpcRow>(
        ctx.env,
        "query_public_catalogue",
        {
          p_publication_id: publication.publicationId,
          p_listing_type: built.listingType,
          p_property_type: built.propertyType,
          p_location: built.city,
          p_sort: "newest",
          p_limit: SIMILAR_LISTINGS_CANDIDATE_LIMIT,
        },
        { failOnTransient: true },
      );
      const rows = publicListingRows(rpcRows.map((row) => {
        if (Number(row.publication_id) !== publication.publicationId) {
          throw new Error("Similar catalogue RPC returned a different publication");
        }
        if (
          !row.card_payload ||
          typeof row.card_payload !== "object" ||
          Array.isArray(row.card_payload)
        ) {
          throw new Error("Similar catalogue RPC returned an invalid card payload");
        }
        return {
          ...(row.card_payload as ListingRow),
          publicationId: publication.publicationId,
        };
      }))
        .filter((row) => row.id !== built.excludeId)
        .map((row) => normalizePublicPromotionState(row, nowMs));
      const ownerIds = rows.map((row) => row.owner_id).filter((id): id is string => typeof id === "string");
      const profiles = await fetchPublicProfileSummaries(ctx.env, ownerIds);
      const withProfiles = rows.map((row) => ({
        ...row,
        profiles: publicProfileDisplay(row.owner_id ? profiles.get(row.owner_id) : null),
        ownerParticipantType: row.owner_id ? profiles.get(row.owner_id)?.owner_participant_type ?? null : null,
      }));

      return jsonResponse(
        {
          data: dedupeSimilarRows(sortBySimilarity(withProfiles, built.price, nowMs)).slice(0, built.limit),
          publicationId: publication.publicationId,
        },
        { headers: publicCatalogueValidityHeaders(publication) },
      );
    } catch (error) {
      if (isPublicCatalogueSnapshotExpiredError(error)) {
        return jsonResponse(
          { error: "Listing catalogue publication is no longer active" },
          {
            status: 409,
            headers: {
              "Cache-Control": "no-store",
              "CDN-Cache-Control": "no-store",
            },
          },
        );
      }
      if (isSupabaseTransientError(error)) return upstreamUnavailable();
      throw error;
    }
  });
}

export const onRequest: PagesFunction<PublicApiEnv> = async (ctx) => {
  if (ctx.request.method !== "GET") return methodNotAllowed();
  return publicSimilarListings(ctx, new URL(ctx.request.url));
};
