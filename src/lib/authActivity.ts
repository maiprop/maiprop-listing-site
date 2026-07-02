import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import type { Json } from "@/integrations/supabase/types";

export type AuthActivityEventType =
  | "sign_in"
  | "sign_out"
  | "session_restored"
  | "session_refreshed"
  | "token_refreshed"
  | "user_updated"
  | "password_recovery";

type RecordUserAuthActivityRpc = (
  name: "record_user_auth_activity",
  args: {
    p_event_type: AuthActivityEventType;
    p_route: string | null;
    p_metadata: Record<string, Json | undefined>;
  },
) => Promise<{ data: string | null; error: { message?: string } | null }>;

type AuthActivitySupabaseClient = {
  rpc: RecordUserAuthActivityRpc;
};

export function shouldLogAuthActivityWarning(error: unknown): boolean {
  if (!import.meta.env.DEV) return true;
  if (error instanceof DOMException && error.name === "AbortError") return false;
  if (error instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(error.message)) {
    return false;
  }
  if (typeof error === "string" && /failed to fetch|networkerror|load failed/i.test(error)) {
    return false;
  }
  return true;
}

function currentRoute() {
  if (typeof window === "undefined") return null;
  return `${window.location.pathname}${window.location.search}`;
}

export async function recordUserAuthActivity({
  eventType,
  route = currentRoute(),
  metadata = {},
}: {
  eventType: AuthActivityEventType;
  route?: string | null;
  metadata?: Record<string, Json | undefined>;
}) {
  const typedSupabase = supabase as unknown as AuthActivitySupabaseClient;
  const { data, error } = await typedSupabase.rpc("record_user_auth_activity", {
    p_event_type: eventType,
    p_route: route,
    p_metadata: metadata,
  });

  if (error) {
    const message = error.message ?? error;
    if (shouldLogAuthActivityWarning(message)) {
      logger.warn("[auth activity] record_user_auth_activity failed", message);
    }
    return null;
  }

  return data;
}
