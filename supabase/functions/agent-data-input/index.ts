/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * agent-data-input — authenticated edge function for the Agent Dashboard
 * "Data Input" feature.
 *
 * Agents can submit closings (sale / lease deals) in exchange for a 0.5%
 * discount per verified entry on their next subscription invoice. Capped
 * at 20 submissions per calendar month (= up to 10% off next invoice).
 *
 * Endpoints (selected via the `action` field in the JSON body):
 *
 *   POST { action: "status" }
 *     → { monthly_count, monthly_limit, pending_discount_pct,
 *         pending_discount_count, total_pending, total_verified,
 *         total_rejected, lifetime_banned, ban_reason, banned_at,
 *         entries: [...] }
 *
 *   POST { action: "submit", payload: { ... } }
 *     → { entry: {...} }
 *
 *   POST { action: "list" }                   (alias of `status` without metrics)
 *     → { entries: [...] }
 *
 *   POST { action: "admin_review", input_id, decision, reason?, lifetime_ban? }
 *     → { entry: {...} }   (admin only)
 *
 * All moderation rules and the monthly cap are enforced by Postgres triggers
 * defined in 20260703000000_agent_data_inputs.sql — this function only
 * surfaces validation errors in a friendlier form.
 */
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";

const log = createLogger("agent-data-input");
const limiter = makeRateLimiter({
  bucket: "agent-data-input",
  maxRequests: 30,
  windowMs: 60_000,
});

const PROPERTY_TYPES = ["apartment", "house", "commercial", "land", "other"] as const;
const TRANSACTION_TYPES = ["sale", "rental"] as const;
const AGENT_SIDES = ["buyer", "seller", "both"] as const;
const DECISIONS = ["pending", "verified", "rejected", "flagged"] as const;

type SubmitPayload = {
  property_address: string;
  city?: string | null;
  postal_code?: string | null;
  kaek?: string | null;
  property_type: string;
  transaction_type: string;
  agent_side: string;
  sale_price: number;
  closing_date: string;
  buyer_name?: string | null;
  seller_name?: string | null;
  notes?: string | null;
};

function validateSubmitPayload(p: unknown): { ok: true; value: SubmitPayload } | { ok: false; error: string } {
  if (!p || typeof p !== "object") return { ok: false, error: "Missing payload" };
  const v = p as Record<string, unknown>;

  const property_address = typeof v.property_address === "string" ? v.property_address.trim() : "";
  if (property_address.length < 5 || property_address.length > 300) {
    return { ok: false, error: "Property address must be between 5 and 300 characters." };
  }

  const property_type = String(v.property_type ?? "");
  if (!PROPERTY_TYPES.includes(property_type as (typeof PROPERTY_TYPES)[number])) {
    return { ok: false, error: `property_type must be one of ${PROPERTY_TYPES.join(", ")}.` };
  }
  const transaction_type = String(v.transaction_type ?? "");
  if (!TRANSACTION_TYPES.includes(transaction_type as (typeof TRANSACTION_TYPES)[number])) {
    return { ok: false, error: `transaction_type must be one of ${TRANSACTION_TYPES.join(", ")}.` };
  }
  const agent_side = String(v.agent_side ?? "");
  if (!AGENT_SIDES.includes(agent_side as (typeof AGENT_SIDES)[number])) {
    return { ok: false, error: `agent_side must be one of ${AGENT_SIDES.join(", ")}.` };
  }

  const priceNum = Number(v.sale_price);
  if (!Number.isFinite(priceNum) || priceNum <= 0 || priceNum >= 1_000_000_000) {
    return { ok: false, error: "sale_price must be a positive number under 1,000,000,000." };
  }

  const closing_date = String(v.closing_date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(closing_date)) {
    return { ok: false, error: "closing_date must be ISO date YYYY-MM-DD." };
  }
  const closing = new Date(`${closing_date}T00:00:00Z`);
  if (Number.isNaN(closing.getTime())) {
    return { ok: false, error: "closing_date is not a valid date." };
  }
  const today = new Date();
  if (closing.getTime() > today.getTime() + 24 * 60 * 60 * 1000) {
    return { ok: false, error: "closing_date cannot be in the future." };
  }
  const fiveYearsAgo = new Date(today);
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  if (closing.getTime() < fiveYearsAgo.getTime()) {
    return { ok: false, error: "closing_date cannot be more than 5 years old." };
  }

  const trim = (s: unknown): string | null => {
    if (typeof s !== "string") return null;
    const t = s.trim();
    return t.length === 0 ? null : t.slice(0, 300);
  };

  return {
    ok: true,
    value: {
      property_address: property_address.slice(0, 300),
      city: trim(v.city),
      postal_code: trim(v.postal_code),
      kaek: trim(v.kaek),
      property_type,
      transaction_type,
      agent_side,
      sale_price: Math.round(priceNum * 100) / 100,
      closing_date,
      buyer_name: trim(v.buyer_name),
      seller_name: trim(v.seller_name),
      notes: typeof v.notes === "string" ? v.notes.trim().slice(0, 2000) : null,
    },
  };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsHeaders = getCorsHeaders(req);
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceRoleKey || !supabaseUrl) return json({ error: "Service unavailable" }, 503);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Empty bearer token" }, 401);

  // Service-role client (bypasses RLS — needed for admin actions and to
  // query/insert with full visibility). All authorization is enforced by
  // the DB RPCs / triggers themselves.
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData.user) return json({ error: "Unauthenticated" }, 401);
  const user = userData.user;

  let body: { action?: string; payload?: unknown; input_id?: string; decision?: string; reason?: string; lifetime_ban?: boolean } = {};
  try {
    if (req.method === "POST" && req.body) body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = body.action ?? "status";

  try {
    if (action === "status" || action === "list") {
      const [statusRes, entriesRes] = await Promise.all([
        supabase.rpc("get_agent_data_input_status", { p_user_id: user.id }),
        (supabase.from as any)("agent_data_inputs")
          .select(
            "id, property_address, city, postal_code, property_type, transaction_type, agent_side, sale_price, closing_date, status, rejection_reason, discount_pct, discount_applied, discount_applied_at, discount_invoice_id, created_at, reviewed_at",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      if (statusRes.error) {
        log.error("status rpc failed", { user_id: user.id, err: statusRes.error.message });
        return json({ error: statusRes.error.message }, 500);
      }
      if (entriesRes.error) {
        log.error("list entries failed", { user_id: user.id, err: entriesRes.error.message });
        return json({ error: entriesRes.error.message }, 500);
      }

      const status = (statusRes.data?.[0] ?? {
        monthly_count: 0,
        monthly_limit: 20,
        discount_pct_per_input: 0.5,
        pending_discount_pct: 0,
        pending_discount_count: 0,
        total_pending: 0,
        total_verified: 0,
        total_rejected: 0,
        lifetime_banned: false,
        ban_reason: null,
        banned_at: null,
      }) as Record<string, unknown>;

      return json({ ...status, entries: entriesRes.data ?? [] });
    }

    if (action === "submit") {
      const result = validateSubmitPayload(body.payload);
      if (!result.ok) return json({ error: result.error }, 400);

      const { data, error } = await (supabase.from as any)("agent_data_inputs")
        .insert({ ...result.value, user_id: user.id })
        .select(
          "id, property_address, city, property_type, transaction_type, agent_side, sale_price, closing_date, status, discount_pct, created_at",
        )
        .single();

      if (error) {
        // Map known DB raises to friendly client messages.
        const m = error.message ?? "";
        if (m.includes("agent_data_input_lifetime_banned")) {
          return json({
            error: "lifetime_banned",
            message:
              "You no longer have access to the Data Input feature. This is permanent and cannot be reversed.",
          }, 403);
        }
        if (m.includes("agent_data_input_monthly_limit_reached")) {
          return json({
            error: "monthly_limit_reached",
            message: "You have already submitted 20 data inputs this month. Try again next month.",
          }, 429);
        }
        if (m.includes("agent_role_required")) {
          return json({
            error: "agent_role_required",
            message: "Only agents can submit closings for the Data Input discount.",
          }, 403);
        }
        log.error("submit failed", { user_id: user.id, err: m });
        return json({ error: m }, 400);
      }

      log.info("data input submitted", { user_id: user.id, id: (data as { id?: string } | null)?.id });
      return json({ entry: data });
    }

    if (action === "admin_review") {
      // The DB RPC enforces admin-only — but we add a friendlier 403 here too.
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if ((profile as { role?: string } | null)?.role !== "admin") {
        return json({ error: "Forbidden" }, 403);
      }

      const inputId = String(body.input_id ?? "");
      const decision = String(body.decision ?? "");
      const reason = body.reason != null ? String(body.reason).slice(0, 500) : null;
      const lifetimeBan = body.lifetime_ban === true;

      if (!/^[0-9a-f-]{36}$/i.test(inputId)) return json({ error: "Invalid input_id" }, 400);
      if (!DECISIONS.includes(decision as (typeof DECISIONS)[number])) {
        return json({ error: "Invalid decision" }, 400);
      }

      // Pass user.id as p_reviewer_id so the RPC populates `reviewed_by`
      // correctly. The RPC trusts service_role callers (auth.uid() is NULL)
      // when an explicit reviewer id is supplied; we already verified the
      // caller is an admin above.
      const { data, error } = await supabase.rpc("admin_review_agent_data_input", {
        p_input_id: inputId,
        p_decision: decision,
        p_reason: reason,
        p_lifetime_ban: lifetimeBan,
        p_reviewer_id: user.id,
      });
      if (error) {
        log.error("admin_review failed", { user_id: user.id, err: error.message });
        return json({ error: error.message }, 400);
      }
      return json({ entry: data });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("unhandled error", { user_id: user.id, action, err: message });
    return json({ error: message }, 500);
  }
});
