import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { USER_SCOPED_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function useProjects(ownerId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["projects", user?.id, ownerId],
    queryFn: async () => {
      let query = supabase
        .from("projects")
        .select("id, owner_id, name, description, city, address, municipality, cover_image_url, status, latitude, longitude, building_permit_number, developer_company, architect_group, construction_company, area_description, permit_approval_date, construction_start_date, structural_completion_date, delivery_date, archived_at, created_at, updated_at")
        .order("updated_at", { ascending: false });
      if (ownerId) query = query.eq("owner_id", ownerId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: USER_SCOPED_QUERY_STALE_TIME,
  });
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("projects")
        .select("id, owner_id, name, description, city, address, municipality, cover_image_url, status, latitude, longitude, building_permit_number, developer_company, architect_group, construction_company, area_description, permit_approval_date, construction_start_date, structural_completion_date, delivery_date, archived_at, created_at, updated_at")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
    staleTime: USER_SCOPED_QUERY_STALE_TIME,
  });
}

export type ProjectInsert = {
  name: string;
  description?: string;
  city?: string;
  address?: string;
  building_permit_number?: string;
  developer_company?: string;
  architect_group?: string;
  construction_company?: string;
  municipality?: string;
  latitude?: number;
  longitude?: number;
  area_description?: string;
  permit_approval_date?: string;
  construction_start_date?: string;
  structural_completion_date?: string;
  delivery_date?: string;
};

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function useCreateProject() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (project: ProjectInsert) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("projects")
        .insert({ ...project, owner_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project created");
    },
    onError: () => toast.error("Failed to create project. Please try again."),
  });
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function useUpdateProject() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: TablesUpdate<"projects"> }) => {
      if (!user) throw new Error("Must be logged in");
      const { data, error } = await supabase
        .from("projects")
        .update(updates)
        .eq("id", id)
        .eq("owner_id", user.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project", id] });
      toast.success("Project updated");
    },
    onError: () => toast.error("Failed to update project. Please try again."),
  });
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function useDeleteProject() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Must be logged in");
      const { error } = await supabase.rpc("delete_project_and_unlink_listings", {
        p_project_id: id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["listings"] });
      qc.invalidateQueries({ queryKey: ["listings-paginated"] });
      toast.success("Project deleted. Linked listings are now individual listings.");
    },
    onError: () => toast.error("Failed to delete project. Please try again."),
  });
}
