import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { requireOwnedProject } from "@/hooks/projectOwnership";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { FAST_CHANGING_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";
import {
  parseMutationInput,
  projectLeadCreateSchema,
  projectLeadUpdateMutationSchema,
  scopedRowDeleteMutationSchema,
} from "@/lib/mutationSchemas";

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

/** A project lead row as fetched by the list query. */
export type ProjectLead = Pick<
  Database["public"]["Tables"]["project_leads"]["Row"],
  "id" | "project_id" | "unit_id" | "name" | "email" | "phone" | "source" | "status" | "notes" | "metadata" | "created_at" | "updated_at"
>;

export function useProjectLeads(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project_leads", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("project_leads")
        .select("id, project_id, unit_id, name, email, phone, source, status, notes, metadata, created_at, updated_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!projectId,
    staleTime: FAST_CHANGING_QUERY_STALE_TIME,
  });
}

export function useCreateProjectLead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (lead: ProjectLeadInsert) => {
      await requireOwnedProject(lead.project_id, user?.id);
      const payload = parseMutationInput(projectLeadCreateSchema, lead, "project lead") as ProjectLeadInsert;
      const { data, error } = await supabase
        .from("project_leads")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_: unknown, { project_id }: ProjectLeadInsert) => {
      qc.invalidateQueries({ queryKey: ["project_leads", project_id] });
      toast.success("Lead added");
    },
    onError: () => toast.error("Failed to add lead. Please try again."),
  });
}

export function useUpdateProjectLead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, projectId, updates }: { id: string; projectId: string; updates: ProjectLeadUpdate }) => {
      await requireOwnedProject(projectId, user?.id);
      const payload = parseMutationInput(
        projectLeadUpdateMutationSchema,
        { id, projectId, updates },
        "project lead update",
      );
      const { data, error } = await supabase
        .from("project_leads")
        .update(payload.updates as ProjectLeadUpdate)
        .eq("id", payload.id)
        .eq("project_id", payload.projectId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_: unknown, { projectId }: { id: string; projectId: string; updates: ProjectLeadUpdate }) => {
      qc.invalidateQueries({ queryKey: ["project_leads", projectId] });
      toast.success("Lead updated");
    },
    onError: () => toast.error("Failed to update lead. Please try again."),
  });
}

export function useDeleteProjectLead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      await requireOwnedProject(projectId, user?.id);
      const payload = parseMutationInput(scopedRowDeleteMutationSchema, { id, scopeId: projectId }, "project lead delete");
      const { error } = await supabase
        .from("project_leads")
        .delete()
        .eq("id", payload.id)
        .eq("project_id", payload.scopeId);
      if (error) throw error;
    },
    onSuccess: (_: unknown, { projectId }: { id: string; projectId: string }) => {
      qc.invalidateQueries({ queryKey: ["project_leads", projectId] });
      toast.success("Lead removed");
    },
    onError: () => toast.error("Failed to remove lead. Please try again."),
  });
}
