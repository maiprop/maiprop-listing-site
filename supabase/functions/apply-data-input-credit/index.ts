/**
 * apply-data-input-credit
 *
 * Admin-only edge function that converts a VERIFIED agent_data_inputs row into
 * a Stripe customer balance credit, applied to the agent's next subscription
 * invoice. One row → one credit. Re-running on an already-applied row is a
 * no-op (idempotent on stripe_credit_id).
 *
 * Credit amount = current monthly subscription amount × discount_pct%.
 * The cap of 20 verified inputs/month, combined with discount_pct = 0.5%,
 * caps the cumulative monthly discount at 10% — enforced server-side here as
 * a defence-in-depth check against config drift.
 */

import Stripe from "npm:stripe@22.3.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { AuthError, verifyBearerToken } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import {
  buildIdempotencyKey,
  createVerifiedStripeClient,
} from "../_shared/stripeClient.ts";
import { SchemaValidationError } from "../_shared/schema.ts";
import { parseApplyDataInputCreditRequest } from "./request.ts";

const log = createLogger("apply-data-input-credit");
const limiter = makeRateLimiter({
  bucket: "apply-data-input-credit",
  maxRequests: 30,
  windowMs: 60_000,
});

interface AgentDataInputRow {
  id: string;
  user_id: string;
  status: string;
  discount_pct: number;
  applied_to_invoice_at: string | null;
  stripe_credit_id: string | null;
  stripe_credit_amount_cents: number | null;
  stripe_credit_currency: string | null;
  discount_applied: boolean | null;
  discount_applied_at: string | null;
  discount_invoice_id: string | null;
}

interface ProfileRow {
  user_id: string;
  email: string | null;
}

const MAX_DISCOUNT_PCT_PER_MONTH = 10; // 20 inputs × 0.5%

async function resolveCustomer(
  stripe: Stripe,
  supabase: { from: (table: string) => unknown },
  userId: string,
): Promise<string | null> {
  try {
    const search = await stripe.customers.search({
      query: `metadata['user_id']:'${userId}'`,
      limit: 1,
    });
    if (search.data[0]) return search.data[0].id;
  } catch (_err) {
    // search API may be unavailable — fall through to email lookup.
  }
  const { data, error } = await (supabase.from("billing_customers") as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (
          column: string,
          opts: { ascending: boolean },
        ) => {
          limit: (count: number) => PromiseLike<{
            data?: Array<{ stripe_customer_id?: string | null }> | null;
            error?: { message?: string } | null;
          }>;
        };
      };
    };
  }).select("stripe_customer_id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message ?? "billing customer lookup failed");
  return data?.[0]?.stripe_customer_id ?? null;
}

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let dataInputId: string;
  try {
    ({ data_input_id: dataInputId } = await parseApplyDataInputCreditRequest(
      req,
    ));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const payload = error instanceof SchemaValidationError
      ? { error: message, code: error.code, issues: error.issues }
      : { error: message };
    return new Response(JSON.stringify(payload), {
      status: error instanceof SchemaValidationError
        ? error.code === "payload_too_large" ? 413 : 400
        : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!stripeKey || !serviceRoleKey || !supabaseUrl) {
    log.error("missing env", {
      hasStripe: !!stripeKey,
      hasService: !!serviceRoleKey,
      hasUrl: !!supabaseUrl,
    });
    return new Response(JSON.stringify({ error: "Service not configured" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const caller = await verifyBearerToken(req, supabase);

    // Admin-only.
    const { data: callerProfile, error: profileErr } = await supabase
      .from("profiles")
      .select("role, is_platform_admin")
      .eq("user_id", caller.id)
      .maybeSingle();
    if (profileErr) throw new Error(profileErr.message);
    const isAdmin = callerProfile?.role === "admin" ||
      callerProfile?.is_platform_admin === true;
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load the data input row. `agent_data_inputs` is unregistered in the
    // generated Supabase types; cast through the narrow `from` overload bridge
    // that the rest of this codebase uses for unregistered tables.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rowRaw, error: rowErr } = await (supabase as any).from(
      "agent_data_inputs",
    )
      .select(
        "id, user_id, status, discount_pct, applied_to_invoice_at, stripe_credit_id, stripe_credit_amount_cents, stripe_credit_currency, discount_applied, discount_applied_at, discount_invoice_id",
      )
      .eq("id", dataInputId)
      .maybeSingle();
    if (rowErr) throw new Error(rowErr.message);
    if (!rowRaw) {
      return new Response(JSON.stringify({ error: "Data input not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const row = rowRaw as AgentDataInputRow;

    if (row.status !== "verified") {
      return new Response(
        JSON.stringify({
          error: `Cannot apply credit to row with status=${row.status}`,
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Idempotency: if already applied, return the existing record.
    const existingAppliedAt = row.applied_to_invoice_at ??
      row.discount_applied_at;
    const existingCreditId = row.stripe_credit_id ?? row.discount_invoice_id;
    if (existingAppliedAt && (existingCreditId || row.discount_applied)) {
      log.info("already applied", {
        id: row.id,
        stripe_credit_id: existingCreditId,
      });
      return new Response(
        JSON.stringify({
          applied: true,
          idempotent: true,
          stripe_credit_id: existingCreditId,
          amount_cents: row.stripe_credit_amount_cents,
          currency: row.stripe_credit_currency,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // Resolve the agent profile before applying a Stripe customer balance credit.
    const { data: agentProfileRaw, error: agentProfileErr } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("user_id", row.user_id)
      .maybeSingle();
    if (agentProfileErr) throw new Error(agentProfileErr.message);
    if (!agentProfileRaw) {
      return new Response(JSON.stringify({ error: "Agent profile missing" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = await createVerifiedStripeClient(stripeKey);
    const customerId = await resolveCustomer(stripe, supabase, row.user_id);
    if (!customerId) {
      return new Response(
        JSON.stringify({ error: "No Stripe customer for this agent" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Find the agent's active or trialing subscription to compute the credit
    // base. `check-subscription` and `delete-account` both treat trialing as
    // subscribed, so accept either here for consistency.
    const [activeSubs, trialingSubs] = await Promise.all([
      stripe.subscriptions.list({
        customer: customerId,
        status: "active",
        limit: 1,
      }),
      stripe.subscriptions.list({
        customer: customerId,
        status: "trialing",
        limit: 1,
      }),
    ]);
    const sub = activeSubs.data[0] ?? trialingSubs.data[0];
    if (!sub) {
      return new Response(
        JSON.stringify({ error: "Agent has no active subscription" }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const price = sub.items.data[0]?.price;
    const unitAmount = price?.unit_amount ?? null; // cents
    const currency = price?.currency ?? "eur";
    if (!unitAmount || unitAmount <= 0) {
      return new Response(
        JSON.stringify({ error: "Active subscription has no unit amount" }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Defence-in-depth: never apply more than 10% cumulatively in any one
    // calendar month, even if more verified rows than the DB cap somehow
    // exist (e.g. data drift).
    const monthStart = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
    ).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: appliedThisMonthRaw } = await (supabase as any).from(
      "agent_data_inputs",
    )
      .select("stripe_credit_amount_cents")
      .eq("user_id", row.user_id)
      .gte("applied_to_invoice_at", monthStart);
    const appliedCents = (appliedThisMonthRaw ?? []).reduce(
      (sum: number, r: { stripe_credit_amount_cents: number | null }) =>
        sum + (r.stripe_credit_amount_cents ?? 0),
      0,
    );
    const monthlyCapCents = Math.floor(
      (unitAmount * MAX_DISCOUNT_PCT_PER_MONTH) / 100,
    );

    let creditCents = Math.floor((unitAmount * Number(row.discount_pct)) / 100);
    if (appliedCents + creditCents > monthlyCapCents) {
      creditCents = Math.max(0, monthlyCapCents - appliedCents);
    }

    if (creditCents <= 0) {
      log.info("monthly cap reached, no credit applied", {
        id: row.id,
        applied_cents: appliedCents,
        cap_cents: monthlyCapCents,
      });
      return new Response(
        JSON.stringify({
          applied: false,
          reason: "monthly_cap_reached",
          applied_cents: appliedCents,
          cap_cents: monthlyCapCents,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // Apply credit on Stripe (negative amount = credit toward next invoice).
    const balanceTx = await stripe.customers.createBalanceTransaction(
      customerId,
      {
        amount: -creditCents,
        currency,
        description: `maiProp data-input loyalty credit (${
          Number(row.discount_pct)
        }% × subscription)`,
        metadata: {
          agent_data_input_id: row.id,
          user_id: row.user_id,
        },
      },
      {
        idempotencyKey: await buildIdempotencyKey("data-input-credit", [
          row.id,
          row.user_id,
          customerId,
          creditCents,
          currency,
        ]),
      },
    );

    // Persist to DB so we never double-apply. The conditional `.is(..., null)`
    // filter is the atomic guard that closes the read-then-write race: two
    // concurrent callers may both have read a null `stripe_credit_id` above,
    // but the database will only let the FIRST of these two UPDATEs match the
    // null condition. The second UPDATE returns 0 rows; we detect that by
    // asking PostgREST to RETURN the affected row and treat a missing row as
    // "another caller won the race", in which case we reverse the orphaned
    // Stripe credit so the customer is never charged twice.
    const appliedAt = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: claimed, error: updateErr } = await (supabase as any).from(
      "agent_data_inputs",
    )
      .update({
        applied_to_invoice_at: appliedAt,
        stripe_credit_id: balanceTx.id,
        stripe_credit_amount_cents: creditCents,
        stripe_credit_currency: currency,
        discount_applied: true,
        discount_applied_at: appliedAt,
        discount_invoice_id: balanceTx.id,
      })
      .eq("id", row.id)
      .eq("status", "verified")
      .is("stripe_credit_id", null)
      .is("discount_invoice_id", null)
      .select("id")
      .maybeSingle();

    if (updateErr) {
      // DB error after Stripe write — surface loudly so an operator can
      // reconcile via the Stripe metadata search.
      log.error("DB update after credit failed", {
        id: row.id,
        stripe_credit_id: balanceTx.id,
        err: updateErr.message,
      });
      return new Response(
        JSON.stringify({
          error: "Credit applied on Stripe but DB update failed",
          stripe_credit_id: balanceTx.id,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!claimed) {
      // Race lost — another concurrent caller has already recorded a credit
      // for this row. Reverse the orphan we just created so Stripe's net
      // effect remains exactly one credit per row.
      log.warn("race lost, reversing orphan Stripe credit", {
        id: row.id,
        orphan_balance_tx: balanceTx.id,
      });
      try {
        await stripe.customers.createBalanceTransaction(
          customerId,
          {
            amount: creditCents, // positive = revoke the negative credit above
            currency,
            description:
              `Reversal: duplicate apply attempt on data input ${row.id}`,
            metadata: {
              reversed_for: balanceTx.id,
              agent_data_input_id: row.id,
              user_id: row.user_id,
            },
          },
          {
            idempotencyKey: await buildIdempotencyKey(
              "data-input-credit-reversal",
              [row.id, balanceTx.id],
            ),
          },
        );
      } catch (revErr: unknown) {
        // If the reversal fails, the Stripe balance is over-credited and an
        // operator must manually reverse using the metadata above. Logging is
        // the only safe action — the user's primary credit is still recorded.
        log.error("reversal of orphan credit failed", {
          id: row.id,
          orphan_balance_tx: balanceTx.id,
          err: revErr instanceof Error ? revErr.message : String(revErr),
        });
      }
      return new Response(
        JSON.stringify({
          applied: false,
          reason: "duplicate_concurrent_apply",
          orphan_balance_tx: balanceTx.id,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    log.info("credit applied", {
      id: row.id,
      user_id: row.user_id,
      amount_cents: creditCents,
      currency,
      stripe_credit_id: balanceTx.id,
    });

    return new Response(
      JSON.stringify({
        applied: true,
        idempotent: false,
        stripe_credit_id: balanceTx.id,
        amount_cents: creditCents,
        currency,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: unknown) {
    const status = error instanceof AuthError
      ? error.status
      : error instanceof SchemaValidationError
      ? error.code === "payload_too_large" ? 413 : 400
      : 500;
    const message = error instanceof Error ? error.message : String(error);
    log.error("ERROR", { message });
    const payload = error instanceof SchemaValidationError
      ? { error: message, code: error.code, issues: error.issues }
      : { error: message };
    return new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Type guard helper to silence linter when ProfileRow is conceptually used by
// the auth lookup but no value flows through; keeps a single declaration site
// for the row shape if the function ever evolves to read more profile fields.
export type _ProfileRow = ProfileRow;
