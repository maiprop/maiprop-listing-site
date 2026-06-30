import { findPublicApiFixtureMarker } from "./public-api-fixture-guard.mjs";

const FETCH_TIMEOUT_MS = 30_000;
const USER_AGENT = "maiprop-production-deploy-check/1.0";
const SUPABASE_TRANSIENT_RETRIES = 2;
const SUPABASE_TRANSIENT_RETRY_DELAY_MS = 250;

const publicApiPaths = [
  "/api/public/listings?limit=1",
  "/api/public/listings?listing_type=new_build&limit=1",
  "/api/public/homepage?section=featured",
  "/api/public/open-houses?limit=1",
  "/api/public/auctions?limit=60",
  "/api/public/homepage?section=open-houses",
  "/api/public/homepage?section=type-counts",
  "/api/public/homepage?section=price-index",
  "/api/public/homepage?section=popular-locations",
  "/api/public/homepage?section=auction-count",
];

const listingDetailSourcePaths = new Set([
  "/api/public/listings?limit=1",
  "/api/public/listings?listing_type=new_build&limit=1",
  "/api/public/auctions?limit=60",
]);
const MAX_DETAIL_CHECK_IDS = 3;

const defaultAssertOk = (condition, message) => {
  if (!condition) throw new Error(message);
};

function isAllowedSupabaseUpstreamOutage(res, body) {
  return process.env.PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN === "true" &&
    res.status === 503 &&
    body &&
    typeof body === "object" &&
    body.error === "Supabase upstream unavailable";
}

function isSupabaseUpstreamUnavailable(res, body) {
  return res.status === 503 &&
    body &&
    typeof body === "object" &&
    body.error === "Supabase upstream unavailable";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const defaultFetchText = async (url, options = {}) => {
  const { allowHttpError: _allowHttpError, headers, ...requestOptions } = options;
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "user-agent": USER_AGENT,
      ...(headers ?? {}),
    },
    ...requestOptions,
  });
  const text = await res.text();
  return { res, text };
};

function extractPublicListingIds(body) {
  const rows = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray(body.data)
      ? body.data
      : [];

  return rows
    .map((row) => row && typeof row === "object" ? row.id : null)
    .filter((id) => typeof id === "string" && id.trim().length > 0);
}

async function validateJsonApiPath(baseUrl, path, { assertOk, fetchText }) {
  const apiUrl = new URL(path, baseUrl).toString();
  for (let attempt = 0; ; attempt += 1) {
    const { res, text } = await fetchText(apiUrl, {
      headers: { accept: "application/json" },
      allowHttpError: true,
    });
    const contentType = res.headers.get("content-type") ?? "";
    const htmlFallback =
      /text\/html/i.test(contentType) &&
      /<html|<div id=["']root["']|cloudflare access|private preview/i.test(text);
    if (!/application\/json/i.test(contentType)) {
      const message = htmlFallback
        ? `${apiUrl} returned HTML instead of JSON; the Cloudflare Pages Function was not invoked or failed open to the SPA fallback`
        : `${apiUrl} returned ${contentType || "<missing>"} instead of JSON`;
      if (htmlFallback && process.env.PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN === "true") {
        process.stderr.write(`[warn] ${message}; continuing because app-side public data fallbacks are enabled\n`);
        return null;
      }
      assertOk(false, message);
    }

    let body;
    try {
      body = JSON.parse(text);
    } catch (error) {
      throw new Error(`${apiUrl} returned invalid JSON: ${error.message}`);
    }

    if (!res.ok) {
      if (isSupabaseUpstreamUnavailable(res, body) && attempt < SUPABASE_TRANSIENT_RETRIES) {
        await sleep(SUPABASE_TRANSIENT_RETRY_DELAY_MS);
        continue;
      }
      if (isAllowedSupabaseUpstreamOutage(res, body)) {
        process.stderr.write(
          `[warn] ${apiUrl} returned Supabase upstream unavailable; continuing because app-side public data fallbacks are enabled\n`,
        );
        return null;
      }
      assertOk(false, `${apiUrl} returned HTTP ${res.status}: ${text.slice(0, 160)}`);
    }

    assertOk(
      !(body && typeof body === "object" && "error" in body),
      `${apiUrl} returned API error: ${JSON.stringify(body).slice(0, 240)}`,
    );

    const fixtureMarker = findPublicApiFixtureMarker(body);
    assertOk(
      fixtureMarker === null,
      `${apiUrl} returned production-blocked fixture content (${fixtureMarker?.marker}) at ${fixtureMarker?.path}: ${fixtureMarker?.value}`,
    );

    return body;
  }
}

export async function validatePublicApiEndpoints(
  baseUrl,
  {
    assertOk = defaultAssertOk,
    fetchText = defaultFetchText,
  } = {},
) {
  const listingIds = new Set();

  for (const path of publicApiPaths) {
    const body = await validateJsonApiPath(baseUrl, path, { assertOk, fetchText });
    if (body === null) continue;
    if (listingDetailSourcePaths.has(path)) {
      for (const id of extractPublicListingIds(body)) {
        if (listingIds.size >= MAX_DETAIL_CHECK_IDS) break;
        listingIds.add(id);
      }
    }
  }

  for (const id of listingIds) {
    const detailPath = `/api/public/listing?id=${encodeURIComponent(id)}`;
    const body = await validateJsonApiPath(baseUrl, detailPath, { assertOk, fetchText });
    const detailId = body && typeof body === "object" && body.data && typeof body.data === "object"
      ? body.data.id
      : body?.id;
    assertOk(
      !detailId || detailId === id,
      `${new URL(detailPath, baseUrl).toString()} returned listing id ${detailId} instead of ${id}`,
    );
  }
}
