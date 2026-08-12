/**
 * create-new-building-listing - authenticated new-build creation boundary.
 *
 * The browser may upload storage objects, but it does not write the project,
 * unit, listing, project_media, or listing_images tables directly. This
 * function verifies the caller, enforces developer/admin access, forces
 * ownership from the verified user, and rolls back owned root rows on failure.
 */

import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.57.2";
import { AuthError, verifyBearerToken } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { requireProSubscription } from "../_shared/proGate.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import { parseJsonBody, z } from "../_shared/schema.ts";
import { logAuditEvent } from "../_shared/auditLog.ts";

const log = createLogger("create-new-building-listing");
const limiter = makeRateLimiter({
  bucket: "create-new-building-listing",
  maxRequests: 20,
  windowMs: 60_000,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const jsonResponse = (
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const uuidString = (field: string) =>
  z.unknown().transform((value, ctx): string => {
    if (typeof value !== "string" || !UUID_RE.test(value.trim())) {
      ctx.addIssue({ code: "custom", message: `Invalid ${field}` });
      return z.NEVER;
    }
    return value.trim();
  });

const requiredString = (field: string, maxLength: number) =>
  z.unknown().transform((value, ctx): string => {
    if (typeof value !== "string") {
      ctx.addIssue({ code: "custom", message: `Invalid ${field}` });
      return z.NEVER;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > maxLength) {
      ctx.addIssue({ code: "custom", message: `Invalid ${field}` });
      return z.NEVER;
    }
    return trimmed;
  });

const optionalString = (field: string, maxLength: number) =>
  z.unknown().optional().transform((value, ctx): string | null => {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string") {
      ctx.addIssue({ code: "custom", message: `Invalid ${field}` });
      return z.NEVER;
    }
    const trimmed = value.trim();
    if (trimmed.length > maxLength) {
      ctx.addIssue({ code: "custom", message: `Invalid ${field}` });
      return z.NEVER;
    }
    return trimmed.length === 0 ? null : trimmed;
  });

const nonNegativeNumber = (field: string, max: number) =>
  z.unknown().optional().transform((value, ctx): number | null => {
    if (value === null || value === undefined) return null;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) {
      ctx.addIssue({ code: "custom", message: `Invalid ${field}` });
      return z.NEVER;
    }
    return value;
  });

const positiveNumber = (field: string, max: number) =>
  z.unknown().transform((value, ctx): number => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > max) {
      ctx.addIssue({ code: "custom", message: `Invalid ${field}` });
      return z.NEVER;
    }
    return value;
  });

const optionalNumber = (field: string, min: number, max: number) =>
  z.unknown().optional().transform((value, ctx): number | null => {
    if (value === null || value === undefined) return null;
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
      ctx.addIssue({ code: "custom", message: `Invalid ${field}` });
      return z.NEVER;
    }
    return value;
  });

const optionalInteger = (field: string, min: number, max: number) =>
  z.unknown().optional().transform((value, ctx): number | null => {
    if (
      value === null
      || value === undefined
      || typeof value !== "number"
      || !Number.isInteger(value)
      || value < min
      || value > max
    ) {
      if (value === null || value === undefined) return null;
      ctx.addIssue({ code: "custom", message: `Invalid ${field}` });
      return z.NEVER;
    }
    return value;
  });

const optionalBoolean = (field: string) =>
  z.unknown().optional().transform((value, ctx): boolean | null => {
    if (value === null || value === undefined) return null;
    if (typeof value !== "boolean") {
      ctx.addIssue({ code: "custom", message: `Invalid ${field}` });
      return z.NEVER;
    }
    return value;
  });

const projectSchema = z.object({
  id: uuidString("project id"),
  name: requiredString("project name", 180),
  building_permit_number: optionalString("building permit", 120),
  city: requiredString("project city", 120),
  developer_company: optionalString("developer company", 200),
  architect_group: optionalString("architect group", 200),
  construction_company: optionalString("construction company", 200),
  description: optionalString("project description", 4000),
  address: optionalString("project address", 240),
  municipality: optionalString("project municipality", 160),
  area_description: optionalString("project area description", 4000),
  latitude: optionalNumber("project latitude", -90, 90),
  longitude: optionalNumber("project longitude", -180, 180),
  permit_approval_date: optionalString("permit approval date", 80),
  construction_start_date: optionalString("construction start date", 80),
  structural_completion_date: optionalString("structural completion date", 80),
  delivery_date: optionalString("delivery date", 80),
  construction_year: optionalInteger("construction year", 1800, 2200),
  renovation_year: optionalInteger("renovation year", 1800, 2200),
}).strict();

const unitSchema = z.object({
  unit_id: optionalString("unit id", 80),
  floor: optionalInteger("unit floor", -20, 300),
  unit_number: optionalString("unit number", 80),
  internal_sqm: positiveNumber("unit size", 100_000),
  balcony_sqm: nonNegativeNumber("unit balcony", 100_000),
  storage_sqm: nonNegativeNumber("unit storage", 100_000),
  parking_sqm: nonNegativeNumber("unit parking", 100_000),
  bedrooms: optionalInteger("unit bedrooms", 0, 50),
  bathrooms: optionalInteger("unit bathrooms", 0, 50),
  kitchen_type: optionalString("unit kitchen", 120),
  living_rooms: optionalInteger("unit living rooms", 0, 50),
  price: positiveNumber("unit price", 100_000_000),
  vat_included: optionalBoolean("unit VAT"),
  parking_price: nonNegativeNumber("unit parking price", 100_000_000),
  storage_price: nonNegativeNumber("unit storage price", 100_000_000),
  sea_view: optionalBoolean("unit sea view"),
  city_view: optionalBoolean("unit city view"),
  mountain_view: optionalBoolean("unit mountain view"),
  energy_class: optionalString("unit energy class", 20),
  heating_system: optionalString("unit heating", 120),
  cooling_system: optionalString("unit cooling", 120),
}).strict();

const projectMediaSchema = z.object({
  url: requiredString("project media URL", 2048),
  media_type: z.enum([
    "rendering",
    "floor_plan",
    "site_plan",
    "brochure_pdf",
    "drone",
    "walkthrough",
    "progress",
    "video",
  ]),
  title: optionalString("project media title", 180),
  sort_order: z.number().int().min(0).max(500).optional(),
}).strict();

const listingSchema = z.object({
  title: requiredString("listing title", 180),
  description: optionalString("listing description", 4000),
  cover_image_url: z.string().trim().url("Invalid listing cover image").max(2048, "Invalid listing cover image"),
}).strict();

const requestSchema = z.object({
  projectKind: z.enum(["new_build", "renovation"]).optional().default("new_build"),
  organizationId: uuidString("organization id").nullable().optional().default(null),
  project: projectSchema,
  unit: unitSchema.optional(),
  units: z.array(unitSchema).min(1).max(100).optional(),
  projectMedia: z.array(projectMediaSchema).max(20),
  listing: listingSchema,
  additionalImageUrls: z.array(requiredString("listing image", 2048)).max(250).optional().default([]),
}).strict();

type RequestPayload = z.infer<typeof requestSchema>;

type ProfileRow = {
  role: string | null;
  role_switch_in_progress_at: string | null;
};

type ProfileLookupClient = {
  from(table: string): unknown;
};

type ProfileLookupQuery = {
  select(columns: string): {
    eq(column: "user_id", value: string): {
      maybeSingle(): PromiseLike<{
        data: ProfileRow | null;
        error: { message: string } | null;
      }>;
    };
  };
};

type DbRow = Record<string, unknown>;
type Coordinates = { latitude: number; longitude: number };
type StorageReference = { bucket: "listing-images" | "project-media"; path: string; url: string };
type AtomicCreationResult = {
  listingId: string;
  projectId: string;
  idempotent: boolean;
};

class AtomicOutcomeUnknownError extends Error {
  constructor() {
    super("new_build_atomic_outcome_unknown");
    this.name = "AtomicOutcomeUnknownError";
  }
}

const finiteCoordinate = (value: unknown, min: number, max: number): number | null => {
  if (
    value === null
    || value === undefined
    || (typeof value === "string" && value.trim() === "")
  ) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
};

function getCompleteCoordinates(row: DbRow): Coordinates | null {
  const latitude = finiteCoordinate(row.latitude, -90, 90);
  const longitude = finiteCoordinate(row.longitude, -180, 180);
  return latitude != null && longitude != null ? { latitude, longitude } : null;
}

const cleanPart = (value: unknown) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

function buildGeocodeAddress(project: DbRow, listing: DbRow): string {
  const parts = [
    cleanPart(project.address) || cleanPart(listing.address),
    cleanPart(project.city) || cleanPart(listing.city),
    cleanPart(project.municipality),
    cleanPart(project.region) || cleanPart(listing.region),
    cleanPart(project.postal_code) || cleanPart(listing.postal_code),
    "Greece",
  ];
  return [...new Set(parts.filter(Boolean))].join(", ");
}

async function fetchGoogleCoordinates(address: string): Promise<Coordinates | null> {
  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY") || Deno.env.get("VITE_GOOGLE_MAPS_API_KEY");
  if (!apiKey) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_500);
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("region", "gr");
    url.searchParams.set("key", apiKey);
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null) as {
      status?: string;
      results?: Array<{ geometry?: { location?: { lat?: unknown; lng?: unknown } } }>;
    } | null;
    if (payload?.status !== "OK") return null;
    const location = payload.results?.[0]?.geometry?.location;
    const latitude = finiteCoordinate(location?.lat, -90, 90);
    const longitude = finiteCoordinate(location?.lng, -180, 180);
    return latitude != null && longitude != null ? { latitude, longitude } : null;
  } catch (_error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchNominatimCoordinates(address: string): Promise<Coordinates | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_500);
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "gr");
    url.searchParams.set("q", address);
    const response = await fetch(url, {
      headers: {
        "Accept-Language": "el,en",
        "User-Agent": "maiprop-edge-geocode/1.0",
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null) as Array<{ lat?: unknown; lon?: unknown }> | null;
    const first = Array.isArray(payload) ? payload[0] : null;
    const latitude = finiteCoordinate(first?.lat, -90, 90);
    const longitude = finiteCoordinate(first?.lon, -180, 180);
    return latitude != null && longitude != null ? { latitude, longitude } : null;
  } catch (_error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function geocodeProjectCoordinates(project: DbRow): Promise<Coordinates | null> {
  const existing = getCompleteCoordinates(project);
  if (existing) return existing;

  const address = buildGeocodeAddress(project, {});
  if (!address || address === "Greece") return null;

  return await fetchGoogleCoordinates(address) ?? await fetchNominatimCoordinates(address);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const message = (err as Record<string, unknown>).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "New building listing failed";
}

function isAmbiguousAtomicRpcFailure(err: unknown): boolean {
  if (err instanceof TypeError || err instanceof DOMException) return true;
  if (!err || typeof err !== "object") return true;

  const record = err as Record<string, unknown>;
  const status = typeof record.status === "number" ? record.status : null;
  const code = typeof record.code === "string" ? record.code.trim().toUpperCase() : "";
  const message = typeof record.message === "string" ? record.message : "";

  if (status === 0 || code.length === 0) return true;
  if (/^(08|53|57P0|58)/.test(code)) return true;
  return /(abort|connection|failed to fetch|network|socket|timed?\s*out)/i.test(message);
}

function parseAtomicCreationResult(
  data: unknown,
  expectedProjectId: string,
): AtomicCreationResult | null {
  if (!data || typeof data !== "object") return null;
  const result = data as Record<string, unknown>;
  const listingId = typeof result.listingId === "string" ? result.listingId : "";
  const projectId = typeof result.projectId === "string" ? result.projectId : "";
  if (!UUID_RE.test(listingId) || projectId !== expectedProjectId) return null;
  return {
    listingId,
    projectId,
    idempotent: result.idempotent === true,
  };
}

async function requireDeveloperAccess(supabase: ProfileLookupClient, userId: string) {
  const profileQuery = supabase.from("profiles") as ProfileLookupQuery;
  const { data, error } = await profileQuery
    .select("role, role_switch_in_progress_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;

  const role = data?.role;
  if ((role !== "developer" && role !== "admin") || (role !== "admin" && data?.role_switch_in_progress_at)) {
    throw new AuthError("developer_role_required", 403);
  }
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseProjectDate(value: string | null, field: string): number | null {
  if (!value) return null;
  if (!ISO_DATE_RE.test(value)) {
    throw new AuthError(`invalid_${field}`, 400);
  }
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed)) {
    throw new AuthError(`invalid_${field}`, 400);
  }
  return parsed;
}

function assertProjectDates(project: RequestPayload["project"]) {
  const dates = [
    ["permit_approval_date", parseProjectDate(project.permit_approval_date, "permit_approval_date")],
    ["construction_start_date", parseProjectDate(project.construction_start_date, "construction_start_date")],
    ["structural_completion_date", parseProjectDate(project.structural_completion_date, "structural_completion_date")],
    ["delivery_date", parseProjectDate(project.delivery_date, "delivery_date")],
  ] as const;
  let previous: number | null = null;
  for (const [, current] of dates) {
    if (current != null && previous != null && previous > current) {
      throw new AuthError("project_dates_out_of_order", 400);
    }
    if (current != null) previous = current;
  }
}

function assertCoordinatePair(project: RequestPayload["project"]) {
  const hasLatitude = project.latitude != null;
  const hasLongitude = project.longitude != null;
  if (hasLatitude !== hasLongitude) {
    throw new AuthError("project_coordinates_incomplete", 400);
  }
}

function assertProjectScope(payload: RequestPayload) {
  if (payload.projectKind === "new_build" && !payload.project.building_permit_number) {
    throw new AuthError("building_permit_required", 400);
  }
  const units = payload.units ?? (payload.unit ? [payload.unit] : []);
  if (units.length === 0) {
    throw new AuthError("new_build_unit_count_invalid", 400);
  }
  assertCoordinatePair(payload.project);
  assertProjectDates(payload.project);
}

function normalizeStoragePath(path: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch (_error) {
    throw new AuthError("storage_reference_invalid", 400);
  }
  const normalized = decoded.replaceAll("\\", "/").replace(/^\/+/, "");
  if (
    normalized.length === 0
    || normalized.length > 1024
    || normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new AuthError("storage_reference_invalid", 400);
  }
  return normalized;
}

function parseOwnedStorageReference(
  rawUrl: string,
  expectedBucket: StorageReference["bucket"],
  userId: string,
  projectId: string,
  supabaseUrl: string,
): StorageReference {
  let url: URL;
  let expectedOrigin: string;
  try {
    url = new URL(rawUrl);
    expectedOrigin = new URL(supabaseUrl).origin;
  } catch (_error) {
    throw new AuthError("storage_reference_invalid", 400);
  }
  const marker = "/storage/v1/object/public/";
  if (url.origin !== expectedOrigin || !url.pathname.startsWith(marker)) {
    throw new AuthError("storage_reference_not_owned", 400);
  }
  const objectPath = url.pathname.slice(marker.length);
  const separator = objectPath.indexOf("/");
  if (separator < 1) throw new AuthError("storage_reference_invalid", 400);
  const bucket = objectPath.slice(0, separator);
  const path = normalizeStoragePath(objectPath.slice(separator + 1));
  if (bucket !== expectedBucket) {
    throw new AuthError("storage_reference_bucket_mismatch", 400);
  }
  const requiredPrefix = `${userId}/${projectId}/create/`;
  if (!path.startsWith(requiredPrefix)) {
    throw new AuthError("storage_reference_not_owned", 400);
  }
  const canonicalOrigin = new URL(supabaseUrl).origin;
  return {
    bucket: expectedBucket,
    path,
    url: `${canonicalOrigin}/storage/v1/object/public/${expectedBucket}/${path}`,
  };
}

async function assertStorageReferenceExists(
  reference: StorageReference,
  supabase: SupabaseClient,
): Promise<void> {
  const { bucket, path } = reference;
  const separatorIndex = path.lastIndexOf("/");
  const folder = separatorIndex >= 0 ? path.slice(0, separatorIndex) : "";
  const fileName = separatorIndex >= 0 ? path.slice(separatorIndex + 1) : path;
  const { data: objects, error } = await supabase.storage
    .from(bucket)
    .list(folder, { search: fileName, limit: 100 });
  if (error) {
    log.warn("new building storage verification failed", {
      bucket,
      path,
      err: errorMessage(error),
    });
    throw new AuthError("storage_reference_unavailable", 503);
  }
  if (!objects?.some((object) => object.name === fileName)) {
    throw new AuthError("storage_reference_missing", 400);
  }
}

async function enqueueStorageCleanupJobs(
  supabase: SupabaseClient,
  ownerId: string,
  projectId: string,
  references: readonly StorageReference[],
  reason: string,
  lastError?: string,
) {
  if (references.length === 0) return;
  const uniqueReferences = [...new Map(
    references.map((reference) => [
      `${reference.bucket}:${reference.path}`,
      reference,
    ]),
  ).values()];
  const { error } = await supabase.rpc(
    "stage_storage_cleanup_jobs_for_service",
    {
      p_owner_id: ownerId,
      p_project_id: projectId,
      p_reason: reason,
      p_objects: uniqueReferences.map((reference) => ({
        bucket: reference.bucket,
        object_path: reference.path,
        object_url: reference.url,
      })),
      p_mode: "enqueue",
      p_last_error: lastError?.slice(0, 1000) ?? null,
    },
  );
  if (error) {
    log.error("new building storage cleanup enqueue failed", {
      projectId,
      reason,
      count: references.length,
      err: errorMessage(error),
    });
  }
}

async function cleanupStorageReferences(
  supabase: SupabaseClient,
  ownerId: string,
  projectId: string,
  references: readonly StorageReference[],
  reason: string,
) {
  /*
   * Cleanup stays asynchronous. The worker first acquires a lease and then
   * rechecks the exact committed URL, so a slow failure path can never delete
   * an object that another request committed in the meantime.
   */
  await enqueueStorageCleanupJobs(
    supabase,
    ownerId,
    projectId,
    references,
    reason,
  );
}

async function loadCommittedStorageUrls(
  supabase: SupabaseClient,
  projectId: string,
): Promise<Set<string> | null> {
  const { data: projectMedia, error: projectMediaError } = await supabase
    .from("project_media")
    .select("url")
    .eq("project_id", projectId);
  if (projectMediaError) {
    log.warn("new building committed project-media lookup failed; preserving submitted objects", {
      err: errorMessage(projectMediaError),
      projectId,
    });
    return null;
  }

  const committedUrls = new Set(
    (projectMedia ?? []).flatMap((row) => typeof row.url === "string" ? [row.url] : []),
  );

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("id,cover_image_url")
    .eq("project_id", projectId)
    .maybeSingle();
  if (listingError) {
    log.warn("new building committed listing lookup failed; preserving submitted objects", {
      err: errorMessage(listingError),
      projectId,
    });
    return null;
  }
  if (!listing) return committedUrls;
  if (typeof listing.cover_image_url === "string") {
    committedUrls.add(listing.cover_image_url);
  }

  const { data: listingImages, error: listingImagesError } = await supabase
    .from("listing_images")
    .select("url")
    .eq("listing_id", listing.id);
  if (listingImagesError) {
    log.warn("new building committed listing-image lookup failed; preserving submitted objects", {
      err: errorMessage(listingImagesError),
      projectId,
      listingId: listing.id,
    });
    return null;
  }
  for (const row of listingImages ?? []) {
    if (typeof row.url === "string") committedUrls.add(row.url);
  }
  return committedUrls;
}

async function cleanupUncommittedStorageReferences(
  supabase: SupabaseClient,
  ownerId: string,
  projectId: string,
  references: readonly StorageReference[],
  reason: string,
) {
  if (references.length === 0) return;
  const committedUrls = await loadCommittedStorageUrls(supabase, projectId);
  if (!committedUrls) {
    await enqueueStorageCleanupJobs(
      supabase,
      ownerId,
      projectId,
      references,
      `${reason}:committed_state_unavailable`,
    );
    return;
  }
  await cleanupStorageReferences(
    supabase,
    ownerId,
    projectId,
    references.filter((reference) => !committedUrls.has(reference.url)),
    reason,
  );
}

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceRoleKey || !supabaseUrl) {
    return jsonResponse({ error: "Service unavailable" }, 503, corsHeaders);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let projectId: string | null = null;
  let listingId: string | null = null;
  let ownerId: string | null = null;
  let projectMediaReferences: StorageReference[] = [];
  const storageReferences: StorageReference[] = [];
  let cleanupUploadedStorage = true;

  try {
    const payload = await parseJsonBody(req, requestSchema);
    assertProjectScope(payload);

    const user = await verifyBearerToken(req, supabase);
    ownerId = user.id;
    await requireDeveloperAccess(supabase, user.id);
    const proCheck = await requireProSubscription(user.id, corsHeaders, {
      audience: "developer",
    });
    if (proCheck.errorResponse) return proCheck.errorResponse;
    projectId = payload.project.id;

    const resolvedCoordinates = await geocodeProjectCoordinates(payload.project);
    const projectRow = {
      id: projectId,
      name: payload.project.name,
      building_permit_number: payload.project.building_permit_number,
      city: payload.project.city,
      developer_company: payload.project.developer_company,
      architect_group: payload.project.architect_group,
      construction_company: payload.project.construction_company,
      description: payload.project.description,
      address: payload.project.address,
      municipality: payload.project.municipality,
      area_description: payload.project.area_description,
      latitude: resolvedCoordinates?.latitude ?? null,
      longitude: resolvedCoordinates?.longitude ?? null,
      permit_approval_date: payload.project.permit_approval_date,
      construction_start_date: payload.project.construction_start_date,
      structural_completion_date: payload.project.structural_completion_date,
      delivery_date: payload.project.delivery_date,
      construction_year: payload.project.construction_year,
      renovation_year: payload.project.renovation_year,
    };
    const rawUnits = payload.units ?? (payload.unit ? [payload.unit] : []);
    const unitRows = rawUnits.map((unit) => ({
      unit_id: unit.unit_id,
      floor: unit.floor,
      unit_number: unit.unit_number,
      internal_sqm: unit.internal_sqm,
      balcony_sqm: unit.balcony_sqm,
      storage_sqm: unit.storage_sqm,
      parking_sqm: unit.parking_sqm,
      bedrooms: unit.bedrooms,
      bathrooms: unit.bathrooms,
      kitchen_type: unit.kitchen_type,
      living_rooms: unit.living_rooms,
      price: unit.price,
      vat_included: unit.vat_included,
      parking_price: unit.parking_price,
      storage_price: unit.storage_price,
      sea_view: unit.sea_view,
      city_view: unit.city_view,
      mountain_view: unit.mountain_view,
      energy_class: unit.energy_class,
      heating_system: unit.heating_system,
      cooling_system: unit.cooling_system,
    }));
    const parseFailures: unknown[] = [];
    const parseAndTrack = (
      rawUrl: string,
      bucket: StorageReference["bucket"],
    ): StorageReference | null => {
      try {
        const reference = parseOwnedStorageReference(
          rawUrl,
          bucket,
          user.id,
          projectId!,
          supabaseUrl,
        );
        storageReferences.push(reference);
        return reference;
      } catch (error) {
        parseFailures.push(error);
        return null;
      }
    };

    const projectMediaCandidates = payload.projectMedia.map((media) =>
      parseAndTrack(media.url, "project-media")
    );
    const coverCandidate = parseAndTrack(
      payload.listing.cover_image_url,
      "listing-images",
    );
    const additionalImageCandidates = payload.additionalImageUrls.map((url) =>
      parseAndTrack(url, "listing-images")
    );
    if (parseFailures.length > 0) throw parseFailures[0];

    projectMediaReferences = projectMediaCandidates.filter(
      (reference): reference is StorageReference => reference !== null,
    );
    const coverReference = coverCandidate!;
    const additionalImageReferences = additionalImageCandidates.filter(
      (reference): reference is StorageReference => reference !== null,
    );
    for (const reference of storageReferences) {
      await assertStorageReferenceExists(reference, supabase);
    }

    /*
     * All structurally valid references are tracked before existence checks.
     * If one later object is missing, compensating cleanup still covers every
     * exact object from this creation attempt.
     */
    for (const reference of projectMediaReferences) {
      if (reference.bucket !== "project-media") {
        throw new AuthError("storage_reference_bucket_mismatch", 400);
      }
    }
    const projectMediaRows = payload.projectMedia.map((media, index) => ({
      url: projectMediaReferences[index].url,
      media_type: media.media_type,
      title: media.title,
      sort_order: media.sort_order,
    }));
    const listingRow = {
      title: payload.listing.title,
      description: payload.listing.description,
      cover_image_url: coverReference.url,
    };
    const rpcArgs = {
      p_actor_user_id: user.id,
      p_organization_id: payload.organizationId,
      p_project_kind: payload.projectKind,
      p_project: projectRow,
      p_units: unitRows,
      p_project_media: projectMediaRows,
      p_listing: listingRow,
      p_additional_image_urls: additionalImageReferences.map((reference) => reference.url),
      p_storage_objects: storageReferences.map((reference) => ({
        bucket: reference.bucket,
        object_path: reference.path,
      })),
    };
    const invokeAtomicCreation = () =>
      supabase.rpc("create_new_building_listing_with_storage_for_service", rpcArgs);

    let atomicResult: AtomicCreationResult | null = null;
    let ambiguousFailure: unknown = null;
    try {
      const { data, error } = await invokeAtomicCreation();
      if (error) {
        if (!isAmbiguousAtomicRpcFailure(error)) throw error;
        ambiguousFailure = error;
      } else {
        atomicResult = parseAtomicCreationResult(data, projectId);
        if (!atomicResult) ambiguousFailure = new Error("new_build_atomic_result_invalid");
      }
    } catch (rpcError) {
      if (!isAmbiguousAtomicRpcFailure(rpcError)) throw rpcError;
      ambiguousFailure = rpcError;
    }

    if (ambiguousFailure) {
      log.warn("new building atomic outcome ambiguous; reconciling by project id", {
        err: errorMessage(ambiguousFailure),
        projectId,
      });
      try {
        const { data, error } = await invokeAtomicCreation();
        if (error) throw error;
        atomicResult = parseAtomicCreationResult(data, projectId);
        if (!atomicResult) throw new Error("new_build_atomic_result_invalid");
      } catch (reconciliationError) {
        cleanupUploadedStorage = false;
        log.warn("new building atomic reconciliation unavailable", {
          err: errorMessage(reconciliationError),
          projectId,
        });
        throw new AtomicOutcomeUnknownError();
      }
    }

    if (!atomicResult) {
      cleanupUploadedStorage = false;
      throw new AtomicOutcomeUnknownError();
    }

    const idempotent = atomicResult.idempotent;
    cleanupUploadedStorage = false;
    listingId = atomicResult.listingId;
    projectId = atomicResult.projectId;
    if (idempotent) {
      await cleanupUncommittedStorageReferences(
        supabase,
        user.id,
        projectId,
        storageReferences,
        "idempotent_reconciliation",
      );
    }

    try {
      await logAuditEvent({
        actor_id: user.id,
        target_id: listingId,
        entity: payload.projectKind === "renovation" ? "renovation_project.listing" : "new_build.listing",
        action: "CREATED",
        new_data: { project_id: projectId },
        reason: "create_new_building_listing",
      });
    } catch (auditError) {
      log.warn("new building audit event failed", {
        err: errorMessage(auditError),
        projectId,
        listingId,
      });
    }

    return jsonResponse({ data: { listingId, projectId, idempotent }, error: null }, 200, corsHeaders);
  } catch (err: unknown) {
    if (cleanupUploadedStorage && ownerId && projectId && storageReferences.length > 0) {
      await cleanupUncommittedStorageReferences(
        supabase,
        ownerId,
        projectId,
        storageReferences,
        "creation_failed",
      );
    }
    if (err instanceof AtomicOutcomeUnknownError) {
      return jsonResponse({
        error: err.message,
        retryable: true,
      }, 503, corsHeaders);
    }
    if (err instanceof AuthError) {
      return jsonResponse({ error: err.message }, err.status, corsHeaders);
    }

    const message = errorMessage(err);
    log.warn("new building listing failed", { err: message, projectId, listingId });
    return jsonResponse({ error: message }, 400, corsHeaders);
  }
});
