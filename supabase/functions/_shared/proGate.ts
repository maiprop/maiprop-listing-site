/**
 * proGate — server-side Pro subscription enforcement for edge functions.
 *
 * AI endpoints (property-valuation, neighbourhood-report, fetch-past-deals-from-os)
 * are documented as Pro-only, but previously only had UI guards. This module
 * provides a server-side check that validates against actual subscription data.
 *
 * Usage:
 *   import { requireProSubscription } from "../_shared/proGate.ts";
 *
 *   const proCheck = await requireProSubscription(userId, corsHeaders);
 *   if (proCheck.errorResponse) return proCheck.errorResponse;
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";

type SupabaseClient = ReturnType<typeof createClient>;

let _client: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient | null {
  if (_client) return _client;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

export interface ProGateResult {
  allowed: boolean;
  errorResponse: Response | null;
}

/**
 * Checks whether the given user has an active Pro subscription by joining
 * profiles.subscription_product_id against the pro_product_ids table,
 * or by checking force_pro_access / admin role.
 *
 * Returns `{ allowed: true, errorResponse: null }` if the user is Pro.
 * Returns a 403 Response if not.
 *
 * Fails OPEN if Supabase is unreachable (service degradation is
 * preferable to a hard outage for paying users).
 */
export async function requireProSubscription(
  userId: string,
  corsHeaders: Record<string, string>,
): Promise<ProGateResult> {
  const client = getServiceClient();
  if (!client) {
    console.warn("[proGate] no SUPABASE_URL/SERVICE_ROLE_KEY — failing open");
    return { allowed: true, errorResponse: null };
  }

  try {
    // Use service role client to bypass RLS for subscription lookup.
    // Tables may not be in the generated types, so use narrow casts.
    interface ProfileRow {
      role: string;
      subscription_product_id: string | null;
      force_pro_access: boolean | null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile, error } = await (client as any)
      .from("profiles")
      .select("role, subscription_product_id, force_pro_access")
      .eq("user_id", userId)
      .single() as { data: ProfileRow | null; error: { message: string } | null };

    if (error || !profile) {
      console.warn(`[proGate] profile lookup failed: ${error?.message ?? "not found"} — failing open`);
      return { allowed: true, errorResponse: null };
    }

    // Admins always pass
    if (profile.role === "admin") {
      return { allowed: true, errorResponse: null };
    }

    // force_pro_access override
    if (profile.force_pro_access) {
      return { allowed: true, errorResponse: null };
    }

    // Validate subscription_product_id against pro_product_ids
    if (profile.subscription_product_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: proProduct } = await (client as any)
        .from("pro_product_ids")
        .select("product_id")
        .eq("product_id", profile.subscription_product_id)
        .single() as { data: { product_id: string } | null; error: unknown };

      if (proProduct) {
        return { allowed: true, errorResponse: null };
      }
    }

    // Also check investor_subscriptions for active subscription
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: activeSub } = await (client as any)
      .from("investor_subscriptions")
      .select("id")
      .eq("user_id", userId)
      .in("status", ["active", "trialing"])
      .limit(1)
      .maybeSingle() as { data: { id: string } | null; error: unknown };

    if (activeSub) {
      return { allowed: true, errorResponse: null };
    }

    // Not Pro — block access
    return {
      allowed: false,
      errorResponse: new Response(
        JSON.stringify({
          error: "This feature requires a Pro subscription. Please upgrade your plan.",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      ),
    };
  } catch (err) {
    console.warn(`[proGate] unexpected error — failing open: ${err instanceof Error ? err.message : String(err)}`);
    return { allowed: true, errorResponse: null };
  }
}
