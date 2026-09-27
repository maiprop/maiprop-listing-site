BEGIN;
DROP POLICY "viewings_insert" ON public.viewings;
DROP POLICY "viewings_select" ON public.viewings;
DROP POLICY "viewings_update" ON public.viewings;
CREATE POLICY "viewings_insert" ON public."viewings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((private.has_platform_admin(( SELECT auth.uid() AS uid)) OR ((requester_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::viewing_status) AND (EXISTS ( SELECT 1
   FROM listings listing
  WHERE ((listing.id = viewings.listing_id) AND (listing.owner_id = viewings.owner_id)))))));
CREATE POLICY "viewings_select" ON public."viewings" AS PERMISSIVE FOR SELECT TO "public" USING (((( SELECT auth.uid() AS uid) = requester_id) OR (( SELECT auth.uid() AS uid) = owner_id)));
CREATE POLICY "viewings_update" ON public."viewings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((private.has_platform_admin(( SELECT auth.uid() AS uid)) OR (( SELECT auth.uid() AS uid) = owner_id) OR (( SELECT auth.uid() AS uid) = requester_id))) WITH CHECK ((private.has_platform_admin(( SELECT auth.uid() AS uid)) OR (( SELECT auth.uid() AS uid) = owner_id) OR (( SELECT auth.uid() AS uid) = requester_id)));
REVOKE ALL ON public.viewings FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.viewings TO "postgres";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.viewings TO "anon";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.viewings TO "authenticated";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.viewings TO "service_role";
DROP POLICY "listing_insert_quota" ON public.listings;
DROP POLICY "listings_delete" ON public.listings;
DROP POLICY "listings_select_authenticated" ON public.listings;
DROP POLICY "listings_update" ON public.listings;
CREATE POLICY "listing_insert_quota" ON public."listings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((owner_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.check_listing_quota() AS check_listing_quota) AND ((COALESCE((listing_type)::text, 'sale'::text) <> 'new_build'::text) OR ( SELECT private.has_developer_listing_access(( SELECT auth.uid() AS uid)) AS has_developer_listing_access)) AND ((project_id IS NULL) OR (( SELECT private.has_developer_listing_access(( SELECT auth.uid() AS uid)) AS has_developer_listing_access) AND (EXISTS ( SELECT 1
   FROM projects project
  WHERE ((project.id = listings.project_id) AND (project.owner_id = listings.owner_id) AND (project.owner_id = ( SELECT auth.uid() AS uid)))))))));
CREATE POLICY "listings_delete" ON public."listings" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((((organization_id IS NULL) AND (owner_id = ( SELECT auth.uid() AS uid))) OR ((organization_id IS NOT NULL) AND private.has_org_permission(organization_id, 'listing:manage'::text, ( SELECT auth.uid() AS uid)))));
CREATE POLICY "listings_select_authenticated" ON public."listings" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((((status = 'active'::listing_status) AND (COALESCE(is_off_market, false) = false)) OR (owner_id = ( SELECT auth.uid() AS uid)) OR ((organization_id IS NOT NULL) AND private.has_org_permission(organization_id, 'listing:view'::text, ( SELECT auth.uid() AS uid)))));
CREATE POLICY "listings_update" ON public."listings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((owner_id = ( SELECT auth.uid() AS uid))) WITH CHECK (((owner_id = ( SELECT auth.uid() AS uid)) AND ((COALESCE((listing_type)::text, 'sale'::text) <> 'new_build'::text) OR ( SELECT private.has_developer_listing_access(( SELECT auth.uid() AS uid)) AS has_developer_listing_access)) AND ((project_id IS NULL) OR (( SELECT private.has_developer_listing_access(( SELECT auth.uid() AS uid)) AS has_developer_listing_access) AND (EXISTS ( SELECT 1
   FROM projects project
  WHERE ((project.id = listings.project_id) AND (project.owner_id = listings.owner_id) AND (project.owner_id = ( SELECT auth.uid() AS uid)))))))));
REVOKE ALL ON public.listings FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.listings TO "postgres";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.listings TO "service_role";
COMMIT;