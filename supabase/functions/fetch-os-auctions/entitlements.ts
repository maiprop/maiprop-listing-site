import { AUTH_CAP, FREE_CAP } from "./constants.ts";
import type { PricingConfigPlanRow, ProfilePlanRow } from "./types.ts";

type SupabaseAdminClient = {
  auth?: {
    getUser: (
      token: string,
    ) => Promise<{
      data: { user?: { id: string } | null };
      error?: unknown;
    }>;
  };
  rpc?: unknown;
  from: (table: string) => unknown;
};

type QueryBuilder = {
  select: (columns: string) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  in: (column: string, values: unknown[]) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
  single: () => Promise<{ data: unknown; error?: unknown }>;
  maybeSingle: () => Promise<{ data: unknown; error?: unknown }>;
};

function fromTable(sb: SupabaseAdminClient, table: string): QueryBuilder {
  return sb.from(table) as QueryBuilder;
}

function isInvestorProfile(profile: ProfilePlanRow | null): boolean {
  return profile?.participant_type === "investor" ||
    profile?.participant_type === "institutional" ||
    profile?.role === "investor" ||
    profile?.role === "institutional";
}

async function hasInvestorSubscription(
  sb: SupabaseAdminClient,
  userId: string,
): Promise<boolean> {
  const { data } = await fromTable(sb, "investor_subscriptions")
    .select("status")
    .eq("user_id", userId)
    .in("status", ["active", "trial"])
    .limit(1)
    .maybeSingle();
  const sub = data as { status?: string } | null;
  return sub?.status === "active" || sub?.status === "trial";
}

function isOsAuctionEntitlement(row: PricingConfigPlanRow | null): boolean {
  if (!row?.key || !row?.audience) return false;
  return row.audience === "investor" || row.audience === "institutional" ||
    row.key === "investor_private" || row.key === "investor_institutional";
}

async function hasInvestorProductEntitlement(
  sb: SupabaseAdminClient,
  productId: string | null | undefined,
): Promise<boolean> {
  if (!productId) return false;
  const { data } = await fromTable(sb, "pricing_configs")
    .select("key, audience, metadata")
    .eq("metadata->>stripe_product_id", productId)
    .limit(1)
    .maybeSingle();
  return isOsAuctionEntitlement(data as PricingConfigPlanRow | null);
}

async function hasCanonicalProAccess(
  sb: SupabaseAdminClient,
  userId: string,
): Promise<boolean | null> {
  type RpcFn = (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
  if (typeof sb.rpc !== "function") return null;
  const rpc = sb.rpc as RpcFn;
  const { data, error } = await rpc.call(sb, "is_pro", { p_user_id: userId });
  if (error || typeof data !== "boolean") return null;
  return data;
}

export async function hasPortalProAccess(
  sb: SupabaseAdminClient,
  userId: string,
): Promise<boolean> {
  const canonicalProAccess = await hasCanonicalProAccess(sb, userId);
  if (canonicalProAccess != null) return canonicalProAccess;

  const { data: profileRow } = await fromTable(sb, "profiles")
    .select("role, participant_type, subscription_product_id, force_pro_access")
    .eq("user_id", userId)
    .single();
  const profile = profileRow as ProfilePlanRow | null;

  if (profile?.role === "admin") return true;
  if (profile?.force_pro_access) return true;
  if (isInvestorProfile(profile)) {
    return await hasInvestorSubscription(sb, userId) ||
      await hasInvestorProductEntitlement(sb, profile?.subscription_product_id);
  }
  return false;
}

/** Determine portal cap from the request's JWT. Returns FREE_CAP if unauthenticated/free. */
export async function getPlanCap(
  req: Request,
  sb: SupabaseAdminClient,
): Promise<number> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ") || !sb.auth?.getUser) return FREE_CAP;

  const { data: { user }, error } = await sb.auth.getUser(authHeader.slice(7));
  if (error || !user) return FREE_CAP;

  return await hasPortalProAccess(sb, user.id) ? AUTH_CAP : FREE_CAP;
}
