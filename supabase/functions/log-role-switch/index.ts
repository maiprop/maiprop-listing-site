/**
 * log-role-switch — authenticated edge function
 *
 * Called by the frontend when a user confirms a role switch via the RoleSwitchModal.
 *
 * Responsibilities:
 *   1. Authenticate the caller (Bearer token → Supabase user)
 *   2. If cancel_subscription=true, cancel active Stripe subscription at period end
 *   3. Record an audit row in role_switch_history via the SECURITY DEFINER RPC
 *      `record_role_switch_audit` (caller-context, granted to authenticated)
 *
 * We deliberately do NOT do a direct INSERT into role_switch_history. The table's
 * INSERT policy is `WITH CHECK (false)` so any client without a verified service-role
 * JWT is rejected, and Supabase projects can be migrated to the new sb_secret_*
 * key format under the same `SUPABASE_SERVICE_ROLE_KEY` env name — in which case
 * supabase-js does not produce a service_role JWT for PostgREST and the insert
 * silently fails. Going through the RPC removes that dependency entirely.
 */

import Stripe from "npm:stripe@18.5.0";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { createLogger } from "../_shared/logger.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";

const log = createLogger("log-role-switch");
const limiter = makeRateLimiter({ bucket: "log-role-switch", maxRequests: 5, windowMs: 60_000 });

// Redirect the legacy logStep helper through the structured logger.
const logStep = (step: string, details?: unknown) => {
  log.info(step, details && typeof details === "object" ? details as Record<string, unknown> : details !== undefined ? { details } : undefined);
};

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !anonKey) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  // Authentication errors return 401 directly (rather than being caught by
  // the generic 500 handler below) so callers can reliably distinguish "you
  // weren't logged in" from "the server crashed". Tests assert this contract.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  // Caller-context client — forwards the user's JWT to PostgREST so the audit
  // RPC's auth.uid() resolves to this user. Used both for getUser() and the
  // record_role_switch_audit RPC call.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: "Unauthenticated" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const user = userData.user;

  try {
    logStep("Authenticated", { userId: user.id });

    // ── Parse body ────────────────────────────────────────────────────────────
    const body = req.method === "POST" && req.body
      ? await req.json().catch(() => ({}))
      : {};

    const fromType: string = body.from_type ?? "";
    const toType: string = body.to_type ?? "";
    const switchKind: string = body.switch_kind ?? "same-tier";
    const hadActiveSub: boolean = body.had_active_sub === true;
    const cancelSubscription: boolean = body.cancel_subscription === true;

    // ── Stripe: cancel subscription at period end ─────────────────────────────
    // Idempotent: skip the update if the active sub is already pending
    // cancellation. Stripe failures are non-fatal so the audit insert below
    // still runs (preserves the trail), but the error is surfaced in the
    // response body so the UI can warn the user their billing state may not
    // have changed.
    let subCancelled = false;
    let subAlreadyCancelling = false;
    let stripeError: string | null = null;
    if (cancelSubscription) {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (stripeKey && user.email) {
        try {
          const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
          const customers = await stripe.customers.list({ email: user.email, limit: 1 });
          if (customers.data.length > 0) {
            // Stripe's `status` filter only accepts a single value per call. To
            // cancel the user's subscription regardless of which billable state
            // it's in, fetch with status="all" and filter client-side.
            //
            // Billable states (the user is being / will be charged):
            //   - active     : current period paid, will renew
            //   - trialing   : in trial period, will renew at end
            //   - past_due   : payment failed but sub not yet canceled
            //
            // Non-billable states are intentionally skipped:
            //   - canceled / ended / incomplete / incomplete_expired
            //   - paused / unpaid (Stripe stops billing on these)
            const billableStatuses: ReadonlySet<string> = new Set([
              "active",
              "trialing",
              "past_due",
            ]);
            const allSubs = await stripe.subscriptions.list({
              customer: customers.data[0].id,
              status: "all",
              limit: 100,
            });
            const billableSubs = allSubs.data.filter(
              (s: Stripe.Subscription) => billableStatuses.has(s.status),
            );
            if (billableSubs.length > 0) {
              const sub = billableSubs[0];
              if (sub.cancel_at_period_end === true) {
                subAlreadyCancelling = true;
                logStep("Subscription already pending cancellation — skipping update", {
                  subId: sub.id,
                });
              } else {
                await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
                subCancelled = true;
                logStep("Subscription set to cancel at period end", { subId: sub.id });
              }
            }
          }
        } catch (stripeErr: unknown) {
          stripeError = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
          logStep("Stripe cancellation failed", { error: stripeError });
        }
      }
    }

    // ── Audit log insert (via SECURITY DEFINER RPC) ──────────────────────────
    // sub_cancelled in the audit row = "the subscription is configured to cancel
    // at period end after this call". True when we just made the change AND when
    // a previous call already did. False only when Stripe failed or we found no
    // active sub. This preserves the pre-PR semantic (which always re-issued the
    // update and recorded true) while keeping the Stripe call idempotent.
    const subPendingCancellation = subCancelled || subAlreadyCancelling;
    const { error: insertError } = await supabase.rpc("record_role_switch_audit", {
      _from_type: fromType,
      _to_type: toType || "",
      _switch_kind: switchKind,
      _had_active_sub: hadActiveSub,
      _sub_cancelled: subPendingCancellation,
    });

    if (insertError) {
      logStep("Audit insert failed", { error: insertError.message });
      // Non-fatal — return success to avoid blocking the UX
    }

    logStep("Done", { fromType, toType, subCancelled, subAlreadyCancelling, stripeError });

    return new Response(
      JSON.stringify({
        success: true,
        sub_cancelled: subCancelled,
        sub_already_cancelling: subAlreadyCancelling,
        stripe_error: stripeError,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
