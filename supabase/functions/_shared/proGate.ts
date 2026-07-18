/**
 * proGate - server-side Pro subscription enforcement for edge functions.
 *
 * AI endpoints and OS enrichment endpoints must not rely only on UI guards.
 * This module validates paid access against active pricing_configs for the
 * caller's current profile audience.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { createLogger } from "./logger.ts";
import {
  getProfilePricingAudience,
  isAudienceAllowed,
  normalizeEntitlementAudience,
} from "./entitlements.ts";

const log = createLogger("proGate");

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

export type ProGateOptions = {
  audience?: string | string[];
};

type ProfileRow = {
  role: string;
  participant_type: string | null;
  role_switch_in_progress_at: string | null;
  force_pro_access: boolean | null;
};

type ResolvedSubscriptionState = {
  subscribed?: boolean;
  audience?: string | null;
  source?: string | null;
};

export function hasResolvedProAccess({
  profileAudience,
  requiredAudience,
  state,
}: {
  profileAudience: string | null;
  requiredAudience?: string | string[];
  state: ResolvedSubscriptionState | null;
}): boolean {
  if (
    !state?.subscribed ||
    !isAudienceAllowed(profileAudience, requiredAudience)
  ) {
    return false;
  }

  const resolvedAudience = normalizeEntitlementAudience(state.audience);
  if (resolvedAudience) return resolvedAudience === profileAudience;

  return state.source === "investor" &&
    (profileAudience === "investor" || profileAudience === "institutional");
}

const jsonError = (
  message: string,
  status: number,
  corsHeaders: Record<string, string>,
) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const unavailable = (corsHeaders: Record<string, string>) =>
  jsonError(
    "Subscription verification is temporarily unavailable.",
    503,
    corsHeaders,
  );

const proRequired = (corsHeaders: Record<string, string>) =>
  jsonError(
    "This feature requires a Pro subscription. Please upgrade your plan.",
    403,
    corsHeaders,
  );

async function getProfile(
  client: SupabaseClient,
  userId: string,
): Promise<{ profile: ProfileRow | null; error: { message: string } | null }> {
  // Use service role client to bypass RLS for subscription lookup.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from("profiles")
    .select(
      "role, participant_type, role_switch_in_progress_at, force_pro_access",
    )
    .eq("user_id", userId)
    .maybeSingle() as {
      data: ProfileRow | null;
      error: { message: string } | null;
    };
  return { profile: data, error };
}

async function resolveDurableSubscriptionState(
  client: SupabaseClient,
  userId: string,
): Promise<{
  state: ResolvedSubscriptionState | null;
  error: { message?: string; code?: string } | null;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any).rpc(
    "resolve_subscription_state_for_service",
    {
      p_user_id: userId,
      p_required_stripe_subscription_id: null,
    },
  ) as {
    data: ResolvedSubscriptionState | null;
    error: { message?: string; code?: string } | null;
  };
  return { state: data, error };
}

/**
 * Returns `{ allowed: true, errorResponse: null }` for a valid paid entitlement.
 * Returns 403 for known non-Pro callers and 503 when entitlement lookup cannot
 * be trusted. Authorization failures are fail-closed.
 */
export async function requireProSubscription(
  userId: string,
  corsHeaders: Record<string, string>,
  options: ProGateOptions = {},
): Promise<ProGateResult> {
  const client = getServiceClient();
  if (!client) {
    log.error("no SUPABASE_URL/SERVICE_ROLE_KEY - failing closed");
    return { allowed: false, errorResponse: unavailable(corsHeaders) };
  }

  try {
    const { profile, error } = await getProfile(client, userId);
    if (error) {
      log.error("profile lookup failed - failing closed", {
        error: error.message,
      });
      return { allowed: false, errorResponse: unavailable(corsHeaders) };
    }
    if (!profile) {
      return { allowed: false, errorResponse: proRequired(corsHeaders) };
    }

    if (profile.role === "admin") {
      return { allowed: true, errorResponse: null };
    }

    const profileAudience = getProfilePricingAudience(profile);
    const audienceAllowed = isAudienceAllowed(profileAudience, options.audience);

    if (profile.role_switch_in_progress_at) {
      return { allowed: false, errorResponse: proRequired(corsHeaders) };
    }

    if (profile.force_pro_access && audienceAllowed) {
      return { allowed: true, errorResponse: null };
    }

    const { state, error: resolverError } =
      await resolveDurableSubscriptionState(client, userId);
    if (resolverError) {
      log.error("durable subscription resolver failed - failing closed", {
        error: resolverError.message ?? resolverError.code ?? "unknown",
      });
      return { allowed: false, errorResponse: unavailable(corsHeaders) };
    }
    if (!state || typeof state.subscribed !== "boolean") {
      log.error("durable subscription resolver returned an invalid response");
      return { allowed: false, errorResponse: unavailable(corsHeaders) };
    }

    if (
      hasResolvedProAccess({
        profileAudience,
        requiredAudience: options.audience,
        state,
      })
    ) {
      return { allowed: true, errorResponse: null };
    }

    return { allowed: false, errorResponse: proRequired(corsHeaders) };
  } catch (err) {
    log.error("unexpected entitlement error - failing closed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { allowed: false, errorResponse: unavailable(corsHeaders) };
  }
}
