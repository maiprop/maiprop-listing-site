/**
 * create-new-building-listing - authenticated new-build creation boundary.
 *
 * The browser may upload storage objects, but it does not write the project,
 * unit, listing, project_media, or listing_images tables directly. This
 * function verifies the caller, enforces developer/admin access, forces
 * ownership from the verified user, and rolls back owned root rows on failure.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
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

const projectSchema = z.object({
  id: uuidString("project id"),
  name: requiredString("project name", 180),
  building_permit_number: optionalString("building permit", 120),
  city: requiredString("project city", 120),
  owner_id: uuidString("owner id").optional(),
}).passthrough();

const unitSchema = z.object({
  project_id: uuidString("unit project id"),
  availability_status: optionalString("unit status", 80),
  internal_sqm: nonNegativeNumber("unit size", 100_000),
  price: nonNegativeNumber("unit price", 100_000_000),
}).passthrough();

const projectMediaSchema = z.object({
  project_id: uuidString("project media project id"),
  url: requiredString("project media URL", 2048),
  media_type: requiredString("project media type", 80),
  title: optionalString("project media title", 180),
  sort_order: z.number().int().min(0).max(500).optional(),
}).strict();

const listingSchema = z.object({
  title: requiredString("listing title", 180),
  city: requiredString("listing city", 120),
  price: nonNegativeNumber("listing price", 100_000_000).transform((value, ctx): number => {
    if (typeof value !== "number") {
      ctx.addIssue({ code: "custom", message: "Invalid listing price" });
      return z.NEVER;
    }
    return value;
  }),
  sqm: nonNegativeNumber("listing size", 100_000).transform((value, ctx): number => {
    if (typeof value !== "number") {
      ctx.addIssue({ code: "custom", message: "Invalid listing size" });
      return z.NEVER;
    }
    return value;
  }),
  property_type: requiredString("property type", 80),
  listing_type: z.literal("new_build"),
  owner_id: uuidString("owner id").optional(),
  project_id: uuidString("listing project id"),
}).passthrough();

const requestSchema = z.object({
  projectKind: z.enum(["new_build", "renovation"]).optional().default("new_build"),
  project: projectSchema,
  unit: unitSchema,
  units: z.array(unitSchema).min(1).max(100).optional(),
  projectMedia: z.array(projectMediaSchema).max(20),
  listing: listingSchema,
  additionalImageUrls: z.array(requiredString("listing image", 2048)).max(250),
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

type DeleteResult = { error: { message: string } | null };
type DeleteFilterChain = PromiseLike<DeleteResult> & {
  eq(column: string, value: string): DeleteFilterChain;
};
type OwnedRollbackClient = {
  from(table: string): {
    delete(): DeleteFilterChain;
  };
};

type DbRow = Record<string, unknown>;
type Coordinates = { latitude: number; longitude: number };

const positiveFiniteNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const finiteCoordinate = (value: unknown, min: number, max: number): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
};

function getCompleteCoordinates(...rows: DbRow[]): Coordinates | null {
  for (const row of rows) {
    const latitude = finiteCoordinate(row.latitude, -90, 90);
    const longitude = finiteCoordinate(row.longitude, -180, 180);
    if (latitude != null && longitude != null) return { latitude, longitude };
  }
  return null;
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

async function geocodeProjectCoordinates(project: DbRow, listing: DbRow): Promise<Coordinates | null> {
  const existing = getCompleteCoordinates(project, listing);
  if (existing) return existing;

  const address = buildGeocodeAddress(project, listing);
  if (!address || address === "Greece") return null;

  return await fetchGoogleCoordinates(address) ?? await fetchNominatimCoordinates(address);
}

function calculatePricePerSqm(
  price: unknown,
  sqm: unknown,
  storedPricePerSqm?: unknown,
): number | null {
  const numericPrice = positiveFiniteNumber(price);
  const numericSqm = positiveFiniteNumber(sqm);
  if (numericPrice != null && numericSqm != null) return Math.round(numericPrice / numericSqm);

  const stored = positiveFiniteNumber(storedPricePerSqm);
  return stored != null ? Math.round(stored) : null;
}

function withComputedPricePerSqm<T extends DbRow>(row: T): T {
  const pricePerSqm = calculatePricePerSqm(row.price, row.internal_sqm ?? row.sqm, row.price_per_sqm);
  return pricePerSqm == null ? row : { ...row, price_per_sqm: pricePerSqm };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const message = (err as Record<string, unknown>).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "New building listing failed";
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

function assertProjectScope(payload: RequestPayload) {
  const projectId = payload.project.id;
  if (payload.projectKind === "new_build" && !payload.project.building_permit_number) {
    throw new AuthError("building_permit_required", 400);
  }
  if (payload.unit.project_id !== projectId || payload.listing.project_id !== projectId) {
    throw new AuthError("project_scope_mismatch", 400);
  }
  if (payload.units?.some((unit) => unit.project_id !== projectId)) {
    throw new AuthError("project_scope_mismatch", 400);
  }
  if (payload.projectMedia.some((media) => media.project_id !== projectId)) {
    throw new AuthError("project_scope_mismatch", 400);
  }
}

async function rollbackOwnedRoots(
  supabase: OwnedRollbackClient,
  userId: string,
  projectId: string,
  listingId: string | null,
) {
  if (listingId) {
    await supabase.from("listings").delete().eq("id", listingId).eq("owner_id", userId);
  }
  await supabase.from("projects").delete().eq("id", projectId).eq("owner_id", userId);
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
  let userId: string | null = null;
  let projectCreated = false;

  try {
    const payload = await parseJsonBody(req, requestSchema);
    assertProjectScope(payload);

    const user = await verifyBearerToken(req, supabase);
    userId = user.id;
    await requireDeveloperAccess(supabase, user.id);
    const proCheck = await requireProSubscription(user.id, corsHeaders, {
      audience: "developer",
    });
    if (proCheck.errorResponse) return proCheck.errorResponse;
    projectId = payload.project.id;

    const resolvedCoordinates = await geocodeProjectCoordinates(payload.project, payload.listing);
    const projectRow = resolvedCoordinates
      ? { ...payload.project, ...resolvedCoordinates, owner_id: user.id }
      : { ...payload.project, owner_id: user.id };
    const listingRow = resolvedCoordinates
      ? { ...payload.listing, ...resolvedCoordinates }
      : payload.listing;

    const { error: projectError } = await supabase
      .from("projects")
      .insert(projectRow);
    if (projectError) throw projectError;
    projectCreated = true;

    const unitIds: string[] = [];
    for (const unitPayload of payload.units ?? [payload.unit]) {
      const { data: unit, error: unitError } = await supabase
        .from("project_units")
        .insert(withComputedPricePerSqm({ ...unitPayload, project_id: projectId }))
        .select("id")
        .single();
      if (unitError) throw unitError;
      if (unit?.id) unitIds.push(unit.id);
    }

    if (payload.projectMedia.length > 0) {
      const { error: mediaError } = await supabase
        .from("project_media")
        .insert(payload.projectMedia.map((media) => ({ ...media, project_id: projectId })));
      if (mediaError) throw mediaError;
    }

    const { data: listing, error: listingError } = await supabase
      .from("listings")
      .insert(withComputedPricePerSqm({
        ...listingRow,
        owner_id: user.id,
        project_id: projectId,
        listing_type: "new_build",
        is_pre_sale: false,
      }))
      .select("id")
      .single();
    if (listingError) throw listingError;
    listingId = listing?.id ?? null;
    if (!listingId) throw new Error("listing_missing_id");

    for (const unitId of unitIds) {
      const { error: unitLinkError } = await supabase
        .from("project_units")
        .update({ listing_id: listingId })
        .eq("id", unitId)
        .eq("project_id", projectId);
      if (unitLinkError) throw unitLinkError;
    }

    if (payload.additionalImageUrls.length > 0) {
      const { error: imageError } = await supabase
        .from("listing_images")
        .insert(payload.additionalImageUrls.map((url, idx) => ({
          listing_id: listingId,
          url,
          sort_order: idx + 1,
        })));
      if (imageError) throw imageError;
    }

    await logAuditEvent({
      actor_id: user.id,
      target_id: listingId,
      entity: payload.projectKind === "renovation" ? "renovation_project.listing" : "new_build.listing",
      action: "CREATED",
      new_data: { project_id: projectId },
      reason: "create_new_building_listing",
    });

    return jsonResponse({ data: { listingId, projectId }, error: null }, 200, corsHeaders);
  } catch (err: unknown) {
    if (userId && projectId && projectCreated) {
      await rollbackOwnedRoots(supabase, userId, projectId, listingId).catch((rollbackErr) => {
        log.warn("new building rollback failed", { err: errorMessage(rollbackErr), projectId, listingId });
      });
    }

    if (err instanceof AuthError) {
      return jsonResponse({ error: err.message }, err.status, corsHeaders);
    }

    const message = errorMessage(err);
    log.warn("new building listing failed", { err: message, projectId, listingId });
    return jsonResponse({ error: message }, 400, corsHeaders);
  }
});
