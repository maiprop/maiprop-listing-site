/**
 * Hooks for the agent "Data Input" loyalty programme.
 *
 * Surfaces three concerns:
 *   - useAgentDataInputs()      → list of the agent's submissions
 *   - useAgentDataInputQuota()  → current monthly usage / cap / ban status
 *   - useSubmitAgentDataInput() → mutation that calls the submit RPC
 *
 * Tables and RPCs (`agent_data_inputs`, `agent_data_input_bans`,
 * `submit_agent_data_input`, `agent_data_input_quota`) are not yet present
 * in the generated Supabase types, so we cast through `unknown` at the call
 * sites to keep the surface narrow per the CLAUDE.md convention.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type AgentDataInputStatus = "pending" | "verified" | "rejected";

export interface AgentDataInput {
  id: string;
  user_id: string;
  closed_at: string;
  property_address: string;
  property_city: string;
  property_postal_code: string | null;
  property_type: string | null;
  transaction_type: "sale" | "rent";
  closing_price: number;
  kaek: string | null;
  buyer_name: string | null;
  seller_name: string | null;
  notes: string | null;
  status: AgentDataInputStatus;
  rejection_reason: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  discount_pct: number;
  applied_to_invoice_at: string | null;
  stripe_credit_id: string | null;
  stripe_credit_amount_cents: number | null;
  stripe_credit_currency: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentDataInputQuota {
  used: number;
  monthly_limit: number;
  remaining: number;
  is_banned: boolean;
}

export interface SubmitAgentDataInputArgs {
  closed_at: string; // ISO date (YYYY-MM-DD)
  property_address: string;
  property_city: string;
  transaction_type: "sale" | "rent";
  closing_price: number;
  property_postal_code?: string | null;
  property_type?: string | null;
  kaek?: string | null;
  buyer_name?: string | null;
  seller_name?: string | null;
  notes?: string | null;
}

const QUERY_KEY_LIST = "agent-data-inputs";
const QUERY_KEY_QUOTA = "agent-data-input-quota";

export function useAgentDataInputs() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [QUERY_KEY_LIST, user?.id],
    queryFn: async (): Promise<AgentDataInput[]> => {
      if (!user) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from as any)("agent_data_inputs")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AgentDataInput[];
    },
    enabled: !!user,
  });
}

export function useAgentDataInputQuota() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [QUERY_KEY_QUOTA, user?.id],
    queryFn: async (): Promise<AgentDataInputQuota> => {
      if (!user) {
        return { used: 0, monthly_limit: 20, remaining: 20, is_banned: false };
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("agent_data_input_quota", {
        p_user_id: user.id,
      });
      if (error) throw error;
      // RPC returns a TABLE — supabase-js wraps single-row results as array.
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return { used: 0, monthly_limit: 20, remaining: 20, is_banned: false };
      return {
        used: Number(row.used ?? 0),
        monthly_limit: Number(row.monthly_limit ?? 20),
        remaining: Number(row.remaining ?? 20),
        is_banned: Boolean(row.is_banned ?? false),
      };
    },
    enabled: !!user,
    staleTime: 30_000,
  });
}

export function useSubmitAgentDataInput() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (args: SubmitAgentDataInputArgs): Promise<string> => {
      if (!user) throw new Error("Must be logged in");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("submit_agent_data_input", {
        p_closed_at: args.closed_at,
        p_property_address: args.property_address,
        p_property_city: args.property_city,
        p_transaction_type: args.transaction_type,
        p_closing_price: args.closing_price,
        p_property_postal_code: args.property_postal_code ?? null,
        p_property_type: args.property_type ?? null,
        p_kaek: args.kaek ?? null,
        p_buyer_name: args.buyer_name ?? null,
        p_seller_name: args.seller_name ?? null,
        p_notes: args.notes ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast.success("Submission received — pending verification");
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY_LIST] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY_QUOTA] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to submit data input";
      toast.error(message);
    },
  });
}
