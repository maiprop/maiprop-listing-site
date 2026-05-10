import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Quick-Sale invitation request status for the current user.
 *
 * Returns one of `"none" | "pending" | "approved" | "rejected"`. The
 * `invitation_requests.status` column is typed as a plain `string` in the
 * generated DB types, so we explicitly validate against the allowed set
 * before narrowing — any unexpected DB value (e.g. `"cancelled"`) is mapped
 * to `"none"` so downstream conditional rendering keeps working.
 *
 * Used by the Quick Sale™ Access card on `/dashboard` and the invitation
 * status banner on `/firesale`.
 */
export type InvitationStatus = "none" | "pending" | "approved" | "rejected";

export function useInvitationRequestStatus(opts?: { enabled?: boolean }) {
  const { user } = useAuth();
  return useQuery<InvitationStatus>({
    queryKey: ["invitation-request-status", user?.id],
    queryFn: async () => {
      if (!user) return "none";
      const { data } = await supabase
        .from("invitation_requests")
        .select("status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const row = data as { status?: string } | null;
      if (row?.status === "pending") return "pending";
      if (row?.status === "approved") return "approved";
      if (row?.status === "rejected") return "rejected";
      return "none";
    },
    enabled: !!user && (opts?.enabled ?? true),
  });
}
