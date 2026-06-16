import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { invokeAuthenticatedFunction } from "@/lib/invokeAuthenticatedFunction";

export const FREE_AI_MONTHLY_LIMIT = 5;
export const PRO_AI_MONTHLY_LIMIT = 50;
export const UNLIMITED_AI_LIMIT = 999_999;

export interface AIQuota {
  allowed: boolean;
  reason: string | null;
  used: number;
  limit: number;
  remaining: number;
}

export function aiQuotaFromJson(value: unknown): AIQuota | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const used = typeof row.used === "number" ? row.used : Number(row.used ?? 0);
  const limit = typeof row.limit === "number" ? row.limit : Number(row.limit ?? 0);
  const allowed = Boolean(row.allowed);
  const reason = typeof row.reason === "string" ? row.reason : null;

  if (!Number.isFinite(used) || !Number.isFinite(limit)) return null;

  return {
    allowed,
    reason,
    used,
    limit,
    remaining:
      limit >= UNLIMITED_AI_LIMIT
        ? UNLIMITED_AI_LIMIT
        : Math.max(limit - used, 0),
  };
}

export function isAiQuotaReached(quota: AIQuota | null | undefined): boolean {
  return Boolean(
    quota &&
      quota.limit < UNLIMITED_AI_LIMIT &&
      quota.used >= quota.limit,
  );
}

export function getAiQuotaTierLabel(quota: AIQuota | null | undefined): string {
  if (!quota) return "AI";
  if (quota.limit >= UNLIMITED_AI_LIMIT) return "Unlimited";
  return quota.limit > FREE_AI_MONTHLY_LIMIT ? "Pro" : "Free";
}

export async function fetchAiQuota(bucket: string): Promise<AIQuota | null> {
  const { data, error } = await invokeAuthenticatedFunction("ai-quota-status", {
    body: { bucket },
  });
  if (error) throw error;
  return aiQuotaFromJson(data);
}

export async function fetchAiQuotas(
  buckets: readonly string[],
): Promise<Record<string, AIQuota | null>> {
  const uniqueBuckets = Array.from(new Set(buckets.filter(Boolean)));
  if (uniqueBuckets.length === 0) return {};
  if (uniqueBuckets.length === 1) {
    const quota = await fetchAiQuota(uniqueBuckets[0]);
    return { [uniqueBuckets[0]]: quota };
  }

  try {
    const { data, error } = await invokeAuthenticatedFunction("ai-quota-status", {
      body: { buckets: uniqueBuckets },
    });
    if (error) throw error;

    const quotas = data && typeof data === "object"
      ? (data as { quotas?: unknown }).quotas
      : null;
    if (!quotas || typeof quotas !== "object") {
      return Object.fromEntries(uniqueBuckets.map((bucket) => [bucket, null]));
    }

    const quotaByBucket = quotas as Record<string, unknown>;
    return Object.fromEntries(
      uniqueBuckets.map((bucket) => [bucket, aiQuotaFromJson(quotaByBucket[bucket])]),
    );
  } catch (_err: unknown) {
    const entries = await Promise.all(
      uniqueBuckets.map(async (bucket) => [bucket, await fetchAiQuota(bucket)] as const),
    );
    return Object.fromEntries(entries);
  }
}

export function useAiQuota(
  bucket: string,
  user: User | null | undefined,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled ?? true;
  const [quota, setQuota] = useState<AIQuota | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [quotaChecked, setQuotaChecked] = useState(false);
  const userId = user?.id ?? null;

  useEffect(() => {
    setQuota(null);
    setQuotaChecked(false);
  }, [bucket, enabled, userId]);

  const refreshQuota = useCallback(async () => {
    if (!enabled || !userId) {
      setQuota(null);
      setQuotaChecked(false);
      return null;
    }

    setQuotaLoading(true);
    try {
      const parsed = await fetchAiQuota(bucket);
      setQuota(parsed);
      return parsed;
    } catch (_err: unknown) {
      setQuota(null);
      return null;
    } finally {
      setQuotaLoading(false);
      setQuotaChecked(true);
    }
  }, [bucket, enabled, userId]);

  useEffect(() => {
    void refreshQuota();
  }, [refreshQuota]);

  return { quota, quotaLoading, quotaChecked, refreshQuota };
}

export function useAiQuotas(
  buckets: readonly string[],
  user: User | null | undefined,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled ?? true;
  const bucketKey = Array.from(new Set(buckets.filter(Boolean))).join("|");
  const [quotas, setQuotas] = useState<Record<string, AIQuota | null>>({});
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [quotaChecked, setQuotaChecked] = useState(false);
  const userId = user?.id ?? null;

  useEffect(() => {
    setQuotas({});
    setQuotaChecked(false);
  }, [bucketKey, enabled, userId]);

  const refreshQuotas = useCallback(async () => {
    if (!enabled || !userId || !bucketKey) {
      setQuotas({});
      setQuotaChecked(false);
      return {};
    }

    setQuotaLoading(true);
    try {
      const parsed = await fetchAiQuotas(bucketKey.split("|"));
      setQuotas(parsed);
      return parsed;
    } catch (_err: unknown) {
      setQuotas({});
      return {};
    } finally {
      setQuotaLoading(false);
      setQuotaChecked(true);
    }
  }, [bucketKey, enabled, userId]);

  useEffect(() => {
    void refreshQuotas();
  }, [refreshQuotas]);

  return { quotas, quotaLoading, quotaChecked, refreshQuotas };
}
