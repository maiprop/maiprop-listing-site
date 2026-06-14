import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { requireOwnedProject } from "@/hooks/projectOwnership";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { CATALOG_STATIC_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";
import { parseMutationInput, projectMediaCreateSchema, scopedRowDeleteMutationSchema } from "@/lib/mutationSchemas";

export type ProjectMediaType =
  | "rendering"
  | "floor_plan"
  | "site_plan"
  | "brochure_pdf"
  | "drone"
  | "walkthrough"
  | "progress"
  | "video";

/** A single project_media row with the columns we read in the UI. */
export type ProjectMedia = Pick<
  Database["public"]["Tables"]["project_media"]["Row"],
  "id" | "project_id" | "url" | "media_type" | "title" | "sort_order" | "created_at"
>;

export function useProjectMedia(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project_media", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("project_media")
        .select("id, project_id, url, media_type, title, sort_order, created_at")
        .eq("project_id", projectId)
        .order("media_type")
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
    enabled: !!projectId,
    staleTime: CATALOG_STATIC_QUERY_STALE_TIME,
  });
}

export function useAddProjectMedia() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      project_id,
      url,
      media_type,
      title,
      sort_order,
    }: {
      project_id: string;
      url: string;
      media_type: ProjectMediaType;
      title?: string;
      sort_order?: number;
    }) => {
      await requireOwnedProject(project_id, user?.id);
      const payload = parseMutationInput(
        projectMediaCreateSchema,
        { project_id, url, media_type, title, sort_order },
        "project media",
      );
      const { data, error } = await supabase
        .from("project_media")
        .insert({
          project_id: payload.project_id,
          url: payload.url,
          media_type: payload.media_type as ProjectMediaType,
          title: payload.title || null,
          sort_order: payload.sort_order ?? 0,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_: unknown, { project_id }: { project_id: string; url: string; media_type: ProjectMediaType; title?: string; sort_order?: number }) => {
      qc.invalidateQueries({ queryKey: ["project_media", project_id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Media added");
    },
    onError: () => toast.error("Failed to add media. Please try again."),
  });
}

export function useDeleteProjectMedia() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      await requireOwnedProject(projectId, user?.id);
      const payload = parseMutationInput(scopedRowDeleteMutationSchema, { id, scopeId: projectId }, "project media delete");
      const { error } = await supabase
        .from("project_media")
        .delete()
        .eq("id", payload.id)
        .eq("project_id", payload.scopeId);
      if (error) throw error;
    },
    onSuccess: (_: unknown, { projectId }: { id: string; projectId: string }) => {
      qc.invalidateQueries({ queryKey: ["project_media", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Media removed");
    },
    onError: () => toast.error("Failed to remove media. Please try again."),
  });
}
