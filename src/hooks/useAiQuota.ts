import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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
      const { data, error } = await supabase.rpc("check_ai_quota", {
        p_bucket: bucket,
      });
      if (error) throw error;
      const parsed = aiQuotaFromJson(data);
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
