/**
 * Agent "Data Input" feature hooks.
 *
 * Wraps the `agent-data-input` edge function (status / submit / list /
 * admin_review). Server-side rules:
 *   - 0.5% discount per verified entry on the agent's next subscription invoice
 *   - capped at 20 submissions per calendar month (= max 10% off next invoice)
 *   - hallucinated submissions trigger a lifetime ban (enforced in DB)
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type DataInputStatusEntry = {
  id: string;
  property_address: string;
  city: string | null;
  postal_code: string | null;
  property_type: string;
  transaction_type: string;
  agent_side: string;
  sale_price: number;
  closing_date: string;
  status: "pending" | "verified" | "rejected" | "flagged";
  rejection_reason: string | null;
  discount_pct: number;
  discount_applied: boolean;
  discount_applied_at: string | null;
  discount_invoice_id: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export type AgentDataInputStatus = {
  monthly_count: number;
  monthly_limit: number;
  discount_pct_per_input: number;
  pending_discount_pct: number;
  pending_discount_count: number;
  total_pending: number;
  total_verified: number;
  total_rejected: number;
  lifetime_banned: boolean;
  ban_reason: string | null;
  banned_at: string | null;
  entries: DataInputStatusEntry[];
};

export type SubmitDataInputPayload = {
  property_address: string;
  city?: string | null;
  postal_code?: string | null;
  kaek?: string | null;
  property_type: "apartment" | "house" | "commercial" | "land" | "other";
  transaction_type: "sale" | "rental";
  agent_side: "buyer" | "seller" | "both";
  sale_price: number;
  closing_date: string; // YYYY-MM-DD
  buyer_name?: string | null;
  seller_name?: string | null;
  notes?: string | null;
};

const QUERY_KEY = ["agent-data-input"] as const;

export function useAgentDataInputStatus() {
  const { user } = useAuth();
  return useQuery<AgentDataInputStatus>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("agent-data-input", {
        body: { action: "status" },
      });
      if (error) throw error;
      return data as AgentDataInputStatus;
    },
    enabled: !!user,
    staleTime: 30_000,
  });
}

export function useSubmitDataInput(): ReturnType<typeof useMutation<DataInputStatusEntry, Error, SubmitDataInputPayload>> {
  const qc = useQueryClient();
  return useMutation<DataInputStatusEntry, Error, SubmitDataInputPayload>({
    mutationFn: async (payload: SubmitDataInputPayload) => {
      const { data, error } = await supabase.functions.invoke("agent-data-input", {
        body: { action: "submit", payload },
      });
      if (error) {
        // The edge function returns structured error bodies; pull out the
        // friendly message if possible.
        const ctx = error as { context?: { body?: string }; message?: string };
        const body = ctx.context?.body;
        if (body) {
          try {
            const parsed = JSON.parse(body) as { message?: string; error?: string };
            throw new Error(parsed.message ?? parsed.error ?? error.message ?? "Submit failed");
          } catch (parseErr) {
            // Only re-throw the deliberately constructed Error from above.
            // SyntaxErrors come from JSON.parse on a non-JSON body (e.g. an HTML
            // gateway error page) — swallow those and fall through to the
            // generic message below.
            if (!(parseErr instanceof SyntaxError)) throw parseErr;
          }
        }
        throw new Error(error.message ?? "Submit failed");
      }
      return (data as { entry: DataInputStatusEntry }).entry;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Submitted for review. We'll verify the closing within a few business days.");
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Submit failed";
      toast.error(message);
    },
  });
}
