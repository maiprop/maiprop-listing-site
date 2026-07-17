import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { invokeAuthenticatedFunction } from "@/lib/invokeAuthenticatedFunction";

export const FREE_AI_MONTHLY_LIMIT = 5;
export const PRO_AI_MONTHLY_LIMIT = 50;
export const UNLIMITED_AI_LIMIT = 999_999;
type InFlightQuotaRequest = {
  promise: Promise<AIQuota | null>;
  forced: boolean;
};
const quotaRequestsInFlight = new Map<string, InFlightQuotaRequest>();

async function loadSharedQuotas(
  userId: string,
  buckets: readonly string[],
  force: boolean,
): Promise<Record<string, AIQuota | null>> {
  const uniqueBuckets = Array.from(new Set(buckets.filter(Boolean))).sort();
  const requests = new Map<string, Promise<AIQuota | null>>();
  const missing: string[] = [];

  for (const bucket of uniqueBuckets) {
    const key = `${userId}:${bucket}`;
    const current = quotaRequestsInFlight.get(key);
    if (current && (!force || current.forced)) {
      requests.set(bucket, current.promise);
    } else {
      missing.push(bucket);
    }
  }

  if (missing.length > 0) {
    const batch = fetchAiQuotas(missing);
    for (const bucket of missing) {
      const key = `${userId}:${bucket}`;
      const entry: InFlightQuotaRequest = {
        promise: Promise.resolve(null),
        forced: force,
      };
      entry.promise = batch
        .then((quotas) => quotas[bucket] ?? null)
        .finally(() => {
          if (quotaRequestsInFlight.get(key) === entry) {
            quotaRequestsInFlight.delete(key);
          }
        });
      quotaRequestsInFlight.set(key, entry);
      requests.set(bucket, entry.promise);
    }
  }

  const resolved = await Promise.all(
    uniqueBuckets.map(async (bucket) => [bucket, (await requests.get(bucket)) ?? null] as const),
  );
  return Object.fromEntries(resolved);
}

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
    timeout: 4_000,
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

  const { data, error } = await invokeAuthenticatedFunction("ai-quota-status", {
    body: { buckets: uniqueBuckets },
    timeout: 4_000,
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
}

export function useAiQuota(
  bucket: string,
  user: User | null | undefined,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled ?? true;
  const userId = user?.id ?? null;
  const [quota, setQuota] = useState<AIQuota | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [quotaChecked, setQuotaChecked] = useState(false);
  const requestGenerationRef = useRef(0);

  const loadQuota = useCallback(async (force: boolean) => {
    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;
    const isCurrentRequest = () => requestGenerationRef.current === requestGeneration;

    if (!enabled || !userId) {
      setQuota(null);
      setQuotaLoading(false);
      setQuotaChecked(false);
      return null;
    }
    setQuotaLoading(true);
    try {
      const result = (await loadSharedQuotas(userId, [bucket], force))[bucket] ?? null;
      if (isCurrentRequest()) setQuota(result);
      return result;
    } catch {
      if (isCurrentRequest()) setQuota(null);
      return null;
    } finally {
      if (isCurrentRequest()) {
        setQuotaLoading(false);
        setQuotaChecked(true);
      }
    }
  }, [bucket, enabled, userId]);

  useEffect(() => {
    setQuota(null);
    setQuotaChecked(false);
    void loadQuota(false);
    return () => {
      requestGenerationRef.current += 1;
    };
  }, [loadQuota]);

  const refreshQuota = useCallback(() => loadQuota(true), [loadQuota]);

  return {
    quota,
    quotaLoading,
    quotaChecked,
    refreshQuota,
  };
}

export function useAiQuotas(
  buckets: readonly string[],
  user: User | null | undefined,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled ?? true;
  const bucketKey = Array.from(new Set(buckets.filter(Boolean))).sort().join("|");
  const userId = user?.id ?? null;
  const [quotas, setQuotas] = useState<Record<string, AIQuota | null>>({});
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [quotaChecked, setQuotaChecked] = useState(false);
  const requestGenerationRef = useRef(0);

  const loadQuotas = useCallback(async (force: boolean) => {
    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;
    const isCurrentRequest = () => requestGenerationRef.current === requestGeneration;

    if (!enabled || !userId || !bucketKey) {
      setQuotas({});
      setQuotaLoading(false);
      setQuotaChecked(false);
      return {};
    }
    setQuotaLoading(true);
    try {
      const result = await loadSharedQuotas(userId, bucketKey.split("|"), force);
      if (isCurrentRequest()) setQuotas(result);
      return result;
    } catch {
      if (isCurrentRequest()) setQuotas({});
      return {};
    } finally {
      if (isCurrentRequest()) {
        setQuotaLoading(false);
        setQuotaChecked(true);
      }
    }
  }, [bucketKey, enabled, userId]);

  useEffect(() => {
    setQuotas({});
    setQuotaChecked(false);
    void loadQuotas(false);
    return () => {
      requestGenerationRef.current += 1;
    };
  }, [loadQuotas]);

  const refreshQuotas = useCallback(() => loadQuotas(true), [loadQuotas]);

  return {
    quotas,
    quotaLoading,
    quotaChecked,
    refreshQuotas,
  };
}
