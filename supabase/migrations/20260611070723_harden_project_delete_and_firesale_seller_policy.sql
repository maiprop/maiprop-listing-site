CREATE OR REPLACE FUNCTION public.delete_project_and_unlink_listings(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_deleted_projects integer := 0;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  UPDATE public.listings
  SET project_id = NULL
  WHERE project_id = p_project_id
    AND owner_id = (SELECT auth.uid());

  DELETE FROM public.projects
  WHERE id = p_project_id
    AND owner_id = (SELECT auth.uid());

  GET DIAGNOSTICS v_deleted_projects = ROW_COUNT;

  IF v_deleted_projects = 0 THEN
    RAISE EXCEPTION 'Project not found or not owned by caller';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_project_and_unlink_listings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_project_and_unlink_listings(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "firesale_requests_insert" ON public.firesale_requests;

CREATE POLICY "firesale_requests_insert" ON public.firesale_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.authoritative_role((SELECT auth.uid())) = 'seller'::public.user_role
  );
