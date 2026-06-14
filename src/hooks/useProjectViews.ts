import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseMutationInput, projectViewCreateSchema } from "@/lib/mutationSchemas";


export function useProjectViews(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project_views", projectId],
    queryFn: async () => {
      if (!projectId) return { count: 0 };
      const { count, error } = await supabase
        .from("project_views")
        .select("*", { count: "exact", head: true })
        .eq("project_id", projectId);
      if (error) throw error;
      return { count: count ?? 0 };
    },
    enabled: !!projectId,
  });
}

export function useRecordProjectView() {
  return useMutation({
    mutationFn: async (projectId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = parseMutationInput(
        projectViewCreateSchema,
        { project_id: projectId, viewer_id: user?.id ?? null },
        "project view",
      );
      const { error } = await supabase
        .from("project_views")
        .insert(payload);
      if (error) throw error;
    },
  });
}
