/**
 * log-role-switch — authenticated edge function
 *
 * Called by the frontend when a user confirms a role switch via the RoleSwitchModal.
 *
 * Responsibilities:
 *   1. Authenticate the caller (Bearer token → Supabase user)
 *   2. If cancel_subscription=true, cancel active Stripe subscription at period end
 *   3. Insert an audit row into role_switch_history (via service role — bypasses RLS)
 *
 * The service role key is required to write to role_switch_history because the table's
 * INSERT policy is `WITH CHECK (false)` (no direct client writes allowed).
 */

import Stripe from "https://esm.sh/stripe@18.5.0";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const logStep = (step: string, details?: unknown) => {
  const suffix = details ? ` — ${JSON.stringify(details)}` : "";
  console.log(`[LOG-ROLE-SWITCH] ${step}${suffix}`);
};

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Unauthenticated");

    const user = userData.user;
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
    let subCancelled = false;
    if (cancelSubscription) {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (stripeKey && user.email) {
        try {
          const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
          const customers = await stripe.customers.list({ email: user.email, limit: 1 });
          if (customers.data.length > 0) {
            const subs = await stripe.subscriptions.list({
              customer: customers.data[0].id,
              status: "active",
              limit: 1,
            });
            if (subs.data.length > 0) {
              await stripe.subscriptions.update(subs.data[0].id, { cancel_at_period_end: true });
              subCancelled = true;
              logStep("Subscription set to cancel at period end", { subId: subs.data[0].id });
            }
          }
        } catch (stripeErr: unknown) {
          // Non-fatal — log but don't block the audit record
          logStep("Stripe cancellation failed (non-fatal)", {
            error: stripeErr instanceof Error ? stripeErr.message : String(stripeErr),
          });
        }
      }
    }

    // ── Audit log insert (service role bypasses RLS) ──────────────────────────
    const { error: insertError } = await supabase.from("role_switch_history").insert({
      user_id: user.id,
      from_type: fromType,
      to_type: toType || null,
      switch_kind: switchKind,
      had_active_sub: hadActiveSub,
      sub_cancelled: subCancelled,
    });

    if (insertError) {
      logStep("Audit insert failed", { error: insertError.message });
      // Non-fatal — return success to avoid blocking the UX
    }

    logStep("Done", { fromType, toType, subCancelled });

    return new Response(
      JSON.stringify({ success: true, sub_cancelled: subCancelled }),
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
