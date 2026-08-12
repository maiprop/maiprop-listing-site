import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { USER_SCOPED_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";
import { invokeProjectManagement } from "@/hooks/projectManagementBoundary";
import {
  parseMutationInput,
  projectListingCoverUpdateMutationSchema,
  projectUpdateMutationSchema,
  rowIdSchema,
} from "@/lib/mutationSchemas";
import { fetchProjectListingReferences } from "@/lib/listingReferences";
import { accountQueryKey } from "@/lib/identityQueryBoundary";
import { invalidatePublicCatalogueQueries } from "@/lib/publicCatalogueQueryInvalidation";

const PROJECT_SELECT = `
  id, owner_id, organization_id, name, description, city, address, municipality, cover_image_url,
  status, latitude, longitude, building_permit_number, developer_company,
  architect_group, construction_company, area_description, permit_approval_date,
  construction_start_date, structural_completion_date, delivery_date,
  archived_at, created_at, updated_at
`;

async function attachProjectListings<T extends { id: string | null }>(projects: T[]) {
  const listingRows = await fetchProjectListingReferences(
    projects.map((project) => project.id),
  );
  return projects.map((project) => ({
    ...project,
    listings: project.id ? listingRows.get(project.id) ?? [] : [],
  }));
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function useProjects(ownerId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: accountQueryKey(user?.id, "projects", ownerId ?? null),
    queryFn: async () => {
      let query = supabase
        .from("projects")
        .select(PROJECT_SELECT)
        .order("updated_at", { ascending: false });
      if (ownerId) query = query.eq("owner_id", ownerId);
      const { data, error } = await query;
      if (error) throw error;
      return attachProjectListings(data ?? []);
    },
    enabled: !!user,
    staleTime: USER_SCOPED_QUERY_STALE_TIME,
  });
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function useProject(id: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: accountQueryKey(user?.id, "project", id),
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("projects")
        .select(PROJECT_SELECT)
        .eq("id", id)
        .single();
      if (error) throw error;
      const [project] = await attachProjectListings([data]);
      return project ?? null;
    },
    enabled: Boolean(user && id),
    staleTime: USER_SCOPED_QUERY_STALE_TIME,
  });
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function useUpdateProject() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: TablesUpdate<"projects"> }) => {
      if (!user) throw new Error("Must be logged in");
      const payload = parseMutationInput(projectUpdateMutationSchema, { id, updates }, "project update");
      return invokeProjectManagement<TablesUpdate<"projects"> & { id: string }>({
        action: "update_project",
        id: payload.id,
        updates: payload.updates,
      });
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({
        queryKey: accountQueryKey(user?.id, "projects"),
      });
      qc.invalidateQueries({
        queryKey: accountQueryKey(user?.id, "project", id),
      });
      void invalidatePublicCatalogueQueries(qc);
      toast.success("Project updated");
    },
    onError: () => toast.error("Failed to update project. Please try again."),
  });
}

export function useUpdateProjectListingCover() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { projectId: string; listingId: string; coverImageUrl: string }) => {
      if (!user) throw new Error("Must be logged in");
      const payload = parseMutationInput(projectListingCoverUpdateMutationSchema, input, "project listing cover update");
      return invokeProjectManagement<{ id: string; project_id: string; cover_image_url: string }>({
        action: "update_listing_cover",
        projectId: payload.projectId,
        listingId: payload.listingId,
        coverImageUrl: payload.coverImageUrl,
      });
    },
    onSuccess: (_, { projectId, listingId }) => {
      qc.invalidateQueries({
        queryKey: accountQueryKey(user?.id, "projects"),
      });
      qc.invalidateQueries({
        queryKey: accountQueryKey(user?.id, "project", projectId),
      });
      void invalidatePublicCatalogueQueries(qc, listingId);
      toast.success("Listing cover updated");
    },
    onError: () => toast.error("Failed to update cover image. Please try again."),
  });
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function useDeleteProject() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Must be logged in");
      const projectId = parseMutationInput(rowIdSchema("project id"), id, "project id");
      await invokeProjectManagement<{ id: string }>({
        action: "delete_project",
        id: projectId,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: accountQueryKey(user?.id, "projects"),
      });
      void invalidatePublicCatalogueQueries(qc);
      toast.success("Project deleted. Linked listings are now individual listings.");
    },
    onError: () => toast.error("Failed to delete project. Please try again."),
  });
}
