BEGIN;

-- Project inventory and lead records have durable audit identity. Browser
-- actors may update their contents, but moving an existing child to another
-- project would rewrite its tenant history. Trusted service repair remains
-- possible because service-role database calls do not carry auth.uid().
CREATE OR REPLACE FUNCTION private.guard_project_child_scope_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    RAISE EXCEPTION 'permission_denied: project child scope cannot be reassigned'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_project_child_scope_update()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.guard_project_child_scope_update()
  TO service_role;

DROP TRIGGER IF EXISTS trg_guard_project_units_project_scope
  ON public.project_units;
CREATE TRIGGER trg_guard_project_units_project_scope
  BEFORE UPDATE OF project_id ON public.project_units
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_project_child_scope_update();

DROP TRIGGER IF EXISTS trg_guard_project_media_project_scope
  ON public.project_media;
CREATE TRIGGER trg_guard_project_media_project_scope
  BEFORE UPDATE OF project_id ON public.project_media
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_project_child_scope_update();

DROP TRIGGER IF EXISTS trg_guard_project_leads_project_scope
  ON public.project_leads;
CREATE TRIGGER trg_guard_project_leads_project_scope
  BEFORE UPDATE OF project_id ON public.project_leads
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_project_child_scope_update();

COMMENT ON FUNCTION private.guard_project_child_scope_update() IS
  'Prevents browser actors from moving existing project units, media, or leads between projects or tenants.';

COMMIT;
