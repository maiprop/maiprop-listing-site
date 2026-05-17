import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { FAST_CHANGING_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";

export const LEAD_STATUSES = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"] as const;
export const LEAD_SOURCES = ["manual", "listing_inquiry", "consultation", "callback", "project_inquiry", "viewing", "message"] as const;

export type LeadSource = typeof LEAD_SOURCES[number];
export type LeadStatus = typeof LEAD_STATUSES[number];

export function useLeads() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["leads", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("leads")
        .select("*, listings(id, title, city, cover_image_url)")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: FAST_CHANGING_QUERY_STALE_TIME,
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (lead: {
      name: string;
      email?: string;
      phone?: string;
      message?: string;
      source?: LeadSource;
      status?: LeadStatus;
      notes?: string;
      follow_up_at?: string | null;
      listing_id?: string | null;
      professional_id?: string | null;
      project_id?: string | null;
    }) => {
      if (!user) throw new Error("Not authenticated");
       
      const payload: TablesInsert<"leads"> = {
          owner_id: user.id,
          name: lead.name,
          email: lead.email || null,
          phone: lead.phone || null,
          message: lead.message || null,
          source: lead.source || "manual",
          status: lead.status || "new",
          notes: lead.notes || null,
          follow_up_at: lead.follow_up_at || null,
          listing_id: lead.listing_id || null,
          professional_id: lead.professional_id || null,
          project_id: lead.project_id || null,
        };
      const { data, error } = await supabase.from("leads").insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead added");
    },
    onError: () => toast.error("Could not add lead. Please try again."),
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: TablesUpdate<"leads"> }) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("leads")
        .update(updates)
        .eq("id", id)
        .eq("owner_id", user.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead updated");
    },
    onError: () => toast.error("Could not update lead. Please try again."),
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("leads").delete().eq("id", id).eq("owner_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead deleted");
    },
    onError: () => toast.error("Could not delete lead. Please try again."),
  });
}
