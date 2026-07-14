import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOMEPAGE_INITIAL_SCRIPT_ID = "maiprop-homepage-initial";
const HOMEPAGE_INITIAL_VERSION = 1;
const DEFAULT_ORIGIN = "https://portal.maiprop.co";
const DEFAULT_DIST_DIR = "dist";
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_FETCH_ATTEMPTS = 2;
const MAX_FEATURED_ROWS = 4;
const MAX_OPEN_HOUSE_ROWS = 4;
const INITIAL_CATALOGUE_ROWS = 12;
const MAX_IMAGES_PER_ROW = 2;
const MAX_PAYLOAD_BYTES = 64_000;

const CARD_FIELDS = [
  "id",
  "created_at",
  "title",
  "address",
  "city",
  "price",
  "price_per_sqm",
  "bedrooms",
  "bathrooms",
  "sqm",
  "floor",
  "total_floors",
  "year_built",
  "energy_class",
  "property_type",
  "listing_type",
  "open_house_transaction_type",
  "project_id",
  "auction_date",
  "auction_starting_bid",
  "open_house_date",
  "ai_score",
  "views_count",
  "tags",
  "has_video_tour",
  "has_virtual_tour",
  "is_featured",
  "priority_placement",
  "is_pre_sale",
  "construction_status",
  "walkability_score",
  "safety_score",
  "noise_score",
  "latitude",
  "longitude",
  "region",
  "cover_image_url",
  "has_parking",
  "has_pool",
  "has_elevator",
  "has_garden",
  "has_smart_home",
  "ownerParticipantType",
];

function safeJsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function isRecord(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function publicRowsFromResponse(value) {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.data)) return value.data;
  return [];
}

function cleanString(value, maxLength = 240) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function cleanScalar(value) {
  if (value == null) return undefined;
  if (typeof value === "string") return cleanString(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value;
  return undefined;
}

function cleanTags(value) {
  if (!Array.isArray(value)) return undefined;
  const tags = value
    .map((tag) => cleanString(tag, 40))
    .filter(Boolean)
    .slice(0, 6);
  return tags.length ? tags : undefined;
}

function cleanImages(value) {
  if (!Array.isArray(value)) return undefined;
  const images = value
    .map((image) => {
      if (!isRecord(image)) return null;
      const url = cleanString(image.url, 600);
      if (!url) return null;
      const sortOrder = typeof image.sort_order === "number" && Number.isFinite(image.sort_order)
        ? image.sort_order
        : 0;
      return { url, sort_order: sortOrder };
    })
    .filter(Boolean)
    .slice(0, MAX_IMAGES_PER_ROW);
  return images.length ? images : undefined;
}

function cleanProjectUnits(value) {
  if (!Array.isArray(value)) return undefined;
  const units = value
    .map((unit) => {
      if (!isRecord(unit)) return null;
      const cleaned = {};
      for (const key of ["id", "availability_status", "internal_sqm"]) {
        const scalar = cleanScalar(unit[key]);
        if (scalar !== undefined) cleaned[key] = scalar;
      }
      return Object.keys(cleaned).length ? cleaned : null;
    })
    .filter(Boolean)
    .slice(0, 8);
  return units.length ? units : undefined;
}

function cleanProjectSummary(value) {
  if (!isRecord(value)) return undefined;
  const project = {};
  const name = cleanScalar(value.name);
  const deliveryDate = cleanScalar(value.delivery_date);
  const projectUnits = cleanProjectUnits(value.project_units);
  if (name !== undefined) project.name = name;
  if (deliveryDate !== undefined) project.delivery_date = deliveryDate;
  if (projectUnits !== undefined) project.project_units = projectUnits;
  return Object.keys(project).length ? project : undefined;
}

function cleanPublicProfile(value) {
  if (!isRecord(value)) return undefined;
  const profile = {};
  for (const key of ["user_id", "display_name", "avatar_url"]) {
    const scalar = cleanScalar(value[key]);
    if (scalar !== undefined) profile[key] = scalar;
  }
  return Object.keys(profile).length ? profile : undefined;
}

export function sanitizeHomepageRow(row) {
  if (!isRecord(row)) return null;
  const id = cleanString(row.id, 120);
  const title = cleanString(row.title, 180);
  const city = cleanString(row.city, 120);
  if (!id || !title || !city) return null;

  const cleaned = { id, title, city };
  for (const key of CARD_FIELDS) {
    if (key === "id" || key === "title" || key === "city") continue;
    if (key === "tags") {
      const tags = cleanTags(row.tags);
      if (tags !== undefined) cleaned.tags = tags;
      continue;
    }
    const scalar = cleanScalar(row[key]);
    if (scalar !== undefined) cleaned[key] = scalar;
  }

  const images = cleanImages(row.listing_images);
  if (images !== undefined) cleaned.listing_images = images;

  const project = cleanProjectSummary(row.project ?? row.projects);
  if (project !== undefined) cleaned.project = project;

  const profile = cleanPublicProfile(row.profiles);
  if (profile !== undefined) cleaned.profiles = profile;

  return cleaned;
}

function fetchTimeoutMs(env = process.env) {
  const raw = Number(env.HOMEPAGE_INITIAL_FETCH_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 1_000 ? raw : DEFAULT_FETCH_TIMEOUT_MS;
}

function fetchAttempts(env = process.env) {
  const raw = Number(env.HOMEPAGE_INITIAL_FETCH_ATTEMPTS);
  return Number.isFinite(raw) && raw >= 1 ? Math.min(Math.floor(raw), 4) : DEFAULT_FETCH_ATTEMPTS;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function fetchJsonOnceWithTimeout(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (response.status === 429 || response.status >= 500) {
      throw new Error(`Transient HTTP ${response.status} from ${url}`);
    }
    if (!response.ok || !contentType.includes("application/json")) return null;
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithTimeout(url, fetchImpl = globalThis.fetch, {
  attempts = fetchAttempts(),
  timeoutMs = fetchTimeoutMs(),
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchJsonOnceWithTimeout(url, fetchImpl, timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(250 * attempt);
      }
    }
  }
  throw lastError;
}

async function fetchHomepageSection(origin, section, limit, fetchImpl, fetchOptions) {
  const url = new URL("/api/public/homepage", origin);
  url.searchParams.set("section", section);
  try {
    const json = await fetchJsonWithTimeout(url, fetchImpl, fetchOptions);
    return publicRowsFromResponse(json)
      .map(sanitizeHomepageRow)
      .filter(Boolean)
      .slice(0, limit);
  } catch (error) {
    console.warn(`[homepage-initial] Could not fetch ${section}: ${error.message}`);
    return [];
  }
}

async function fetchFeaturedListingsFallback(origin, limit, fetchImpl, fetchOptions) {
  const url = new URL("/api/public/listings", origin);
  url.searchParams.set("page", "1");
  url.searchParams.set("pageSize", String(limit));
  try {
    const json = await fetchJsonWithTimeout(url, fetchImpl, fetchOptions);
    return publicRowsFromResponse(json)
      .map(sanitizeHomepageRow)
      .filter(Boolean)
      .slice(0, limit);
  } catch (error) {
    console.warn(`[homepage-initial] Could not fetch featured fallback listings: ${error.message}`);
    return [];
  }
}

function sanitizeListingsPage(value) {
  if (!isRecord(value) || !Array.isArray(value.data)) return undefined;
  return {
    data: value.data
      .map(sanitizeHomepageRow)
      .filter(Boolean)
      .slice(0, INITIAL_CATALOGUE_ROWS),
    hasMore: value.hasMore === true || value.data.length > INITIAL_CATALOGUE_ROWS,
    page: 1,
    pageSize: INITIAL_CATALOGUE_ROWS,
    offset: 0,
  };
}

async function fetchInitialListingsPage(origin, listingType, fetchImpl, fetchOptions) {
  const catalogueFetchOptions = {
    attempts: 1,
    timeoutMs: Math.min(fetchOptions?.timeoutMs ?? fetchTimeoutMs(), 5_000),
  };
  const canonicalUrl = new URL("/api/public/listings", origin);
  canonicalUrl.searchParams.set("page", "1");
  canonicalUrl.searchParams.set("pageSize", String(INITIAL_CATALOGUE_ROWS));
  canonicalUrl.searchParams.set("offset", "0");
  canonicalUrl.searchParams.set("listing_type", listingType);
  canonicalUrl.searchParams.set("sort", "relevant");

  try {
    const json = await fetchJsonWithTimeout(canonicalUrl, fetchImpl, catalogueFetchOptions);
    return sanitizeListingsPage(json);
  } catch (canonicalError) {
    const compatibilityUrl = new URL("/api/public/listings", origin);
    compatibilityUrl.searchParams.set("page", "1");
    compatibilityUrl.searchParams.set("limit", "40");
    compatibilityUrl.searchParams.set("listing_type", listingType);
    compatibilityUrl.searchParams.set("sort", "relevant");

    try {
      const json = await fetchJsonWithTimeout(compatibilityUrl, fetchImpl, catalogueFetchOptions);
      return sanitizeListingsPage(json);
    } catch (compatibilityError) {
      console.warn(
        `[homepage-initial] Could not fetch ${listingType} catalogue bootstrap: ${canonicalError.message}; compatibility fallback: ${compatibilityError.message}`,
      );
      return undefined;
    }
  }
}

export async function buildHomepageInitialPayload({
  origin = DEFAULT_ORIGIN,
  now = new Date(),
  fetchImpl = globalThis.fetch,
  fetchOptions,
} = {}) {
  let [featured, openHouses, saleListings, rentListings] = await Promise.all([
    fetchHomepageSection(origin, "featured", MAX_FEATURED_ROWS, fetchImpl, fetchOptions),
    fetchHomepageSection(origin, "open-houses", MAX_OPEN_HOUSE_ROWS, fetchImpl, fetchOptions),
    fetchInitialListingsPage(origin, "sale", fetchImpl, fetchOptions),
    fetchInitialListingsPage(origin, "rent", fetchImpl, fetchOptions),
  ]);

  if (featured.length === 0) {
    featured = await fetchFeaturedListingsFallback(origin, MAX_FEATURED_ROWS, fetchImpl, fetchOptions);
  }

  return {
    version: HOMEPAGE_INITIAL_VERSION,
    generatedAt: now.toISOString(),
    featured,
    openHouses,
    saleListings,
    rentListings,
  };
}

export async function injectHomepageInitialPayload({ distDir = DEFAULT_DIST_DIR, payload }) {
  const indexPath = join(resolve(distDir), "index.html");
  if (!existsSync(indexPath)) {
    throw new Error(`Could not find ${indexPath}. Run npm run build first.`);
  }

  const html = readFileSync(indexPath, "utf8");
  const payloadJson = safeJsonForHtml(payload);
  const payloadBytes = Buffer.byteLength(payloadJson, "utf8");
  if (payloadBytes > MAX_PAYLOAD_BYTES) {
    throw new Error(`Homepage initial payload is ${payloadBytes} bytes; max is ${MAX_PAYLOAD_BYTES}.`);
  }

  const scriptRe = new RegExp(
    `<script\\s+id=["']${HOMEPAGE_INITIAL_SCRIPT_ID}["']\\s+type=["']application/json["'][^>]*>[\\s\\S]*?<\\/script>`,
    "i",
  );
  const scriptTag = `<script id="${HOMEPAGE_INITIAL_SCRIPT_ID}" type="application/json">${payloadJson}</script>`;
  const nextHtml = scriptRe.test(html)
    ? html.replace(scriptRe, scriptTag)
    : html.replace("</body>", `    ${scriptTag}\n  </body>`);

  writeFileSync(indexPath, nextHtml);
  return { indexPath, payloadBytes };
}

function envOrigin(env = process.env) {
  return env.HOMEPAGE_INITIAL_ORIGIN || env.VITE_APP_URL || DEFAULT_ORIGIN;
}

function isStrict(env = process.env, argv = process.argv) {
  return env.HOMEPAGE_INITIAL_STRICT === "1" || argv.includes("--strict");
}

async function main() {
  const payload = await buildHomepageInitialPayload({ origin: envOrigin() });
  const strict = isStrict();
  if (strict && payload.featured.length === 0) {
    throw new Error("Strict homepage initial payload generation found no featured listings.");
  }
  const result = await injectHomepageInitialPayload({ payload });
  console.log(
    `[homepage-initial] Injected ${payload.featured.length} featured, ${payload.openHouses.length} open-house, ${payload.saleListings?.data.length ?? 0} sale, and ${payload.rentListings?.data.length ?? 0} rent rows into ${result.indexPath} (${result.payloadBytes} bytes).`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`[homepage-initial] ${error.message}`);
    process.exit(1);
  });
}
