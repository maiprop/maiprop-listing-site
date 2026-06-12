-- Ensure every project deletion path detaches project listings into ordinary
-- standalone listings. The RPC already performs this update; this trigger also
-- covers any direct project delete that relies on the FK's ON DELETE SET NULL.

CREATE SCHEMA IF NOT EXISTS private;

DROP TRIGGER IF EXISTS trg_unlink_project_listings_before_delete ON public.projects;
DROP FUNCTION IF EXISTS public.unlink_project_listings_before_delete();

CREATE OR REPLACE FUNCTION private.unlink_project_listings_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.listings
  SET
    project_id = NULL,
    listing_type = 'sale'::public.listing_type,
    is_pre_sale = false
  WHERE project_id = OLD.id;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.unlink_project_listings_before_delete() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_unlink_project_listings_before_delete
  BEFORE DELETE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION private.unlink_project_listings_before_delete();

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
  SET
    project_id = NULL,
    listing_type = 'sale'::public.listing_type,
    is_pre_sale = false
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

-- Repair the live admin-created ordinary listing that remained attached to a
-- project after the older project workflow was deleted. On fresh builds this
-- timestamp predates the later 'new_build' enum migration, so guard the repair.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.listing_type'::regtype
      AND enumlabel = 'new_build'
  ) THEN
    UPDATE public.listings
    SET
      project_id = NULL,
      listing_type = 'sale'::public.listing_type,
      is_pre_sale = false
    WHERE id = '0308050d-8d62-4fc8-b421-7c74116343b3'::uuid
      AND owner_id = '5f762dec-2eb5-4463-a052-fcee02b39f24'::uuid
      AND listing_type::text = 'new_build';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_unlink_project_listings_before_delete'
      AND tgrelid = 'public.projects'::regclass
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'project delete listing detach trigger missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.listings
    WHERE id = '0308050d-8d62-4fc8-b421-7c74116343b3'::uuid
      AND (
        project_id IS NOT NULL
        OR listing_type <> 'sale'::public.listing_type
        OR COALESCE(is_pre_sale, false) IS TRUE
      )
  ) THEN
    RAISE EXCEPTION 'Glyfada Loft listing must be standalone sale after repair';
  END IF;
END $$;
