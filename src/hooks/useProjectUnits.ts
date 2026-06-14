import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { requireOwnedProject } from "@/hooks/projectOwnership";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { FAST_CHANGING_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";
import {
  parseMutationInput,
  projectUnitBulkPriceMutationSchema,
  projectUnitCreateSchema,
  projectUnitUpdateMutationSchema,
  scopedRowDeleteMutationSchema,
} from "@/lib/mutationSchemas";

/** A project_units row as fetched by the list query. */
export type ProjectUnit = Database["public"]["Tables"]["project_units"]["Row"];

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

export type BulkUpdateProjectUnitPricesInput = {
  projectId: string;
  units: Array<Pick<ProjectUnit, "id" | "internal_sqm" | "price" | "project_id">>;
  percentage: number;
};

export const useProjectUnits = (projectId: string | undefined) => {
  return useQuery({
    queryKey: ["project_units", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("project_units")
        .select("id, project_id, listing_id, unit_id, unit_number, floor, availability_status, internal_sqm, balcony_sqm, storage_sqm, parking_sqm, bedrooms, bathrooms, kitchen_type, living_rooms, price, price_per_sqm, vat_included, parking_price, storage_price, sea_view, city_view, mountain_view, energy_class, heating_system, cooling_system, created_at, updated_at")
        .eq("project_id", projectId)
        .order("floor", { ascending: true, nullsFirst: false })
        .order("unit_number", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
    enabled: Boolean(projectId),
    staleTime: FAST_CHANGING_QUERY_STALE_TIME,
  });
};

export const useCreateProjectUnit = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (unit: ProjectUnitInsert) => {
      await requireOwnedProject(unit.project_id, user?.id);
      const payload = parseMutationInput(projectUnitCreateSchema, unit, "project unit") as ProjectUnitInsert;
      const { data, error } = await supabase
        .from("project_units")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { project_id }) => {
      qc.invalidateQueries({ queryKey: ["project_units", project_id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Unit added");
    },
    onError: () => toast.error("Failed to add unit. Please try again."),
  });
};

export const useUpdateProjectUnit = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, projectId, updates }: { id: string; projectId: string; updates: ProjectUnitUpdate }) => {
      await requireOwnedProject(projectId, user?.id);
      const payload = parseMutationInput(
        projectUnitUpdateMutationSchema,
        { id, projectId, updates },
        "project unit update",
      );
      const { data, error } = await supabase
        .from("project_units")
        .update(payload.updates as ProjectUnitUpdate)
        .eq("id", payload.id)
        .eq("project_id", payload.projectId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { projectId }) => {
      qc.invalidateQueries({ queryKey: ["project_units", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Unit updated");
    },
    onError: () => toast.error("Failed to update unit. Please try again."),
  });
};

export const useBulkUpdateProjectUnitPrices = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, units, percentage }: BulkUpdateProjectUnitPricesInput) => {
      if (units.length === 0) return { updatedCount: 0 };
      const payload = parseMutationInput(
        projectUnitBulkPriceMutationSchema,
        { projectId, units, percentage },
        "project unit bulk price update",
      );

      // Localized escape hatch: generated Supabase types can lag new migrations in PR CI.
      const rpc = supabase.rpc as unknown as (
        fn: "bulk_update_project_unit_prices",
        args: { p_project_id: string; p_percentage: number },
      ) => Promise<{ data: number | null; error: Error | null }>;
      const { data, error } = await rpc("bulk_update_project_unit_prices", {
        p_project_id: payload.projectId,
        p_percentage: payload.percentage,
      });

      if (error) throw error;
      return { updatedCount: data ?? 0 };
    },
    onSuccess: (_data, { projectId }) => {
      qc.invalidateQueries({ queryKey: ["project_units", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: () => toast.error("Failed to update unit prices. Please try again."),
  });
};

export const useDeleteProjectUnit = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      await requireOwnedProject(projectId, user?.id);
      const payload = parseMutationInput(scopedRowDeleteMutationSchema, { id, scopeId: projectId }, "project unit delete");
      const { error } = await supabase
        .from("project_units")
        .delete()
        .eq("id", payload.id)
        .eq("project_id", payload.scopeId);
      if (error) throw error;
    },
    onSuccess: (_data, { projectId }) => {
      qc.invalidateQueries({ queryKey: ["project_units", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Unit removed");
    },
    onError: () => toast.error("Failed to remove unit. Please try again."),
  });
};
