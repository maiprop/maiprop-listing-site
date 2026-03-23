import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type InterestStatus = "interested" | "shortlisted" | "engaged" | "passed";

export type FiresaleInterestEntry = {
  id: string;
  deal_id: string;
  investor_id: string;
  proof_of_funds_url: string | null;
  proof_amount: number | null;
  message: string | null;
  status: InterestStatus;
  created_at: string;
  // joined from profiles when fetched by admin
  profiles?: {
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
  } | null;
};

/** Current investor's own interest entry for a deal (undefined = not interested yet) */
export function useMyFiresaleInterest(dealId: string | undefined) {
  return useQuery({
    queryKey: ["firesale_interest_mine", dealId],
    queryFn: async () => {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid || !dealId) return null;
      const { data } = await supabase
        .from("firesale_interest" as any)
        .select("*")
        .eq("deal_id", dealId)
        .eq("investor_id", uid)
        .maybeSingle();
      return data as FiresaleInterestEntry | null;
    },
    enabled: !!dealId,
  });
}

/** All deal IDs the current investor has expressed interest in */
export function useMyFiresaleInterests() {
  return useQuery({
    queryKey: ["firesale_interest_mine_all"],
    queryFn: async () => {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) return new Set<string>();
      const { data } = await supabase
        .from("firesale_interest" as any)
        .select("deal_id, status, proof_of_funds_url")
        .eq("investor_id", uid);
      return new Map(
        ((data ?? []) as FiresaleInterestEntry[]).map((r) => [r.deal_id, r])
      );
    },
  });
}

/** Admin: full queue for a deal, sorted by priority (POF first, then date) */
export function useFiresaleInterestQueue(dealId: string | undefined) {
  return useQuery({
    queryKey: ["firesale_interest_queue", dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const { data, error } = await supabase
        .from("firesale_interest" as any)
        .select(`*, profiles:investor_id (first_name, last_name, display_name, investor_mode)`)
        .eq("deal_id", dealId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      // Sort: POF uploaded first (priority tier 1), no POF second (tier 2)
      return ((data ?? []) as FiresaleInterestEntry[]).sort((a, b) => {
        const tierA = a.proof_of_funds_url ? 1 : 2;
        const tierB = b.proof_of_funds_url ? 1 : 2;
        return tierA !== tierB ? tierA - tierB : new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
    },
    enabled: !!dealId,
  });
}

/** Investor: express interest (creates or updates their entry) */
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
        const path = `firesale/${uid}/${dealId}/proof_${Date.now()}.${ext}`;
        const { data: uploaded, error: upErr } = await supabase.storage
          .from("open-house-docs")
          .upload(path, proofFile, { upsert: true });
        if (upErr) throw upErr;
        proof_of_funds_url = uploaded.path;
      }

      const { data, error } = await supabase
        .from("firesale_interest" as any)
        .upsert(
          {
            deal_id: dealId,
            investor_id: uid,
            status: "interested",
            message: message || null,
            proof_amount: proofAmount ? parseFloat(proofAmount) : null,
            ...(proof_of_funds_url ? { proof_of_funds_url } : {}),
          },
          { onConflict: "deal_id,investor_id" }
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["firesale_interest_mine", v.dealId] });
      qc.invalidateQueries({ queryKey: ["firesale_interest_mine_all"] });
      qc.invalidateQueries({ queryKey: ["firesale_interest_queue", v.dealId] });
      toast.success("Interest registered — admin will be in touch");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Admin: update investor's status in the queue */
export function useUpdateInterestStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dealId, status }: { id: string; dealId: string; status: InterestStatus }) => {
      const { error } = await supabase
        .from("firesale_interest" as any)
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["firesale_interest_queue", v.dealId] });
      toast.success("Status updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
