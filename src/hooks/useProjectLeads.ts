import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { FAST_CHANGING_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";
import { invokeProjectManagement } from "@/hooks/projectManagementBoundary";
import {
  parseMutationInput,
  projectLeadCreateSchema,
  projectLeadUpdateMutationSchema,
  scopedRowDeleteMutationSchema,
} from "@/lib/mutationSchemas";
import { accountQueryKey } from "@/lib/identityQueryBoundary";

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
  const { user } = useAuth();
  return useQuery({
    queryKey: accountQueryKey(user?.id, "project_leads", projectId),
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
    enabled: Boolean(user && projectId),
    staleTime: FAST_CHANGING_QUERY_STALE_TIME,
  });
}

export function useCreateProjectLead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (lead: ProjectLeadInsert) => {
      if (!user) throw new Error("Must be logged in");
      const payload = parseMutationInput(projectLeadCreateSchema, lead, "project lead") as ProjectLeadInsert;
      return invokeProjectManagement<ProjectLead>({
        action: "create_lead",
        projectId: payload.project_id,
        lead: payload,
      });
    },
    onSuccess: (_: unknown, { project_id }: ProjectLeadInsert) => {
      qc.invalidateQueries({
        queryKey: accountQueryKey(user?.id, "project_leads", project_id),
      });
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
      if (!user) throw new Error("Must be logged in");
      const payload = parseMutationInput(
        projectLeadUpdateMutationSchema,
        { id, projectId, updates },
        "project lead update",
      );
      return invokeProjectManagement<ProjectLead>({
        action: "update_lead",
        projectId: payload.projectId,
        id: payload.id,
        updates: payload.updates,
      });
    },
    onSuccess: (_: unknown, { projectId }: { id: string; projectId: string; updates: ProjectLeadUpdate }) => {
      qc.invalidateQueries({
        queryKey: accountQueryKey(user?.id, "project_leads", projectId),
      });
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
      if (!user) throw new Error("Must be logged in");
      const payload = parseMutationInput(scopedRowDeleteMutationSchema, { id, scopeId: projectId }, "project lead delete");
      await invokeProjectManagement<{ id: string }>({
        action: "delete_lead",
        projectId: payload.scopeId,
        id: payload.id,
      });
    },
    onSuccess: (_: unknown, { projectId }: { id: string; projectId: string }) => {
      qc.invalidateQueries({
        queryKey: accountQueryKey(user?.id, "project_leads", projectId),
      });
      toast.success("Lead removed");
    },
    onError: () => toast.error("Failed to remove lead. Please try again."),
  });
}
