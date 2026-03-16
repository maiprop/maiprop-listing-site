import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const db = supabase as any;

export type ProjectUnitInsert = {
  project_id: string;
  unit_id?: string;
  floor?: number;
  unit_number?: string;
  availability_status?: "available" | "reserved" | "sold";
  internal_sqm?: number;
  balcony_sqm?: number;
  storage_sqm?: number;
  parking_sqm?: number;
  bedrooms?: number;
  bathrooms?: number;
  kitchen_type?: string;
  living_rooms?: number;
  price?: number;
  price_per_sqm?: number;
  vat_included?: boolean;
  parking_price?: number;
  storage_price?: number;
  sea_view?: boolean;
  city_view?: boolean;
  mountain_view?: boolean;
  energy_class?: string;
  heating_system?: string;
  cooling_system?: string;
};

export type ProjectUnitUpdate = Partial<Omit<ProjectUnitInsert, "project_id">>;

export function useProjectUnits(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project_units", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await db
        .from("project_units")
        .select("*")
        .eq("project_id", projectId)
        .order("floor", { ascending: true, nullsFirst: false })
        .order("unit_number", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!projectId,
  });
}

export function useCreateProjectUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (unit: ProjectUnitInsert) => {
      const { data, error } = await db
        .from("project_units")
        .insert(unit)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_: any, { project_id }: ProjectUnitInsert) => {
      qc.invalidateQueries({ queryKey: ["project_units", project_id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Unit added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateProjectUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId, updates }: { id: string; projectId: string; updates: ProjectUnitUpdate }) => {
      const { data, error } = await db
        .from("project_units")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_: any, { projectId }: { id: string; projectId: string; updates: ProjectUnitUpdate }) => {
      qc.invalidateQueries({ queryKey: ["project_units", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Unit updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteProjectUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      const { error } = await db.from("project_units").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_: any, { projectId }: { id: string; projectId: string }) => {
      qc.invalidateQueries({ queryKey: ["project_units", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Unit removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
