import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const db = supabase as any;

export type ProjectLeadInsert = {
  project_id: string;
  name: string;
  email?: string;
  phone?: string;
  source?: string;
  unit_id?: string;
  status?: "new" | "contacted" | "qualified" | "converted" | "lost";
  notes?: string;
};

export type ProjectLeadUpdate = Partial<Omit<ProjectLeadInsert, "project_id">>;

export function useProjectLeads(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project_leads", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await db
        .from("project_leads")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!projectId,
  });
}

export function useCreateProjectLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lead: ProjectLeadInsert) => {
      const { data, error } = await db
        .from("project_leads")
        .insert(lead)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_: any, { project_id }: ProjectLeadInsert) => {
      qc.invalidateQueries({ queryKey: ["project_leads", project_id] });
      toast.success("Lead added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateProjectLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId: _projectId, updates }: { id: string; projectId: string; updates: ProjectLeadUpdate }) => {
      const { data, error } = await db
        .from("project_leads")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_: any, { projectId }: { id: string; projectId: string; updates: ProjectLeadUpdate }) => {
      qc.invalidateQueries({ queryKey: ["project_leads", projectId] });
      toast.success("Lead updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteProjectLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; projectId: string }) => {
      const { error } = await db.from("project_leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_: any, { projectId }: { id: string; projectId: string }) => {
      qc.invalidateQueries({ queryKey: ["project_leads", projectId] });
      toast.success("Lead removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
