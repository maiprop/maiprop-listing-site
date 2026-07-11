-- Restore missing audit infrastructure and close the remaining ECAS tenant
-- authorization gaps without changing profile roles, plans, or entitlements.

-- 1. Restore the append-only platform administration audit trail.

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_id uuid,
  entity text NOT NULL,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  reason text
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target
  ON public.admin_audit_log (target_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor
  ON public.admin_audit_log (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_entity
  ON public.admin_audit_log (entity, occurred_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_audit_log_select ON public.admin_audit_log;
CREATE POLICY admin_audit_log_select
  ON public.admin_audit_log
  FOR SELECT
  TO authenticated
  USING (private.has_platform_admin((SELECT auth.uid())));

CREATE OR REPLACE FUNCTION private.guard_admin_audit_log_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.actor_id IS NOT NULL
     AND NEW.actor_id IS NULL
     AND to_jsonb(NEW) - 'actor_id' = to_jsonb(OLD) - 'actor_id' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'admin_audit_log is append-only'
    USING ERRCODE = '42501';
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_admin_audit_log_append_only()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.guard_admin_audit_log_append_only()
  TO service_role;

DROP TRIGGER IF EXISTS trg_admin_audit_log_append_only ON public.admin_audit_log;
CREATE TRIGGER trg_admin_audit_log_append_only
  BEFORE UPDATE OR DELETE ON public.admin_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_admin_audit_log_append_only();

CREATE OR REPLACE FUNCTION public.log_user_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.admin_audit_log (
      actor_id,
      target_id,
      entity,
      action,
      new_data
    )
    VALUES (
      v_actor,
      NEW.user_id,
      'user_roles',
      'INSERT',
      to_jsonb(NEW)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.admin_audit_log (
      actor_id,
      target_id,
      entity,
      action,
      old_data,
      new_data
    )
    VALUES (
      v_actor,
      NEW.user_id,
      'user_roles',
      'UPDATE',
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.admin_audit_log (
      actor_id,
      target_id,
      entity,
      action,
      old_data
    )
    VALUES (
      v_actor,
      OLD.user_id,
      'user_roles',
      'DELETE',
      to_jsonb(OLD)
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.log_user_role_change()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_user_role_change()
  TO service_role;

DROP TRIGGER IF EXISTS trg_user_roles_audit ON public.user_roles;
CREATE TRIGGER trg_user_roles_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_user_role_change();

REVOKE ALL ON TABLE public.admin_audit_log
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.admin_audit_log
  TO authenticated;
GRANT SELECT, INSERT ON TABLE public.admin_audit_log
  TO service_role;

DO $$
DECLARE
  audit_sequence regclass := pg_get_serial_sequence(
    'public.admin_audit_log',
    'id'
  )::regclass;
BEGIN
  IF audit_sequence IS NOT NULL THEN
    EXECUTE format(
      'REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated, service_role',
      audit_sequence
    );
    EXECUTE format(
      'GRANT USAGE, SELECT ON SEQUENCE %s TO service_role',
      audit_sequence
    );
  END IF;
END $$;

COMMENT ON TABLE public.admin_audit_log IS
  'Append-only audit trail for privileged operations and role changes.';
COMMENT ON FUNCTION public.log_user_role_change() IS
  'Trigger-only logger for INSERT, UPDATE, and DELETE operations on public.user_roles.';

-- 2. Make viewing identity immutable and authorize each browser transition.

CREATE OR REPLACE FUNCTION public.guard_viewing_status_transitions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL OR private.has_platform_admin(v_actor) THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.requester_id IS DISTINCT FROM OLD.requester_id
     OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'viewing identity cannot be changed'
      USING ERRCODE = '42501';
  END IF;

  IF v_actor = OLD.owner_id THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (
         (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'cancelled'))
         OR (OLD.status = 'confirmed' AND NEW.status IN ('completed', 'cancelled'))
       ) THEN
      RAISE EXCEPTION 'invalid listing-owner viewing status transition'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  IF v_actor = OLD.requester_id THEN
    IF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
       OR NEW.viewing_type IS DISTINCT FROM OLD.viewing_type
       OR NEW.video_link IS DISTINCT FROM OLD.video_link
       OR NEW.note IS DISTINCT FROM OLD.note THEN
      RAISE EXCEPTION 'only the listing owner can manage viewing host details'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (
         OLD.status IN ('pending', 'confirmed')
         AND NEW.status = 'cancelled'
       ) THEN
      RAISE EXCEPTION 'requesters may only cancel an active viewing request'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'only viewing participants may update a viewing'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_viewing_status_transitions()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_viewing_status_transitions()
  TO service_role;

DROP TRIGGER IF EXISTS trg_guard_viewing_status_transitions ON public.viewings;
CREATE TRIGGER trg_guard_viewing_status_transitions
  BEFORE UPDATE ON public.viewings
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_viewing_status_transitions();

DROP POLICY IF EXISTS "Authenticated users can request viewings" ON public.viewings;
DROP POLICY IF EXISTS viewings_insert ON public.viewings;
CREATE POLICY viewings_insert
  ON public.viewings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.has_platform_admin((SELECT auth.uid()))
    OR (
      requester_id = (SELECT auth.uid())
      AND status = 'pending'
      AND EXISTS (
        SELECT 1
        FROM public.listings listing
        WHERE listing.id = viewings.listing_id
          AND listing.owner_id = viewings.owner_id
      )
    )
  );

DROP POLICY IF EXISTS "Users can update their viewings" ON public.viewings;
DROP POLICY IF EXISTS viewings_update ON public.viewings;
CREATE POLICY viewings_update
  ON public.viewings
  FOR UPDATE
  TO authenticated
  USING (
    private.has_platform_admin((SELECT auth.uid()))
    OR (SELECT auth.uid()) = owner_id
    OR (SELECT auth.uid()) = requester_id
  )
  WITH CHECK (
    private.has_platform_admin((SELECT auth.uid()))
    OR (SELECT auth.uid()) = owner_id
    OR (SELECT auth.uid()) = requester_id
  );

COMMENT ON FUNCTION public.guard_viewing_status_transitions() IS
  'Keeps viewing identities immutable and authorizes owner/requester status and host-detail updates.';

-- 3. Separate organization owner capabilities from organization admin rights.

DROP POLICY IF EXISTS organization_memberships_manage
  ON public.organization_memberships;
DROP POLICY IF EXISTS organization_memberships_manage_insert
  ON public.organization_memberships;
CREATE POLICY organization_memberships_manage_insert
  ON public.organization_memberships
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.has_platform_admin((SELECT auth.uid()))
    OR private.has_org_role(
      organization_id,
      ARRAY['owner'],
      (SELECT auth.uid())
    )
    OR (
      role <> 'owner'
      AND private.has_org_role(
        organization_id,
        ARRAY['admin'],
        (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS organization_memberships_manage_update
  ON public.organization_memberships;
CREATE POLICY organization_memberships_manage_update
  ON public.organization_memberships
  FOR UPDATE
  TO authenticated
  USING (
    private.has_platform_admin((SELECT auth.uid()))
    OR private.has_org_role(
      organization_id,
      ARRAY['owner'],
      (SELECT auth.uid())
    )
    OR (
      role <> 'owner'
      AND private.has_org_role(
        organization_id,
        ARRAY['admin'],
        (SELECT auth.uid())
      )
    )
  )
  WITH CHECK (
    private.has_platform_admin((SELECT auth.uid()))
    OR private.has_org_role(
      organization_id,
      ARRAY['owner'],
      (SELECT auth.uid())
    )
    OR (
      role <> 'owner'
      AND private.has_org_role(
        organization_id,
        ARRAY['admin'],
        (SELECT auth.uid())
      )
    )
  );

-- 4. Keep tenant governance and SSO enforcement service-controlled.

CREATE OR REPLACE FUNCTION private.guard_organization_governance_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL OR private.has_platform_admin(v_actor) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.plan <> 'free'
       OR NEW.procurement_status <> 'not_started'
       OR NEW.security_review_status <> 'not_started' THEN
      RAISE EXCEPTION 'organization governance fields require platform administration'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.plan IS DISTINCT FROM OLD.plan
        OR NEW.procurement_status IS DISTINCT FROM OLD.procurement_status
        OR NEW.security_review_status IS DISTINCT FROM OLD.security_review_status THEN
    RAISE EXCEPTION 'organization governance fields require platform administration'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_organization_governance_fields()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.guard_organization_governance_fields()
  TO service_role;

DROP TRIGGER IF EXISTS trg_guard_organization_governance_fields
  ON public.organizations;
CREATE TRIGGER trg_guard_organization_governance_fields
  BEFORE INSERT OR UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_organization_governance_fields();

CREATE OR REPLACE FUNCTION private.guard_organization_sso_enforcement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL OR private.has_platform_admin(v_actor) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.sso_required THEN
    RAISE EXCEPTION 'organization SSO enforcement requires platform administration'
      USING ERRCODE = '42501';
  ELSIF TG_OP = 'UPDATE'
        AND NEW.sso_required IS DISTINCT FROM OLD.sso_required THEN
    RAISE EXCEPTION 'organization SSO enforcement requires platform administration'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_organization_sso_enforcement()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.guard_organization_sso_enforcement()
  TO service_role;

DROP TRIGGER IF EXISTS trg_guard_organization_sso_enforcement
  ON public.organization_domains;
CREATE TRIGGER trg_guard_organization_sso_enforcement
  BEFORE INSERT OR UPDATE ON public.organization_domains
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_organization_sso_enforcement();

-- 5. Keep authenticated profile workflows intact while limiting anon reads.

REVOKE ALL ON TABLE public.profiles_public FROM PUBLIC, anon;
GRANT SELECT (user_id, display_name, avatar_url)
  ON TABLE public.profiles_public
  TO anon;
GRANT SELECT ON TABLE public.profiles_public
  TO authenticated;

-- Fail the migration if any browser-facing privilege or policy invariant drifts.

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.admin_audit_log', 'SELECT')
     OR has_table_privilege('anon', 'public.admin_audit_log', 'INSERT')
     OR has_table_privilege('authenticated', 'public.admin_audit_log', 'INSERT')
     OR has_table_privilege('authenticated', 'public.admin_audit_log', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.admin_audit_log', 'DELETE') THEN
    RAISE EXCEPTION 'browser roles must not write or anonymously read admin_audit_log';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.admin_audit_log', 'INSERT')
     OR has_table_privilege('service_role', 'public.admin_audit_log', 'UPDATE')
     OR has_table_privilege('service_role', 'public.admin_audit_log', 'DELETE') THEN
    RAISE EXCEPTION 'admin_audit_log service access must remain append-only';
  END IF;

  IF has_function_privilege(
       'anon',
       'public.log_user_role_change()'::regprocedure,
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.log_user_role_change()'::regprocedure,
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'log_user_role_change must not be browser-executable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'viewings'
      AND policyname = 'viewings_update'
      AND cmd = 'UPDATE'
      AND with_check IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'viewings_update must have an explicit WITH CHECK clause';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.user_roles'::regclass
      AND tgname = 'trg_user_roles_audit'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_user_roles_audit is missing';
  END IF;

  IF has_table_privilege('anon', 'public.profiles_public', 'SELECT')
     OR NOT has_column_privilege(
       'anon',
       'public.profiles_public',
       'user_id',
       'SELECT'
     )
     OR NOT has_column_privilege(
       'anon',
       'public.profiles_public',
       'display_name',
       'SELECT'
     )
     OR NOT has_column_privilege(
       'anon',
       'public.profiles_public',
       'avatar_url',
       'SELECT'
     )
     OR has_column_privilege(
       'anon',
       'public.profiles_public',
       'first_name',
       'SELECT'
     )
     OR has_column_privilege(
       'anon',
       'public.profiles_public',
       'last_name',
       'SELECT'
     )
     OR has_column_privilege(
       'anon',
       'public.profiles_public',
       'role',
       'SELECT'
     ) THEN
    RAISE EXCEPTION 'profiles_public anon column privileges are too broad';
  END IF;
END $$;
