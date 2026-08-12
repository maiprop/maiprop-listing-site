import {
  cachedJson,
  getPublicCataloguePublication,
  isSupabaseTransientError,
  isPublicCatalogueSnapshotExpiredError,
  jsonResponse,
  methodNotAllowed,
  missingRuntime,
  normalizedCacheUrl,
  publicCatalogueValidityHeaders,
  safeText,
  supabaseRpcJson,
  upstreamUnavailable,
  type PublicApiCtx,
  type PublicApiEnv,
} from "./_cache";
import { getSupabaseRuntime } from "../../_seo";
import { publicListingRows } from "./_fixture-content";
import { fetchPublicProfileSummaries, publicProfileDisplay } from "./_publicProfiles";
import { normalizePublicPromotionState } from "./_promotionState";

type ListingRow = {
  id: string;
  owner_id?: string | null;
  is_featured?: boolean | null;
  featured_until?: string | null;
  priority_placement?: number | null;
  priority_until?: string | null;
  [key: string]: unknown;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTERNAL_TAG_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const LISTING_DETAIL_CACHE_VERSION = "publication-detail-v3";

type ListingDetailRpcRow = {
  publication_id?: unknown;
  detail_payload?: unknown;
};

type ListingIdentity = {
  id: string | null;
  osTag: string | null;
  publicationId: number | null;
};

function invalidListingRequest(): Response {
  return jsonResponse(
    { error: "Invalid listing id" },
    {
      status: 400,
      headers: {
        "Cache-Control": "no-store",
        "CDN-Cache-Control": "no-store",
      },
    },
  );
}

function invalidCatalogueIdentity(): Response {
  return jsonResponse(
    { error: "Catalogue detail identity mismatch" },
    {
      status: 502,
      headers: {
        "Cache-Control": "no-store",
        "CDN-Cache-Control": "no-store",
      },
    },
  );
}

function detailMatchesIdentity(
  detailPayload: Record<string, unknown>,
  identity: ListingIdentity,
): boolean {
  if (identity.id) {
    return typeof detailPayload.id === "string" &&
      detailPayload.id.toLowerCase() === identity.id.toLowerCase();
  }
  if (!identity.osTag || detailPayload.listing_type !== "auction") return false;
  return Array.isArray(detailPayload.tags) &&
    detailPayload.tags.some((tag) => tag === `os_auction:${identity.osTag}`);
}

async function fetchOwnerProfile(env: PublicApiEnv, ownerId: string | null | undefined) {
  if (!ownerId) return null;

  try {
    return (await fetchPublicProfileSummaries(env, [ownerId])).get(ownerId) ?? null;
  } catch (error) {
    console.warn("[public-api] Public owner profile lookup failed; returning listing without profile", error);
    return null;
  }
}

function buildListingIdentity(requestUrl: URL): ListingIdentity | null {
  const id = requestUrl.searchParams.get("id")?.trim() ?? "";
  const osTag = safeText(requestUrl.searchParams.get("osTag"), 120);
  const publicationValue = requestUrl.searchParams.get("publicationId");
  const publicationId = publicationValue == null
    ? null
    : Number(publicationValue);
  if (
    publicationValue != null &&
    (
      publicationId == null ||
      !Number.isSafeInteger(publicationId) ||
      publicationId < 1
    )
  ) {
    return null;
  }

  if (UUID_RE.test(id)) {
    return { id, osTag: null, publicationId };
  }

  if (osTag && EXTERNAL_TAG_RE.test(osTag)) {
    return { id: null, osTag, publicationId };
  }

  return null;
}

async function publicListing(ctx: PublicApiCtx, requestUrl: URL): Promise<Response> {
  if (!getSupabaseRuntime(ctx.env)) return missingRuntime();

  const identity = buildListingIdentity(requestUrl);
  if (!identity) return invalidListingRequest();

  const cacheParams = new URLSearchParams();
  if (identity.id) cacheParams.set("id", identity.id);
  if (identity.osTag) cacheParams.set("osTag", identity.osTag);
  cacheParams.set(
    "publicationId",
    identity.publicationId == null ? "current" : String(identity.publicationId),
  );
  cacheParams.set("v", LISTING_DETAIL_CACHE_VERSION);
  const cacheKey = normalizedCacheUrl(requestUrl, "listing", cacheParams);

  return cachedJson(ctx, cacheKey, async () => {
    try {
      const publication = await getPublicCataloguePublication(
        ctx.env,
        identity.publicationId,
      );
      const rows = await supabaseRpcJson<ListingDetailRpcRow>(
        ctx.env,
        "get_public_catalogue_listing",
        {
          p_publication_id: publication.publicationId,
          p_listing_id: identity.id,
          p_os_tag: identity.osTag,
        },
        { failOnTransient: true },
      );
      if (rows.length > 1) return invalidCatalogueIdentity();
      if (rows[0] && Number(rows[0].publication_id) !== publication.publicationId) {
        return invalidCatalogueIdentity();
      }
      const detailPayload = rows[0]?.detail_payload;
      if (
        detailPayload &&
        typeof detailPayload === "object" &&
        !Array.isArray(detailPayload) &&
        !detailMatchesIdentity(detailPayload as Record<string, unknown>, identity)
      ) {
        return invalidCatalogueIdentity();
      }
      const cleanRows = publicListingRows(
        detailPayload &&
        typeof detailPayload === "object" &&
        !Array.isArray(detailPayload)
          ? [detailPayload as ListingRow]
          : [],
      );
      const row = cleanRows[0]
        ? {
          ...normalizePublicPromotionState(
            cleanRows[0],
            Date.parse(publication.snapshotMinute),
          ),
          publicationId: publication.publicationId,
        }
        : null;
      const profile = await fetchOwnerProfile(ctx.env, row?.owner_id);

      return jsonResponse(
        {
          data: row
            ? {
                ...row,
                profiles: publicProfileDisplay(profile),
                ownerParticipantType: profile?.owner_participant_type ?? null,
              }
            : null,
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
  }, identity.publicationId == null
    ? {
      edgeTtlSeconds: 30,
      browserTtlSeconds: 30,
      staleSeconds: 0,
      staleFallbackSeconds: 0,
    }
    : {
      edgeTtlSeconds: 300,
      browserTtlSeconds: 60,
      staleSeconds: 900,
      staleFallbackSeconds: 900,
    });
}

export const onRequest: PagesFunction<PublicApiEnv> = async (ctx) => {
  if (ctx.request.method !== "GET") return methodNotAllowed();
  return publicListing(ctx, new URL(ctx.request.url));
};
