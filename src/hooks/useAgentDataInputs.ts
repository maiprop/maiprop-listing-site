/**
 * Hooks for the agent "Data Input" loyalty programme.
 *
 * These preserve the older dashboard-facing shape while routing through the
 * authenticated `agent-data-input` Edge Function. The privileged SECURITY
 * DEFINER RPCs stay server-side instead of being exposed directly to browsers.
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
  closed_at: string;
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

type EdgeEntry = {
  id: string;
  user_id?: string | null;
  property_address: string;
  city: string | null;
  postal_code: string | null;
  property_type: string | null;
  transaction_type: "sale" | "rental";
  sale_price: number;
  closing_date: string;
  status: AgentDataInputStatus | "flagged";
  rejection_reason: string | null;
  discount_applied_at?: string | null;
  discount_invoice_id?: string | null;
  created_at: string;
  reviewed_at: string | null;
};

type EdgeStatusResponse = {
  monthly_count: number;
  monthly_limit: number;
  lifetime_banned: boolean;
  entries: EdgeEntry[];
};

function normalizeEntry(entry: EdgeEntry, userId: string): AgentDataInput {
  return {
    id: entry.id,
    user_id: entry.user_id ?? userId,
    closed_at: entry.closing_date,
    property_address: entry.property_address,
    property_city: entry.city ?? "",
    property_postal_code: entry.postal_code,
    property_type: entry.property_type,
    transaction_type: entry.transaction_type === "rental" ? "rent" : "sale",
    closing_price: Number(entry.sale_price ?? 0),
    kaek: null,
    buyer_name: null,
    seller_name: null,
    notes: null,
    status: entry.status === "flagged" ? "rejected" : entry.status,
    rejection_reason: entry.rejection_reason,
    reviewed_at: entry.reviewed_at,
    reviewed_by: null,
    discount_pct: 0,
    applied_to_invoice_at: entry.discount_applied_at ?? null,
    stripe_credit_id: entry.discount_invoice_id ?? null,
    stripe_credit_amount_cents: null,
    stripe_credit_currency: null,
    created_at: entry.created_at,
    updated_at: entry.reviewed_at ?? entry.created_at,
  };
}

function normalizePropertyType(value: string | null | undefined): "apartment" | "house" | "commercial" | "land" | "other" {
  if (value === "apartment" || value === "house" || value === "commercial" || value === "land") {
    return value;
  }
  return "other";
}

export function useAgentDataInputs() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [QUERY_KEY_LIST, user?.id],
    queryFn: async (): Promise<AgentDataInput[]> => {
      if (!user) return [];
      const { data, error } = await supabase.functions.invoke("agent-data-input", {
        body: { action: "list" },
      });
      if (error) throw error;
      const response = data as EdgeStatusResponse;
      return (response.entries ?? []).map((entry) => normalizeEntry(entry, user.id));
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
      const { data, error } = await supabase.functions.invoke("agent-data-input", {
        body: { action: "status" },
      });
      if (error) throw error;
      const row = data as EdgeStatusResponse | null;
      if (!row) return { used: 0, monthly_limit: 20, remaining: 20, is_banned: false };
      const used = Number(row.monthly_count ?? 0);
      const monthlyLimit = Number(row.monthly_limit ?? 20);
      return {
        used,
        monthly_limit: monthlyLimit,
        remaining: Math.max(monthlyLimit - used, 0),
        is_banned: Boolean(row.lifetime_banned ?? false),
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
      const { data, error } = await supabase.functions.invoke("agent-data-input", {
        body: {
          action: "submit",
          payload: {
            property_address: args.property_address,
            city: args.property_city,
            postal_code: args.property_postal_code ?? null,
            kaek: args.kaek ?? null,
            property_type: normalizePropertyType(args.property_type),
            transaction_type: args.transaction_type === "rent" ? "rental" : "sale",
            agent_side: "seller",
            sale_price: args.closing_price,
            closing_date: args.closed_at,
            buyer_name: args.buyer_name ?? null,
            seller_name: args.seller_name ?? null,
            notes: args.notes ?? null,
          },
        },
      });
      if (error) throw error;
      return ((data as { entry?: { id?: string } } | null)?.entry?.id) ?? "";
    },
    onSuccess: () => {
      toast.success("Submission received - pending verification");
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY_LIST] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY_QUOTA] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to submit data input";
      toast.error(message);
    },
  });
}
