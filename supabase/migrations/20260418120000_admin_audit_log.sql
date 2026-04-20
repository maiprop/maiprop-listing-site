-- ─────────────────────────────────────────────────────────────────────────────
-- Admin audit log
-- Records every INSERT / UPDATE / DELETE on public.user_roles so that privilege
-- escalation can be traced after the fact. Also usable by future triggers on
-- other privileged tables (e.g. profiles.is_platform_admin, pricing_configs).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id           bigserial PRIMARY KEY,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  actor_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_id    uuid,
  entity       text NOT NULL,      -- e.g. 'user_roles', 'profiles.is_platform_admin'
  action       text NOT NULL,      -- 'INSERT' | 'UPDATE' | 'DELETE'
  old_data     jsonb,
  new_data     jsonb,
  reason       text
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target    ON public.admin_audit_log (target_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor     ON public.admin_audit_log (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_entity    ON public.admin_audit_log (entity, occurred_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Only platform admins can read the audit log. The `has_platform_admin()`
-- helper is defined by prior migrations; we fall back to checking user_roles
-- directly in case it was renamed.
DROP POLICY IF EXISTS admin_audit_log_select ON public.admin_audit_log;
CREATE POLICY admin_audit_log_select
  ON public.admin_audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

-- No INSERT/UPDATE/DELETE policies: the table is written to only by the
-- SECURITY DEFINER trigger below. Direct writes from clients are rejected.

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: capture every change to public.user_roles
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_user_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.admin_audit_log (actor_id, target_id, entity, action, new_data)
    VALUES (v_actor, NEW.user_id, 'user_roles', 'INSERT', to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO public.admin_audit_log (actor_id, target_id, entity, action, old_data, new_data)
    VALUES (v_actor, NEW.user_id, 'user_roles', 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO public.admin_audit_log (actor_id, target_id, entity, action, old_data)
    VALUES (v_actor, OLD.user_id, 'user_roles', 'DELETE', to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_roles_audit ON public.user_roles;
CREATE TRIGGER trg_user_roles_audit
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.log_user_role_change();

COMMENT ON TABLE public.admin_audit_log IS
  'Append-only audit trail of privilege changes. Writes only via SECURITY DEFINER triggers; reads restricted to platform admins.';
