import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type InterestStatus =
  | "interested"
  | "prioritized"
  | "reserved"
  | "engaged"
  | "won"
  | "passed"
  | "expired";

export type FiresaleInterestEntry = {
  id: string;
  deal_id: string;
  investor_id: string;
  proof_of_funds_url: string | null;
  proof_amount: number | null;
  proof_of_funds_verified_at: string | null;
  proof_of_funds_verified_by: string | null;
  message: string | null;
  status: InterestStatus;
  reservation_expires_at: string | null;
  reserved_at: string | null;
  reserved_by: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  last_status_changed_at: string;
  profiles?: {
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
    investor_mode?: boolean | null;
  } | null;
};

const INTEREST_SELECT =
  "id, deal_id, investor_id, proof_of_funds_url, proof_amount, proof_of_funds_verified_at, proof_of_funds_verified_by, message, status, reservation_expires_at, reserved_at, reserved_by, admin_note, created_at, updated_at, last_status_changed_at";

const ACTIVE_HOLD_STATUSES: InterestStatus[] = ["reserved", "engaged", "won"];

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function hasPriorityProof(
  entry: Pick<FiresaleInterestEntry, "proof_of_funds_url" | "proof_amount" | "proof_of_funds_verified_at">,
) {
  return !!(entry.proof_of_funds_verified_at || entry.proof_of_funds_url || entry.proof_amount);
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function isActiveReservation(
  entry: Pick<FiresaleInterestEntry, "status" | "reservation_expires_at">,
  now = Date.now(),
) {
  if (!ACTIVE_HOLD_STATUSES.includes(entry.status)) return false;
  if (entry.status !== "reserved") return true;
  if (!entry.reservation_expires_at) return false;
  return new Date(entry.reservation_expires_at).getTime() > now;
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function getQueueRank(entry: FiresaleInterestEntry, now = Date.now()) {
  if (isActiveReservation(entry, now)) return 0;
  if (entry.status === "prioritized") return 1;
  if (entry.status === "interested" && entry.proof_of_funds_verified_at) return 2;
  if (entry.status === "interested" && hasPriorityProof(entry)) return 3;
  if (entry.status === "interested") return 4;
  if (entry.status === "expired") return 5;
  if (entry.status === "passed") return 6;
  return 7;
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function sortFiresaleInterestQueue(entries: FiresaleInterestEntry[], now = Date.now()) {
  return [...entries].sort((a, b) => {
    const rankDiff = getQueueRank(a, now) - getQueueRank(b, now);
    if (rankDiff !== 0) return rankDiff;

    const amountDiff = Number(b.proof_amount || 0) - Number(a.proof_amount || 0);
    if (amountDiff !== 0) return amountDiff;

    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
async function releaseExpiredReservations(dealId?: string) {
  const { error } = await supabase.rpc("release_expired_firesale_reservations", {
    p_deal_id: dealId,
  });
  if (error) throw error;
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function useMyFiresaleInterests() {
  return useQuery({
    queryKey: ["firesale_interest_mine_all"],
    queryFn: async () => {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) return new Map<string, FiresaleInterestEntry>();

      await releaseExpiredReservations();

      const { data } = await supabase
        .from("firesale_interest")
        .select(INTEREST_SELECT)
        .eq("investor_id", uid);

      return new Map(((data ?? []) as FiresaleInterestEntry[]).map((row) => [row.deal_id, row]));
    },
  });
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function useFiresaleInterestQueue(dealId: string | undefined) {
  return useQuery({
    queryKey: ["firesale_interest_queue", dealId],
    queryFn: async () => {
      if (!dealId) return [];

      await releaseExpiredReservations(dealId);

      const { data, error } = await supabase
        .from("firesale_interest")
        .select(`${INTEREST_SELECT}, profiles!firesale_interest_investor_id_fkey (first_name, last_name, display_name, investor_mode)`)
        .eq("deal_id", dealId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return sortFiresaleInterestQueue((data ?? []) as FiresaleInterestEntry[]);
    },
    enabled: !!dealId,
  });
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function useExpressInterest() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      dealId,
      proofFile,
      proofAmount,
      message,
    }: {
      dealId: string;
      proofFile?: File | null;
      proofAmount?: string;
      message?: string;
    }) => {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) throw new Error("Not authenticated");

      let proof_of_funds_url: string | undefined;

      if (proofFile) {
        const ext = proofFile.name.split(".").pop() ?? "pdf";
        const path = `${uid}/firesale/${dealId}/proof_${crypto.randomUUID()}.${ext}`;
        const { data: uploaded, error: uploadError } = await supabase.storage
          .from("open-house-docs")
          .upload(path, proofFile, { upsert: true });
        if (uploadError) throw uploadError;
        proof_of_funds_url = uploaded.path;
      }

      const status: InterestStatus = proof_of_funds_url || proofAmount ? "prioritized" : "interested";

      const { data, error } = await supabase
        .from("firesale_interest")
        .upsert(
          {
            deal_id: dealId,
            investor_id: uid,
            status,
            message: message || null,
            proof_amount: proofAmount ? parseFloat(proofAmount) : null,
            ...(proof_of_funds_url ? { proof_of_funds_url } : {}),
          },
          { onConflict: "deal_id,investor_id" },
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["firesale_interest_mine", variables.dealId] });
      qc.invalidateQueries({ queryKey: ["firesale_interest_mine_all"] });
      qc.invalidateQueries({ queryKey: ["firesale_interest_queue", variables.dealId] });
      toast.success("Interest registered. Proof-backed submissions move into the priority queue first.");
    },
    onError: () => toast.error("Failed to register interest. Please try again."),
  });
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function useUpdateInterestStatus() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      dealId: _dealId,
      status,
      reservationHours,
      verifyProof,
      adminNote,
      proofAmount,
    }: {
      id: string;
      dealId: string;
      status: InterestStatus;
      reservationHours?: number;
      verifyProof?: boolean;
      adminNote?: string | null;
      proofAmount?: number | null;
    }) => {
      const { error } = await supabase.rpc("admin_update_firesale_interest_workflow", {
        p_interest_id: id,
        p_status: status,
        p_reservation_hours: reservationHours,
        p_verify_pof: verifyProof ?? false,
        p_admin_note: adminNote ?? undefined,
        p_proof_amount: proofAmount ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["firesale_interest_queue", variables.dealId] });
      qc.invalidateQueries({ queryKey: ["firesale_interest_mine", variables.dealId] });
      qc.invalidateQueries({ queryKey: ["firesale_interest_mine_all"] });
      toast.success("Status updated");
    },
    onError: () => toast.error("Failed to update interest status. Please try again."),
  });
}
