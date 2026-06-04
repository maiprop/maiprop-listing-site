import { useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import type { Json } from "@/integrations/supabase/types";

export type SearchSurface = "listings" | "auctions" | "ai_search" | "property_chat" | "saved_search" | "other";

type TrackUserSearchInput = {
  surface: SearchSurface;
  query: string;
  route?: string;
  resultCount?: number | null;
  filters?: Record<string, Json | undefined>;
  metadata?: Record<string, Json | undefined>;
};

type TrackUserSearchRpc = (
  name: "track_user_search",
  args: {
    p_surface: SearchSurface;
    p_query: string;
    p_route: string | null;
    p_result_count: number | null;
    p_filters: Record<string, Json | undefined>;
    p_metadata: Record<string, Json | undefined>;
  },
) => Promise<{ data: unknown; error: { message?: string } | null }>;

type TrackUserSearchSupabaseClient = {
  rpc: TrackUserSearchRpc;
};

function compactJsonRecord(record?: Record<string, Json | undefined>): Record<string, Json | undefined> {
  if (!record) return {};
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  ) as Record<string, Json | undefined>;
}

export function useTrackUserSearch() {
  const { user } = useAuth();
  const lastEventRef = useRef<{ key: string; at: number } | null>(null);

  return useCallback(async (event: TrackUserSearchInput) => {
    if (!user) return;
    const query = event.query.trim().replace(/\s+/g, " ");
    if (query.length < 2) return;

    const filters = compactJsonRecord(event.filters);
    const metadata = compactJsonRecord(event.metadata);
    const key = JSON.stringify({
      surface: event.surface,
      query: query.toLowerCase(),
      route: event.route ?? "",
      filters,
      metadata,
    });
    const now = Date.now();
    if (lastEventRef.current?.key === key && now - lastEventRef.current.at < 60_000) return;
    lastEventRef.current = { key, at: now };

    const typedSupabase = supabase as unknown as TrackUserSearchSupabaseClient;
    const { error } = await typedSupabase.rpc("track_user_search", {
      p_surface: event.surface,
      p_query: query,
      p_route: event.route ?? null,
      p_result_count: event.resultCount ?? null,
      p_filters: filters,
      p_metadata: metadata,
    });

    if (error) logger.warn("[search telemetry] track_user_search failed", error.message ?? error);
  }, [user]);
}
