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
import { agentDataInputActionBodySchema, parseMutationInput } from "@/lib/mutationSchemas";

export type AgentDataInputStatus = "pending" | "verified" | "rejected";
export type AgentDataInputSide = "buyer" | "seller" | "both";

export interface AgentDataInput {
  id: string;
  user_id: string;
  closed_at: string;
  property_address: string;
  property_city: string;
  property_postal_code: string | null;
  property_type: string | null;
  transaction_type: "sale" | "rent";
  agent_side: AgentDataInputSide;
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
  agent_side: AgentDataInputSide;
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
const DEFAULT_AGENT_DATA_INPUT_QUOTA: AgentDataInputQuota = {
  used: 0,
  monthly_limit: 20,
  remaining: 20,
  is_banned: false,
};

type EdgeEntry = {
  id: string;
  user_id?: string | null;
  property_address: string;
  city: string | null;
  postal_code: string | null;
  property_type: string | null;
  transaction_type: "sale" | "rental";
  agent_side?: AgentDataInputSide | null;
  sale_price: number;
  closing_date: string;
  status: AgentDataInputStatus | "flagged";
  rejection_reason: string | null;
  discount_pct?: number | string | null;
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

type EdgeSubmitResponse = {
  entry?: { id?: string | null } | null;
  error?: string | null;
  message?: string | null;
};

const nullable = <T>(value: T | null | undefined): T | null => value ?? null;

const edgeTransactionType = (value: EdgeEntry["transaction_type"]): "sale" | "rent" =>
  value === "rental" ? "rent" : "sale";

const edgeStatus = (value: EdgeEntry["status"]): AgentDataInputStatus =>
  value === "flagged" ? "rejected" : value;

const edgeAgentSide = (value: EdgeEntry["agent_side"]): AgentDataInputSide => {
  if (value === "buyer" || value === "seller" || value === "both") return value;
  return "seller";
};

const entryUserId = (entry: EdgeEntry, fallbackUserId: string): string => entry.user_id ?? fallbackUserId;

const entryCity = (entry: EdgeEntry): string => entry.city ?? "";

const entryUpdatedAt = (entry: EdgeEntry): string => entry.reviewed_at ?? entry.created_at;

const entryDiscountPct = (entry: EdgeEntry): number => {
  const value = Number(entry.discount_pct ?? 0);
  return Number.isFinite(value) ? value : 0;
};

const normalizeEntry = (entry: EdgeEntry, userId: string): AgentDataInput => { // skipcq: JS-R1005 - Keep the edge response adapter centralized so the legacy dashboard shape does not drift.
  return {
    id: entry.id,
    user_id: entryUserId(entry, userId),
    closed_at: entry.closing_date,
    property_address: entry.property_address,
    property_city: entryCity(entry),
    property_postal_code: nullable(entry.postal_code),
    property_type: nullable(entry.property_type),
    transaction_type: edgeTransactionType(entry.transaction_type),
    agent_side: edgeAgentSide(entry.agent_side),
    closing_price: Number(entry.sale_price),
    kaek: null,
    buyer_name: null,
    seller_name: null,
    notes: null,
    status: edgeStatus(entry.status),
    rejection_reason: entry.rejection_reason,
    reviewed_at: entry.reviewed_at,
    reviewed_by: null,
    discount_pct: entryDiscountPct(entry),
    applied_to_invoice_at: nullable(entry.discount_applied_at),
    stripe_credit_id: nullable(entry.discount_invoice_id),
    stripe_credit_amount_cents: null,
    stripe_credit_currency: null,
    created_at: entry.created_at,
    updated_at: entryUpdatedAt(entry),
  };
};

const normalizePropertyType = (value: string | null | undefined): "apartment" | "house" | "commercial" | "land" | "other" => {
  if (value === "apartment" || value === "house" || value === "commercial" || value === "land") {
    return value;
  }
  return "other";
};

const edgeSubmitTransactionType = (value: SubmitAgentDataInputArgs["transaction_type"]): "sale" | "rental" =>
  value === "rent" ? "rental" : "sale";

const buildSubmitPayload = (args: SubmitAgentDataInputArgs) => ({
  property_address: args.property_address,
  city: args.property_city,
  postal_code: nullable(args.property_postal_code),
  kaek: nullable(args.kaek),
  property_type: normalizePropertyType(args.property_type),
  transaction_type: edgeSubmitTransactionType(args.transaction_type),
  agent_side: args.agent_side,
  sale_price: args.closing_price,
  closing_date: args.closed_at,
  buyer_name: nullable(args.buyer_name),
  seller_name: nullable(args.seller_name),
  notes: nullable(args.notes),
});

const quotaFromResponse = (row: EdgeStatusResponse | null): AgentDataInputQuota => {
  if (!row) return DEFAULT_AGENT_DATA_INPUT_QUOTA;

  const used = Number(row.monthly_count ?? 0);
  const monthlyLimit = Number(row.monthly_limit ?? DEFAULT_AGENT_DATA_INPUT_QUOTA.monthly_limit);
  return {
    used,
    monthly_limit: monthlyLimit,
    remaining: Math.max(monthlyLimit - used, 0),
    is_banned: Boolean(row.lifetime_banned ?? false),
  };
};

export const useAgentDataInputs = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: [QUERY_KEY_LIST, user?.id],
    queryFn: async (): Promise<AgentDataInput[]> => {
      if (!user) return [];
      const body = parseMutationInput(agentDataInputActionBodySchema, { action: "list" }, "agent data input list");
      const { data, error } = await supabase.functions.invoke("agent-data-input", {
        body,
      });
      if (error) throw error;
      const response = data as EdgeStatusResponse;
      return (response.entries ?? []).map((entry) => normalizeEntry(entry, user.id));
    },
    enabled: !!user,
  });
};

export const useAgentDataInputQuota = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: [QUERY_KEY_QUOTA, user?.id],
    queryFn: async (): Promise<AgentDataInputQuota> => {
      if (!user) return DEFAULT_AGENT_DATA_INPUT_QUOTA;

      const body = parseMutationInput(agentDataInputActionBodySchema, { action: "status" }, "agent data input status");
      const { data, error } = await supabase.functions.invoke("agent-data-input", {
        body,
      });
      if (error) throw error;
      return quotaFromResponse(data as EdgeStatusResponse | null);
    },
    enabled: !!user,
    staleTime: 30_000,
  });
};

export const useSubmitAgentDataInput = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (args: SubmitAgentDataInputArgs): Promise<string> => {
      if (!user) throw new Error("Must be logged in");
      const body = parseMutationInput(
        agentDataInputActionBodySchema,
        {
          action: "submit",
          payload: buildSubmitPayload(args),
        },
        "agent data input submission",
      );
      const { data, error } = await supabase.functions.invoke("agent-data-input", {
        body,
      });
      if (error) throw error;
      const response = data as EdgeSubmitResponse | null;
      const edgeError = response?.message ?? response?.error;
      if (edgeError) throw new Error(edgeError);

      const entryId = response?.entry?.id;
      if (!entryId) {
        throw new Error("Data input submission was not saved. Please retry.");
      }
      return entryId;
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
};
