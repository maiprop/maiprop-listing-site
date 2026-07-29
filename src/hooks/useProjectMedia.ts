import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { CATALOG_STATIC_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";
import { invokeProjectManagement } from "@/hooks/projectManagementBoundary";
import { parseMutationInput, projectMediaCreateSchema, scopedRowDeleteMutationSchema } from "@/lib/mutationSchemas";
import { accountQueryKey } from "@/lib/identityQueryBoundary";

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
  const { user } = useAuth();
  return useQuery({
    queryKey: accountQueryKey(user?.id, "project_media", projectId),
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
    enabled: Boolean(user && projectId),
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
      if (!user) throw new Error("Must be logged in");
      const payload = parseMutationInput(
        projectMediaCreateSchema,
        { project_id, url, media_type, title, sort_order },
        "project media",
      );
      return invokeProjectManagement<ProjectMedia>({
        action: "add_media",
        projectId: payload.project_id,
        media: {
          project_id: payload.project_id,
          url: payload.url,
          media_type: payload.media_type,
          title: payload.title,
          sort_order: payload.sort_order,
        },
      });
    },
    onSuccess: (_: unknown, { project_id }: { project_id: string; url: string; media_type: ProjectMediaType; title?: string; sort_order?: number }) => {
      qc.invalidateQueries({
        queryKey: accountQueryKey(user?.id, "project_media", project_id),
      });
      qc.invalidateQueries({
        queryKey: accountQueryKey(user?.id, "projects"),
      });
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
      if (!user) throw new Error("Must be logged in");
      const payload = parseMutationInput(scopedRowDeleteMutationSchema, { id, scopeId: projectId }, "project media delete");
      await invokeProjectManagement<{ id: string }>({
        action: "delete_media",
        projectId: payload.scopeId,
        id: payload.id,
      });
    },
    onSuccess: (_: unknown, { projectId }: { id: string; projectId: string }) => {
      qc.invalidateQueries({
        queryKey: accountQueryKey(user?.id, "project_media", projectId),
      });
      qc.invalidateQueries({
        queryKey: accountQueryKey(user?.id, "projects"),
      });
      toast.success("Media removed");
    },
    onError: () => toast.error("Failed to remove media. Please try again."),
  });
}
