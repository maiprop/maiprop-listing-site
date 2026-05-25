/**
 * Admin-only React Query hooks for the professional verification queue.
 *
 * Lifted out of `AdminProfessionalVerification.tsx` so the data layer
 * (queries + mutations) is reusable, mock-able in tests, and not entangled
 * with the verification UI's component state. The hooks here intentionally
 * only do the database write — toasts, modal state, and admin-name display
 * stay in the component.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ProCard } from "@/components/admin/ProVerificationComponents";
import type { Database } from "@/integrations/supabase/types";

const KEY = ["admin-professionals"] as const;
type ProfessionalUpdate = Database["public"]["Tables"]["professionals"]["Update"];

// Narrow shape of the row this admin queue actually needs. Keeping a local
// type instead of importing the full Tables<"professionals"> means the
// admin view stays decoupled from the broader professional schema.
type ProAdminRow = {
  id: string;
  display_name: string | null;
  category: string | null;
  title: string | null;
  avatar_url: string | null;
  created_at: string | null;
  license_number: string | null;
  specialties: string[] | null;
  verified: boolean | null;
  rejection_reason: string | null;
  verified_at: string | null;
};

export function useProfessionalsAdmin() {
  return useQuery<ProCard[]>({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select(
          "id, display_name, category, title, avatar_url, created_at, license_number, specialties, verified, rejection_reason, verified_at",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const rows = (data ?? []) as unknown as ProAdminRow[];
      return rows.map(
        (raw): ProCard => ({
          id: raw.id,
          display_name: raw.display_name ?? "Unknown",
          category: raw.category ?? "",
          title: raw.title ?? "",
          avatar_url: raw.avatar_url ?? null,
          created_at: raw.created_at ?? "",
          license_number: raw.license_number ?? null,
          specialties: raw.specialties ?? [],
          status: raw.rejection_reason
            ? "rejected"
            : raw.verified
              ? "verified"
              : "pending",
          verified_at: raw.verified_at ?? undefined,
          rejection_reason: raw.rejection_reason ?? undefined,
        }),
      );
    },
  });
}

/**
 * Mark a professional as verified, optionally setting their license number.
 *
 * Also clears `rejection_reason`. `useProfessionalsAdmin` derives status as
 * `rejection_reason ? 'rejected' : verified ? 'verified' : 'pending'`, so a
 * lingering `rejection_reason` from a prior rejection would otherwise pin a
 * re-approved professional in the rejected bucket even with `verified=true`.
 */
export function useApproveProfessional() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, licenseNumber }: { id: string; licenseNumber: string }) => {
      const { error } = await supabase
        .from("professionals")
        .update({
          verified: true,
          license_number: licenseNumber || null,
          rejection_reason: null,
          verified_at: new Date().toISOString(),
        } satisfies ProfessionalUpdate)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/**
 * Save admin notes against a professional record without changing their
 * verification status. Used by the "Request more info" path.
 *
 * The generated schema includes the admin-only `notes` column, so the
 * payload remains checked against the Supabase update type.
 */
export function useUpdateProfessionalNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase
        .from("professionals")
        .update({ notes: notes || null } satisfies ProfessionalUpdate)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/**
 * Reject a professional and capture the reason on the row.
 *
 * `useProfessionalsAdmin` derives status as
 * `rejection_reason ? 'rejected' : verified ? 'verified' : 'pending'`,
 * so `rejection_reason` MUST be non-null for the row to appear in the
 * rejected bucket. The UI already requires a non-empty note before the
 * Reject button is enabled, but we belt-and-brace here: trim the note
 * and fall back to a sentinel string if it's blank, so a rejected
 * professional can never silently drop back into the pending queue.
 */
export function useRejectProfessional() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const trimmed = notes.trim();
      const reason = trimmed.length > 0 ? trimmed : "Rejected by admin";
      const { error } = await supabase
        .from("professionals")
        .update({
          verified: false,
          rejection_reason: reason,
          verified_at: null,
        } satisfies ProfessionalUpdate)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
