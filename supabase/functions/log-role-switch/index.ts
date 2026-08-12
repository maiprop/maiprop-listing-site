/**
 * Authenticated role-switch billing and audit boundary.
 *
 * The request is validated before rate-limit persistence or network work. The
 * authenticated profile supplies the source role, Stripe supplies billing
 * truth, and a durable audit intent is written before any Stripe mutation.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { AuthError, verifyBearerToken } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import { SchemaValidationError } from "../_shared/schema.ts";
import { createVerifiedStripeClient } from "../_shared/stripeClient.ts";
import type { Database } from "../../../src/integrations/supabase/types.ts";
import {
  BillingResolutionError,
  reconcileRoleSwitchBilling,
  stripeRuntimeFromKey,
  unknownRoleSwitchBillingResult,
} from "./billing.ts";
import {
  parseRoleSwitchRequest,
  resolveAuthoritativeRoleSwitch,
  type RolePrices,
} from "./request.ts";

const log = createLogger("log-role-switch");
export const ROLE_SWITCH_BILLING_DEADLINE_MS = 20_000;
const limiter = makeRateLimiter({
  bucket: "log-role-switch",
  maxRequests: 5,
  windowMs: 60_000,
});

type BillingOutcome =
  | "not_required"
  | "pending"
  | "succeeded"
  | "already_pending"
  | "unknown";

type FunctionDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions:
      & Omit<
        Database["public"]["Functions"],
        | "finalize_role_switch_audit_for_user"
        | "record_role_switch_audit_for_user"
      >
      & {
      finalize_role_switch_audit_for_user: {
        Args: {
          _audit_id: string;
          _user_id: string;
          _had_active_sub: boolean | null;
          _billing_outcome: BillingOutcome;
          _billing_error: string | null;
          _subscription_count: number | null;
          _cancelled_count: number | null;
        };
        Returns: undefined;
      };
      record_role_switch_audit_for_user: {
        Args: {
          _operation_id: string;
          _user_id: string;
          _from_type: string;
          _to_type: string;
          _switch_kind: string;
        };
        Returns: string;
      };
    };
  };
};

type ServiceClient = ReturnType<typeof createClient<FunctionDatabase>>;

const jsonResponse = (
  body: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function lookupDurableStripeCustomerId(
  supabase: ServiceClient,
  userId: string,
  runtimeMode: "test" | "live",
  livemode: boolean,
  signal: AbortSignal,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .eq("runtime_mode", runtimeMode)
    .eq("livemode", livemode)
    .order("updated_at", { ascending: false })
    .limit(1)
    .abortSignal(signal);
  if (error) {
    throw new BillingResolutionError(
      error.message || "Durable billing customer lookup failed",
    );
  }
  return data?.[0]?.stripe_customer_id ?? null;
}

async function loadRoleSwitchProfile(
  supabase: ServiceClient,
  userId: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "role, participant_type, role_switch_in_progress_at, role_switch_audit_id",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) {
    throw new SchemaValidationError("Role-switch state unavailable", {
      code: "role_switch_state_unavailable",
    });
  }
  return data;
}

const planKeyByRole = {
  buyer: "pro",
  seller: "pro",
  agent: "agent_basic",
  developer: "developer_pro",
  professional: "professional_basic",
} as const;

async function loadAuthoritativeRolePrices(
  supabase: ServiceClient,
  fromType: keyof typeof planKeyByRole | "investor" | "institutional",
  toType:
    | keyof typeof planKeyByRole
    | "investor"
    | "institutional",
): Promise<RolePrices> {
  const roles = [fromType, toType].filter(
    (role): role is keyof typeof planKeyByRole => role in planKeyByRole,
  );
  const keys = [...new Set(roles.map((role) => planKeyByRole[role]))];
  if (keys.length === 0) return {};

  const { data, error } = await supabase
    .from("pricing_configs")
    .select("key, amount")
    .eq("is_active", true)
    .in("key", keys);
  if (error) {
    throw new SchemaValidationError(
      "Authoritative role pricing is unavailable",
      {
        code: "role_switch_pricing_unavailable",
      },
    );
  }

  const amountByKey = new Map(
    (data ?? []).map((row) => [row.key, Number(row.amount)]),
  );
  return Object.fromEntries(
    roles.map((role) => [role, amountByKey.get(planKeyByRole[role])]),
  ) as RolePrices;
}

type AuditState = {
  billing_outcome: BillingOutcome | "legacy" | "failed";
  billing_reconciliation_required: boolean;
  billing_subscription_count: number | null;
  billing_cancelled_count: number | null;
  had_active_sub: boolean | null;
  sub_cancelled: boolean;
};

async function loadAuditState(
  supabase: ServiceClient,
  auditId: string,
  userId: string,
): Promise<AuditState> {
  const { data, error } = await supabase
    .from("role_switch_history")
    .select(
      "billing_outcome, billing_reconciliation_required, billing_subscription_count, billing_cancelled_count, had_active_sub, sub_cancelled",
    )
    .eq("id", auditId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) {
    throw new SchemaValidationError("Role-switch audit is unavailable", {
      code: "role_switch_audit_unavailable",
    });
  }
  return data as AuditState;
}

async function finalizeAudit(
  supabase: ServiceClient,
  args: {
    auditId: string;
    userId: string;
    hadActiveSub: boolean | null;
    billingOutcome: BillingOutcome;
    billingError: string | null;
    subscriptionCount: number | null;
    cancelledCount: number | null;
  },
): Promise<{ message: string } | null> {
  let lastError: { message: string } | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { error } = await supabase.rpc(
      "finalize_role_switch_audit_for_user",
      {
        _audit_id: args.auditId,
        _user_id: args.userId,
        _had_active_sub: args.hadActiveSub,
        _billing_outcome: args.billingOutcome,
        _billing_error: args.billingError,
        _subscription_count: args.subscriptionCount,
        _cancelled_count: args.cancelledCount,
      },
    );
    if (!error) return null;
    lastError = { message: error.message };
  }
  return lastError;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Service unavailable" }, 503, corsHeaders);
  }

  const supabase = createClient<FunctionDatabase>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let user: { id: string; email: string };
  try {
    user = await verifyBearerToken(req, supabase);
  } catch (error: unknown) {
    const message = error instanceof AuthError
      ? error.message
      : "Unauthenticated";
    log.warn("role-switch authentication failed", { error: message });
    return jsonResponse({ error: "Unauthenticated" }, 401, corsHeaders);
  }

  let requestBody: Awaited<ReturnType<typeof parseRoleSwitchRequest>>;
  try {
    requestBody = await parseRoleSwitchRequest(req);
  } catch (error: unknown) {
    if (error instanceof SchemaValidationError) {
      return jsonResponse(
        {
          error: error.message,
          code: error.code,
          issues: error.issues,
        },
        error.status,
        corsHeaders,
      );
    }
    return jsonResponse({ error: "Invalid request body" }, 400, corsHeaders);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  try {
    const profile = await loadRoleSwitchProfile(supabase, user.id);
    const prices = await loadAuthoritativeRolePrices(
      supabase,
      requestBody.from_type,
      requestBody.to_type,
    );
    const { operationId, fromType, toType, switchKind } =
      resolveAuthoritativeRoleSwitch(
        requestBody,
        profile,
        prices,
      );

    const { data: auditId, error: auditError } = await supabase.rpc(
      "record_role_switch_audit_for_user",
      {
        _operation_id: operationId,
        _user_id: user.id,
        _from_type: fromType,
        _to_type: toType,
        _switch_kind: switchKind,
      },
    );
    if (
      auditError || typeof auditId !== "string" || auditId !== operationId
    ) {
      log.warn("role-switch audit intent failed", {
        error: auditError?.message || "missing audit id",
      });
      return jsonResponse(
        { error: "Role switch audit unavailable" },
        503,
        corsHeaders,
      );
    }

    const existingAudit = await loadAuditState(supabase, auditId, user.id);
    if (
      !existingAudit.billing_reconciliation_required &&
      ["not_required", "succeeded", "already_pending"].includes(
        existingAudit.billing_outcome,
      )
    ) {
      return jsonResponse(
        {
          success: true,
          audit_id: auditId,
          sub_cancelled: existingAudit.sub_cancelled,
          sub_cancelled_count: existingAudit.billing_cancelled_count ?? 0,
          billing_outcome: existingAudit.billing_outcome,
          billing_subscription_count: existingAudit.billing_subscription_count,
          had_active_sub: existingAudit.had_active_sub,
          reconciliation_required: false,
          stripe_error: null,
        },
        200,
        corsHeaders,
      );
    }

    let billingResult;
    const billingController = new AbortController();
    const billingTimer = setTimeout(
      () =>
        billingController.abort(
          new DOMException(
            "Role-switch billing deadline exceeded",
            "AbortError",
          ),
        ),
      ROLE_SWITCH_BILLING_DEADLINE_MS,
    );
    try {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (!stripeKey) {
        throw new BillingResolutionError("STRIPE_SECRET_KEY is not set");
      }
      const { runtimeMode, livemode } = stripeRuntimeFromKey(stripeKey);
      const stripe = await createVerifiedStripeClient(stripeKey);
      billingResult = await reconcileRoleSwitchBilling({
        stripe,
        user,
        auditId,
        signal: billingController.signal,
        lookupDurableCustomerId: (signal) =>
          lookupDurableStripeCustomerId(
            supabase,
            user.id,
            runtimeMode,
            livemode,
            signal ?? billingController.signal,
          ),
        onMetadataSearchError: (error) => {
          log.warn("Stripe metadata search failed; using durable ownership", {
            error: error instanceof Error ? error.message : String(error),
          });
        },
      });
    } catch (error: unknown) {
      billingResult = unknownRoleSwitchBillingResult(error);
    } finally {
      clearTimeout(billingTimer);
    }

    const {
      billingOutcome,
      billingError,
      errorDetail: stripeErrorDetail,
      hadActiveSub,
      subscriptionCount,
      cancelledCount,
      newlyCancelledCount,
      alreadyPendingCount,
    } = billingResult;
    if (billingOutcome === "unknown") {
      log.error("Stripe cancellation could not be verified", {
        auditId,
        error: stripeErrorDetail,
      });
    }

    const finalizationError = await finalizeAudit(supabase, {
      auditId,
      userId: user.id,
      hadActiveSub,
      billingOutcome,
      billingError,
      subscriptionCount,
      cancelledCount,
    });
    if (finalizationError) {
      log.error("role-switch audit finalization failed", {
        auditId,
        error: finalizationError.message,
      });
      return jsonResponse(
        {
          error: "Role switch audit finalization failed",
          audit_id: auditId,
          billing_outcome: billingOutcome,
          reconciliation_required: true,
        },
        500,
        corsHeaders,
      );
    }

    if (billingOutcome === "unknown") {
      return jsonResponse(
        {
          error: "Billing cancellation could not be verified",
          audit_id: auditId,
          billing_outcome: billingOutcome,
          reconciliation_required: true,
          stripe_error: "billing_verification_failed",
        },
        502,
        corsHeaders,
      );
    }

    log.info("role switch billing verified", {
      auditId,
      userId: user.id,
      billingOutcome,
      subscriptionCount,
      newlyCancelledCount,
      alreadyPendingCount,
      stripeErrorDetail,
    });
    return jsonResponse(
      {
        success: true,
        audit_id: auditId,
        sub_cancelled: newlyCancelledCount > 0,
        sub_already_cancelling: alreadyPendingCount > 0,
        sub_cancelled_count: newlyCancelledCount,
        sub_already_cancelling_count: alreadyPendingCount,
        billing_outcome: billingOutcome,
        billing_subscription_count: subscriptionCount,
        had_active_sub: hadActiveSub,
        reconciliation_required: false,
        stripe_error: null,
      },
      200,
      corsHeaders,
    );
  } catch (error: unknown) {
    if (error instanceof SchemaValidationError) {
      return jsonResponse(
        {
          error: error.message,
          code: error.code,
          issues: error.issues,
        },
        error.status,
        corsHeaders,
      );
    }
    log.error("role switch failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse({ error: "Role switch failed" }, 500, corsHeaders);
  }
});
