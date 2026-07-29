import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { accountQueryKey } from "@/lib/identityQueryBoundary";
import { USER_SCOPED_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";

type OrganizationRelation = {
  id: string;
  name: string;
};

type ManageableOrganizationRow = {
  organization_id: string;
  role: string;
  organizations: OrganizationRelation | OrganizationRelation[] | null;
};

export type ManageableOrganization = {
  id: string;
  name: string;
  role: string;
};

const resolveOrganization = (
  relation: ManageableOrganizationRow["organizations"],
) => Array.isArray(relation) ? relation[0] ?? null : relation;

export function useManageableOrganizations() {
  const { user } = useAuth();

  return useQuery({
    queryKey: accountQueryKey(user?.id, "manageable-organizations"),
    queryFn: async (): Promise<ManageableOrganization[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("organization_memberships")
        .select("organization_id, role, organizations!inner(id, name)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .in("role", ["owner", "admin", "member"]);
      if (error) throw error;

      return ((data ?? []) as unknown as ManageableOrganizationRow[])
        .map((membership) => {
          const organization = resolveOrganization(membership.organizations);
          return organization
            ? {
                id: organization.id,
                name: organization.name,
                role: membership.role,
              }
            : null;
        })
        .filter((organization): organization is ManageableOrganization => Boolean(organization))
        .sort((left, right) => left.name.localeCompare(right.name));
    },
    enabled: Boolean(user),
    staleTime: USER_SCOPED_QUERY_STALE_TIME,
  });
}
