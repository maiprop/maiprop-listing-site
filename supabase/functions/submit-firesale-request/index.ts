/**
 * submit-firesale-request - authenticated Quick Sale request boundary.
 *
 * The browser does not write `firesale_requests` directly. This function
 * validates the payload, verifies the caller JWT, checks the caller still has a
 * seller profile, and forces `user_id` from the verified auth user.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { AuthError, verifyBearerToken } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import { parseJsonBody, z } from "../_shared/schema.ts";

const log = createLogger("submit-firesale-request");
const limiter = makeRateLimiter({
  bucket: "submit-firesale-request",
  maxRequests: 30,
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

const schemaString = (field: string, maxLength: number, required = false) =>
  z.unknown().transform((value, ctx) => {
    if (value === null || value === undefined) {
      if (!required) return null;
      ctx.addIssue({ code: "custom", message: `Invalid ${field}` });
      return z.NEVER;
    }
    if (typeof value !== "string") {
      ctx.addIssue({ code: "custom", message: `Invalid ${field}` });
      return z.NEVER;
    }
    const trimmed = value.trim();
    if ((required && trimmed.length === 0) || trimmed.length > maxLength) {
      ctx.addIssue({ code: "custom", message: `Invalid ${field}` });
      return z.NEVER;
    }
    return trimmed.length === 0 ? null : trimmed;
  });

const positiveNumber = (field: string, max: number) =>
  z.unknown().transform((value, ctx) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > max) {
      ctx.addIssue({ code: "custom", message: `Invalid ${field}` });
      return z.NEVER;
    }
    return value;
  });

const nonNegativeNumber = (field: string, max: number) =>
  z.unknown().transform((value, ctx) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) {
      ctx.addIssue({ code: "custom", message: `Invalid ${field}` });
      return z.NEVER;
    }
    return value;
  });

const uuidString = (field: string) =>
  z.unknown().transform((value, ctx) => {
    if (typeof value !== "string" || !UUID_RE.test(value.trim())) {
      ctx.addIssue({ code: "custom", message: `Invalid ${field}` });
      return z.NEVER;
    }
    return value.trim();
  });

const propertyTypeSchema = z.enum([
  "apartment",
  "house",
  "villa",
  "land",
  "commercial",
  "office",
  "studio",
  "maisonette",
  "warehouse",
  "hotel",
  "mixed_use",
  "parking",
  "storage",
]);

const createRequestSchema = z.object({
  action: z.literal("create"),
  request: z.object({
    address: schemaString("address", 240, true),
    city: schemaString("city", 160, true),
    propertyType: propertyTypeSchema,
    sqm: positiveNumber("sqm", 100_000),
    askingPrice: positiveNumber("askingPrice", 100_000_000),
    contactEmail: schemaString("contactEmail", 320, true).transform((email, ctx) => {
      if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        ctx.addIssue({ code: "custom", message: "Invalid contactEmail" });
        return z.NEVER;
      }
      return email.toLowerCase();
    }),
    contactPhone: schemaString("contactPhone", 60),
    notes: schemaString("notes", 4000),
    aiEstimate: nonNegativeNumber("aiEstimate", 100_000_000),
  }).strict(),
}).strict();

const rollbackRequestSchema = z.object({
  action: z.literal("rollback"),
  requestId: uuidString("requestId"),
}).strict();

const requestSchema = z.discriminatedUnion("action", [
  createRequestSchema,
  rollbackRequestSchema,
]);

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

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const message = (err as Record<string, unknown>).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "Quick Sale request failed";
}

async function requireSellerProfile(
  supabase: ProfileLookupClient,
  verifiedUserId: string,
) {
  const profileQuery = supabase.from("profiles") as ProfileLookupQuery;
  const { data, error } = await profileQuery
    .select("role, role_switch_in_progress_at")
    .eq("user_id", verifiedUserId)
    .maybeSingle();

  if (error) throw error;
  if (data?.role !== "seller" || data.role_switch_in_progress_at) {
    throw new AuthError("Quick Sale submissions are available only to seller profiles.", 403);
  }
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

  try {
    const payload = await parseJsonBody(req, requestSchema);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const user = await verifyBearerToken(req, supabase);

    if (payload.action === "rollback") {
      const { error } = await supabase
        .from("firesale_requests")
        .delete()
        .eq("id", payload.requestId)
        .eq("user_id", user.id);
      if (error) throw error;
      return jsonResponse({ data: { deleted: true }, error: null }, 200, corsHeaders);
    }

    await requireSellerProfile(supabase, user.id);

    const { data, error } = await supabase
      .from("firesale_requests")
      .insert({
        address: payload.request.address,
        city: payload.request.city,
        property_type: payload.request.propertyType,
        sqm: payload.request.sqm,
        condition: null,
        asking_price: payload.request.askingPrice,
        contact_email: payload.request.contactEmail,
        contact_phone: payload.request.contactPhone,
        notes: payload.request.notes,
        ai_estimate: payload.request.aiEstimate,
        user_id: user.id,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) throw error;
    return jsonResponse({ data: { id: data?.id ?? null }, error: null }, 200, corsHeaders);
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return jsonResponse({ error: err.message }, err.status, corsHeaders);
    }

    const message = errorMessage(err);
    log.warn("quick sale request failed", { err: message });
    return jsonResponse({ error: message }, 400, corsHeaders);
  }
});
