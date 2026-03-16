import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const db = supabase as any;

export type ProjectMediaType =
  | "rendering"
  | "floor_plan"
  | "site_plan"
  | "brochure_pdf"
  | "drone"
  | "walkthrough"
  | "progress"
  | "video";

export function useProjectMedia(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project_media", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await db
        .from("project_media")
        .select("*")
        .eq("project_id", projectId)
        .order("media_type")
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
    enabled: !!projectId,
  });
}

export function useAddProjectMedia() {
  const qc = useQueryClient();
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
      const { data, error } = await db
        .from("project_media")
        .insert({ project_id, url, media_type, title: title || null, sort_order: sort_order ?? 0 })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_: any, { project_id }: { project_id: string; url: string; media_type: ProjectMediaType; title?: string; sort_order?: number }) => {
      qc.invalidateQueries({ queryKey: ["project_media", project_id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Media added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteProjectMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; projectId: string }) => {
      const { error } = await db.from("project_media").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_: any, { projectId }: { id: string; projectId: string }) => {
      qc.invalidateQueries({ queryKey: ["project_media", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Media removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
