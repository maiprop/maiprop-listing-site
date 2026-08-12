/**
 * project-management - authenticated project inventory mutation boundary.
 *
 * Project, unit, media, and lead reads may stay browser-side through RLS.
 * Sensitive writes are routed here so the browser cannot directly mutate
 * project-owned tables or rely on client-side ownership checks.
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
import { parseJsonBody, SchemaValidationError, z } from "../_shared/schema.ts";
import { logAuditEvent } from "../_shared/auditLog.ts";

const log = createLogger("project-management");
const limiter = makeRateLimiter({
  bucket: "project-management",
  maxRequests: 120,
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
  z.string().trim().regex(UUID_RE, `Invalid ${field}`);

const nullableString = (field: string, maxLength: number) =>
  z.union([
    z.string().trim().max(maxLength, `Invalid ${field}`),
    z.null(),
  ]).optional();

const nullableEmail = (field: string) =>
  z.union([
    z.string().trim().toLowerCase().email(`Invalid ${field}`).max(320, `Invalid ${field}`),
    z.null(),
  ]).optional();

const requiredString = (field: string, maxLength: number) =>
  z.string().trim().min(1, `Invalid ${field}`).max(maxLength, `Invalid ${field}`);

const nullableNumber = (field: string, options: { min?: number; max?: number } = {}) => {
  let numberSchema = z.number().finite(`Invalid ${field}`);
  if (options.min !== undefined) numberSchema = numberSchema.min(options.min, `Invalid ${field}`);
  if (options.max !== undefined) numberSchema = numberSchema.max(options.max, `Invalid ${field}`);
  return z.union([numberSchema, z.null()]).optional();
};

const nullableBoolean = z.union([z.boolean(), z.null()]).optional();

const hasDefinedValues = (value: Record<string, unknown>) =>
  Object.values(value).some((entry) => entry !== undefined);

const projectUpdateSchema = z.object({
  name: nullableString("project name", 180),
  description: nullableString("project description", 4000),
  city: nullableString("project city", 120),
  address: nullableString("project address", 240),
  municipality: nullableString("project municipality", 160),
  cover_image_url: nullableString("project cover image", 2048),
  status: nullableString("project status", 80),
  latitude: nullableNumber("project latitude", { min: -90, max: 90 }),
  longitude: nullableNumber("project longitude", { min: -180, max: 180 }),
  building_permit_number: nullableString("building permit", 120),
  developer_company: nullableString("developer company", 200),
  architect_group: nullableString("architect group", 200),
  construction_company: nullableString("construction company", 200),
  area_description: nullableString("area description", 4000),
  permit_approval_date: nullableString("permit approval date", 80),
  construction_start_date: nullableString("construction start date", 80),
  structural_completion_date: nullableString("structural completion date", 80),
  delivery_date: nullableString("delivery date", 80),
  archived_at: nullableString("project archive date", 80),
}).refine(hasDefinedValues, { message: "Invalid project update" });

const unitWriteSchema = z.object({
  unit_id: nullableString("unit id", 80),
  floor: nullableNumber("unit floor", { min: -20, max: 300 }),
  unit_number: nullableString("unit number", 80),
  availability_status: z.enum(["available", "reserved", "sold"]).optional(),
  internal_sqm: nullableNumber("unit size", { min: 0, max: 100_000 }),
  balcony_sqm: nullableNumber("unit balcony", { min: 0, max: 100_000 }),
  storage_sqm: nullableNumber("unit storage", { min: 0, max: 100_000 }),
  parking_sqm: nullableNumber("unit parking", { min: 0, max: 100_000 }),
  bedrooms: nullableNumber("unit bedrooms", { min: 0, max: 50 }),
  bathrooms: nullableNumber("unit bathrooms", { min: 0, max: 50 }),
  kitchen_type: nullableString("unit kitchen", 120),
  living_rooms: nullableNumber("unit living rooms", { min: 0, max: 50 }),
  price: nullableNumber("unit price", { min: 0, max: 100_000_000 }),
  price_per_sqm: nullableNumber("unit price per sqm", { min: 0, max: 1_000_000 }),
  vat_included: nullableBoolean,
  parking_price: nullableNumber("unit parking price", { min: 0, max: 100_000_000 }),
  storage_price: nullableNumber("unit storage price", { min: 0, max: 100_000_000 }),
  sea_view: nullableBoolean,
  city_view: nullableBoolean,
  mountain_view: nullableBoolean,
  energy_class: nullableString("unit energy class", 20),
  heating_system: nullableString("unit heating", 120),
  cooling_system: nullableString("unit cooling", 120),
});

const unitUpdateSchema = unitWriteSchema.refine(hasDefinedValues, { message: "Invalid unit update" });

const mediaWriteSchema = z.object({
  url: requiredString("project media URL", 2048),
  media_type: requiredString("project media type", 80),
  title: nullableString("project media title", 180),
  sort_order: z.number().int("Invalid project media order").min(0, "Invalid project media order").max(500, "Invalid project media order").optional(),
});

const leadWriteSchema = z.object({
  name: requiredString("project lead name", 160),
  email: nullableEmail("project lead email"),
  phone: nullableString("project lead phone", 60),
  source: nullableString("project lead source", 120),
  unit_id: z.union([uuidString("unit id"), z.null()]).optional(),
  status: z.enum(["new", "contacted", "qualified", "converted", "lost"]).optional(),
  notes: nullableString("project lead notes", 4000),
});

const leadUpdateSchema = leadWriteSchema.partial().refine(hasDefinedValues, { message: "Invalid project lead update" });

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update_project"),
    id: uuidString("project id"),
    updates: projectUpdateSchema,
  }),
  z.object({
    action: z.literal("delete_project"),
    id: uuidString("project id"),
  }),
  z.object({
    action: z.literal("update_listing_cover"),
    projectId: uuidString("project id"),
    listingId: uuidString("listing id"),
    coverImageUrl: z.string().trim().url("Invalid listing cover image").max(2048, "Invalid listing cover image"),
  }),
  z.object({
    action: z.literal("create_unit"),
    projectId: uuidString("project id"),
    unit: unitWriteSchema,
  }),
  z.object({
    action: z.literal("update_unit"),
    projectId: uuidString("project id"),
    id: uuidString("unit id"),
    updates: unitUpdateSchema,
  }),
  z.object({
    action: z.literal("delete_unit"),
    projectId: uuidString("project id"),
    id: uuidString("unit id"),
  }),
  z.object({
    action: z.literal("add_media"),
    projectId: uuidString("project id"),
    media: mediaWriteSchema,
  }),
  z.object({
    action: z.literal("delete_media"),
    projectId: uuidString("project id"),
    id: uuidString("project media id"),
  }),
  z.object({
    action: z.literal("create_lead"),
    projectId: uuidString("project id"),
    lead: leadWriteSchema,
  }),
  z.object({
    action: z.literal("update_lead"),
    projectId: uuidString("project id"),
    id: uuidString("project lead id"),
    updates: leadUpdateSchema,
  }),
  z.object({
    action: z.literal("delete_lead"),
    projectId: uuidString("project id"),
    id: uuidString("project lead id"),
  }),
]);

type RequestPayload = z.infer<typeof requestSchema>;

type DbError = { message: string } | null;
type DbRow = Record<string, unknown>;
type DbResult<T = DbRow> = {
  data: T | null;
  error: DbError;
};
type SelectFilter = PromiseLike<DbResult<DbRow[]>> & {
  maybeSingle(): PromiseLike<DbResult>;
};
type SelectQuery = {
  eq(column: string, value: unknown): SelectFilter;
};
type MutationFilter = PromiseLike<{ error: DbError }> & {
  eq(column: string, value: unknown): MutationFilter;
  select(columns?: string): {
    single(): PromiseLike<DbResult>;
  };
};
type InsertQuery = {
  select(columns?: string): {
    single(): PromiseLike<DbResult>;
  };
};
type TableQuery = {
  select(columns: string): SelectQuery;
  insert(payload: DbRow | DbRow[]): InsertQuery;
  upsert(
    payload: DbRow | DbRow[],
    options: { onConflict: string },
  ): PromiseLike<{ error: DbError }>;
  update(payload: DbRow): MutationFilter;
  delete(): MutationFilter;
};

type SupabaseClient = {
  auth: {
    getUser(token: string): Promise<{
      data: { user: { id: string; email?: string | null } | null };
      error: { message: string } | null;
    }>;
  };
  // The Edge runtime does not have generated database types available here.
  // Zod schemas above define the public contract; table calls stay structural.
  from(table: string): TableQuery;
  rpc<T = DbRow>(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<DbResult<T>>;
};

type ProfileRow = {
  role: string | null;
  role_switch_in_progress_at: string | null;
};

type ProjectManagementContextRow = {
  id: string;
  owner_id: string;
  organization_id: string | null;
};

type ProjectMediaCleanupJob = {
  bucket: "project-media";
  object_path: string;
  object_url: string;
  owner_id: string;
  project_id: string;
  reason: "project_deleted";
};

type ProjectUnitPriceRow = {
  id: string;
  project_id: string;
  price: number | null;
  internal_sqm: number | null;
  price_per_sqm: number | null;
};

const positiveFiniteNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

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

function withComputedUnitPricePerSqm<T extends DbRow>(
  unit: T,
  fallback?: Pick<ProjectUnitPriceRow, "price" | "internal_sqm" | "price_per_sqm"> | null,
): T {
  const pricePerSqm = calculatePricePerSqm(
    unit.price ?? fallback?.price,
    unit.internal_sqm ?? fallback?.internal_sqm,
    unit.price_per_sqm ?? fallback?.price_per_sqm,
  );
  if (pricePerSqm == null) return unit;
  return { ...unit, price_per_sqm: pricePerSqm };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const message = (err as Record<string, unknown>).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "Project management request failed";
}

function responseRowId(data: DbRow | null, fallback: string): string {
  return typeof data?.id === "string" ? data.id : fallback;
}

function exactProjectMediaCleanupJob(
  rawUrl: unknown,
  supabaseUrl: string,
  project: ProjectManagementContextRow,
): ProjectMediaCleanupJob | null {
  if (typeof rawUrl !== "string" || rawUrl.length === 0) return null;

  try {
    const url = new URL(rawUrl);
    const expectedOrigin = new URL(supabaseUrl).origin;
    const marker = "/storage/v1/object/public/project-media/";
    if (url.origin !== expectedOrigin || !url.pathname.startsWith(marker)) return null;

    const encodedSegments = url.pathname.slice(marker.length).split("/");
    if (encodedSegments.length < 3) return null;
    const segments = encodedSegments.map((segment) => decodeURIComponent(segment));
    if (segments.some((segment) =>
      !segment
      || segment === "."
      || segment === ".."
      || segment.includes("/")
      || segment.includes("\\")
    )) {
      return null;
    }
    if (
      segments[0].toLowerCase() !== project.owner_id.toLowerCase()
      || segments[1].toLowerCase() !== project.id.toLowerCase()
    ) {
      return null;
    }

    return {
      bucket: "project-media",
      object_path: segments.join("/"),
      object_url: rawUrl,
      owner_id: project.owner_id,
      project_id: project.id,
      reason: "project_deleted",
    };
  } catch {
    return null;
  }
}

async function loadProjectMediaCleanupJobs(
  supabase: SupabaseClient,
  supabaseUrl: string,
  project: ProjectManagementContextRow,
): Promise<ProjectMediaCleanupJob[]> {
  const { data, error } = await supabase
    .from("project_media")
    .select("url")
    .eq("project_id", project.id);
  if (error) throw error;

  const jobs = new Map<string, ProjectMediaCleanupJob>();
  let skipped = 0;
  for (const row of data ?? []) {
    const job = exactProjectMediaCleanupJob(row.url, supabaseUrl, project);
    if (!job) {
      skipped += 1;
      continue;
    }
    jobs.set(`${job.bucket}:${job.object_path}`, job);
  }
  if (skipped > 0) {
    log.warn("project deletion preserved non-owned or invalid project media references", {
      projectId: project.id,
      skipped,
    });
  }
  return [...jobs.values()];
}

function projectMediaLifecycleObjects(
  jobs: readonly ProjectMediaCleanupJob[],
) {
  return jobs.map((job) => ({
    bucket: job.bucket,
    object_path: job.object_path,
    object_url: job.object_url,
  }));
}

async function stageProjectMediaCleanupJobs(
  supabase: SupabaseClient,
  jobs: readonly ProjectMediaCleanupJob[],
): Promise<DbError> {
  if (jobs.length === 0) return null;
  const first = jobs[0];
  const { error } = await supabase.rpc(
    "stage_storage_cleanup_jobs_for_service",
    {
      p_owner_id: first.owner_id,
      p_project_id: first.project_id,
      p_reason: first.reason,
      p_objects: projectMediaLifecycleObjects(jobs),
      p_mode: "hold",
      p_last_error: "awaiting_project_delete",
    },
  );
  return error;
}

async function settleProjectMediaCleanupJobs(
  supabase: SupabaseClient,
  jobs: readonly ProjectMediaCleanupJob[],
  outcome: "release" | "complete",
): Promise<DbError> {
  if (jobs.length === 0) return null;
  const first = jobs[0];
  const { error } = await supabase.rpc(
    "settle_storage_cleanup_jobs_for_service",
    {
      p_owner_id: first.owner_id,
      p_project_id: first.project_id,
      p_objects: projectMediaLifecycleObjects(jobs),
      p_outcome: outcome,
    },
  );
  return error;
}

async function requireDeveloperAccess(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, role_switch_in_progress_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;

  const profile = data as ProfileRow | null;
  const role = profile?.role;
  if ((role !== "developer" && role !== "admin") || (role !== "admin" && profile?.role_switch_in_progress_at)) {
    throw new AuthError("developer_role_required", 403);
  }
}

async function requireManageableProject(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<ProjectManagementContextRow> {
  const { data, error } = await supabase.rpc<ProjectManagementContextRow[]>(
    "get_project_management_context_for_service",
    {
      p_project_id: projectId,
      p_actor_user_id: userId,
    },
  );
  if (error) throw error;
  const project = data?.[0] ?? null;
  if (!project) {
    throw new AuthError("project_not_managed", 403);
  }
  return project;
}

async function assertLeadUnitScope(
  supabase: SupabaseClient,
  projectId: string,
  unitId: string | null | undefined,
) {
  if (!unitId) return;
  const { data, error } = await supabase
    .from("project_units")
    .select("id, project_id")
    .eq("id", unitId)
    .maybeSingle();
  if (error) throw error;
  const unit = data as { id: string; project_id: string } | null;
  if (!unit || unit.project_id !== projectId) {
    throw new AuthError("unit_not_in_project", 400);
  }
}

async function requireOwnedProjectUnit(
  supabase: SupabaseClient,
  projectId: string,
  unitId: string,
): Promise<ProjectUnitPriceRow> {
  const { data, error } = await supabase
    .from("project_units")
    .select("id, project_id, price, internal_sqm, price_per_sqm")
    .eq("id", unitId)
    .maybeSingle();
  if (error) throw error;
  const unit = data as ProjectUnitPriceRow | null;
  if (!unit || unit.project_id !== projectId) {
    throw new AuthError("unit_not_in_project", 400);
  }
  return unit;
}

async function handleProjectMutation(
  supabase: SupabaseClient,
  userId: string,
  payload: RequestPayload,
  supabaseUrl: string,
) {
  if (payload.action === "delete_project") {
    const project = await requireManageableProject(supabase, payload.id, userId);
    const cleanupJobs = await loadProjectMediaCleanupJobs(supabase, supabaseUrl, project);
    const stagingError = await stageProjectMediaCleanupJobs(supabase, cleanupJobs);
    if (stagingError) throw stagingError;

    const { error } = await supabase.rpc<boolean>("delete_project_for_service", {
      p_project_id: payload.id,
      p_actor_user_id: userId,
    });
    if (error) {
      const {
        data: survivingProject,
        error: reconciliationError,
      } = await supabase
        .from("projects")
        .select("id")
        .eq("id", payload.id)
        .maybeSingle();

      if (reconciliationError) {
        // The deletion may have committed before the response was lost. Keep
        // the hold intact so stale-held recovery can safely settle it later.
        log.warn("project deletion outcome could not be reconciled; cleanup remains held", {
          projectId: payload.id,
          err: reconciliationError.message,
        });
        throw error;
      }

      if (survivingProject) {
        const cancellationError = await settleProjectMediaCleanupJobs(
          supabase,
          cleanupJobs,
          "complete",
        );
        if (cancellationError) {
          log.error("project media cleanup hold cancellation failed", {
            projectId: payload.id,
            err: cancellationError.message,
          });
        }
        if (error.message.includes("project_not_managed")) {
          throw new AuthError("project_not_managed", 403);
        }
        throw error;
      }

      log.warn("project deletion response failed after commit; releasing cleanup hold", {
        projectId: payload.id,
        err: error.message,
      });
    }
    const releaseError = await settleProjectMediaCleanupJobs(
      supabase,
      cleanupJobs,
      "release",
    );
    if (releaseError) {
      // The held rows are deliberately retained. The outbox reclaims stale
      // holds after 15 minutes, so a committed project
      // deletion remains recoverable without reporting a false failure.
      log.warn("project media cleanup release failed; staged jobs will be reclaimed", {
        projectId: payload.id,
        count: cleanupJobs.length,
        err: releaseError.message,
      });
    }
    await logAuditEvent({
      actor_id: userId,
      target_id: payload.id,
      entity: "project",
      action: "DELETED",
      reason: "project_management.delete_project",
    });
    return { id: payload.id };
  }

  const projectId = payload.action === "update_project"
    ? payload.id
    : payload.projectId;
  await requireManageableProject(supabase, projectId, userId);

  switch (payload.action) {
    case "update_project": {
      const { data, error } = await supabase
        .from("projects")
        .update(payload.updates)
        .eq("id", payload.id)
        .select()
        .single();
      if (error) throw error;
      await logAuditEvent({
        actor_id: userId,
        target_id: payload.id,
        entity: "project",
        action: "UPDATED",
        new_data: { fields: Object.keys(payload.updates) },
        reason: "project_management.update_project",
      });
      return data;
    }
    case "update_listing_cover": {
      const { data, error } = await supabase.rpc(
        "update_listing_cover_with_storage_for_service",
        {
          p_actor_user_id: userId,
          p_project_id: payload.projectId,
          p_listing_id: payload.listingId,
          p_cover_image_url: payload.coverImageUrl,
        },
      );
      if (error) throw error;
      await logAuditEvent({
        actor_id: userId,
        target_id: payload.listingId,
        entity: "project.listing_cover",
        action: "UPDATED",
        new_data: { project_id: payload.projectId },
        reason: "project_management.update_listing_cover",
      });
      return data;
    }
    case "create_unit": {
      const { data, error } = await supabase
        .from("project_units")
        .insert(withComputedUnitPricePerSqm({ ...payload.unit, project_id: payload.projectId }))
        .select()
        .single();
      if (error) throw error;
      await logAuditEvent({
        actor_id: userId,
        target_id: responseRowId(data, payload.projectId),
        entity: "project.unit",
        action: "CREATED",
        new_data: { project_id: payload.projectId },
        reason: "project_management.create_unit",
      });
      return data;
    }
    case "update_unit": {
      const currentUnit = await requireOwnedProjectUnit(supabase, payload.projectId, payload.id);
      const unitUpdates = withComputedUnitPricePerSqm(payload.updates, currentUnit);
      const { data, error } = await supabase
        .from("project_units")
        .update(unitUpdates)
        .eq("id", payload.id)
        .eq("project_id", payload.projectId)
        .select()
        .single();
      if (error) throw error;
      await logAuditEvent({
        actor_id: userId,
        target_id: payload.id,
        entity: "project.unit",
        action: "UPDATED",
        new_data: { project_id: payload.projectId, fields: Object.keys(unitUpdates) },
        reason: "project_management.update_unit",
      });
      return data;
    }
    case "delete_unit": {
      const { data, error } = await supabase
        .from("project_units")
        .delete()
        .eq("id", payload.id)
        .eq("project_id", payload.projectId)
        .select("id")
        .single();
      if (error) throw error;
      await logAuditEvent({
        actor_id: userId,
        target_id: payload.id,
        entity: "project.unit",
        action: "DELETED",
        new_data: { project_id: payload.projectId },
        reason: "project_management.delete_unit",
      });
      return data;
    }
    case "add_media": {
      const { data, error } = await supabase.rpc(
        "attach_project_media_for_service",
        {
          p_actor_user_id: userId,
          p_project_id: payload.projectId,
          p_media: payload.media,
        },
      );
      if (error) throw error;
      await logAuditEvent({
        actor_id: userId,
        target_id: responseRowId(data, payload.projectId),
        entity: "project.media",
        action: "CREATED",
        new_data: { project_id: payload.projectId, media_type: payload.media.media_type },
        reason: "project_management.add_media",
      });
      return data;
    }
    case "delete_media": {
      const { data, error } = await supabase
        .from("project_media")
        .delete()
        .eq("id", payload.id)
        .eq("project_id", payload.projectId)
        .select("id")
        .single();
      if (error) throw error;
      await logAuditEvent({
        actor_id: userId,
        target_id: payload.id,
        entity: "project.media",
        action: "DELETED",
        new_data: { project_id: payload.projectId },
        reason: "project_management.delete_media",
      });
      return data;
    }
    case "create_lead": {
      await assertLeadUnitScope(supabase, payload.projectId, payload.lead.unit_id);
      const { data, error } = await supabase
        .from("project_leads")
        .insert({ ...payload.lead, project_id: payload.projectId })
        .select()
        .single();
      if (error) throw error;
      await logAuditEvent({
        actor_id: userId,
        target_id: responseRowId(data, payload.projectId),
        entity: "project.lead",
        action: "CREATED",
        new_data: { project_id: payload.projectId },
        reason: "project_management.create_lead",
      });
      return data;
    }
    case "update_lead": {
      await assertLeadUnitScope(supabase, payload.projectId, payload.updates.unit_id);
      const { data, error } = await supabase
        .from("project_leads")
        .update(payload.updates)
        .eq("id", payload.id)
        .eq("project_id", payload.projectId)
        .select()
        .single();
      if (error) throw error;
      await logAuditEvent({
        actor_id: userId,
        target_id: payload.id,
        entity: "project.lead",
        action: "UPDATED",
        new_data: { project_id: payload.projectId, fields: Object.keys(payload.updates) },
        reason: "project_management.update_lead",
      });
      return data;
    }
    case "delete_lead": {
      const { data, error } = await supabase
        .from("project_leads")
        .delete()
        .eq("id", payload.id)
        .eq("project_id", payload.projectId)
        .select("id")
        .single();
      if (error) throw error;
      await logAuditEvent({
        actor_id: userId,
        target_id: payload.id,
        entity: "project.lead",
        action: "DELETED",
        new_data: { project_id: payload.projectId },
        reason: "project_management.delete_lead",
      });
      return data;
    }
  }
}

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceRoleKey || !supabaseUrl) {
    return jsonResponse({ error: "Service unavailable" }, 503, corsHeaders);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  }) as unknown as SupabaseClient;

  try {
    const payload = await parseJsonBody(req, requestSchema);
    const user = await verifyBearerToken(req, supabase);
    await requireDeveloperAccess(supabase, user.id);
    const proCheck = await requireProSubscription(user.id, corsHeaders, {
      audience: "developer",
    });
    if (proCheck.errorResponse) return proCheck.errorResponse;
    const data = await handleProjectMutation(supabase, user.id, payload, supabaseUrl);
    return jsonResponse({ data, error: null }, 200, corsHeaders);
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return jsonResponse({ error: err.message }, err.status, corsHeaders);
    }

    if (err instanceof SchemaValidationError) {
      return jsonResponse({ error: err.message, issues: err.issues }, 400, corsHeaders);
    }

    const message = errorMessage(err);
    log.warn("project management request failed", { err: message });
    return jsonResponse({ error: message }, 400, corsHeaders);
  }
});
