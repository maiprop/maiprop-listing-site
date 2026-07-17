-- Resolve current billing runtime behind a private, actor-only helper. The
-- public RPCs remain SECURITY INVOKER and cannot evaluate another user.

CREATE OR REPLACE FUNCTION private.has_current_investor_subscription_for_actor()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, private
AS $$
  SELECT COALESCE(
    (SELECT auth.uid()) IS NOT NULL
    AND private.has_investor_subscription_for_user((SELECT auth.uid())),
    FALSE
  )
$$;

REVOKE ALL ON FUNCTION private.has_current_investor_subscription_for_actor()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_current_investor_subscription_for_actor() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_current_investor_subscription(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = pg_catalog, public, private
AS $$
  SELECT COALESCE(
    p_user_id IS NOT NULL
    AND p_user_id = (SELECT auth.uid())
    AND private.has_current_investor_subscription_for_actor(),
    FALSE
  )
$$;

CREATE OR REPLACE FUNCTION public.has_current_investor_subscription()
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = pg_catalog, public, private
AS $$
  SELECT private.has_current_investor_subscription_for_actor()
$$;

REVOKE ALL ON FUNCTION public.has_current_investor_subscription(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_current_investor_subscription(uuid)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_current_investor_subscription()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_current_investor_subscription()
  TO authenticated, service_role;

COMMENT ON FUNCTION private.has_current_investor_subscription_for_actor() IS
  'Private actor-only managed investor entitlement check. Uses auth.uid() and the active billing runtime; it cannot evaluate an arbitrary user.';

DO $$
DECLARE
  investor_with_id regprocedure :=
    'public.has_current_investor_subscription(uuid)'::regprocedure;
  investor_self regprocedure :=
    'public.has_current_investor_subscription()'::regprocedure;
BEGIN
  IF has_function_privilege(
    'authenticated',
    'private.has_investor_subscription_for_user(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'browser must not execute arbitrary-user investor helper';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'private.has_current_investor_subscription_for_actor()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'browser must execute the actor-only investor helper';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE oid = investor_with_id AND prosecdef
  ) OR EXISTS (
    SELECT 1 FROM pg_proc WHERE oid = investor_self AND prosecdef
  ) THEN
    RAISE EXCEPTION 'public investor wrappers must remain security invoker';
  END IF;
END;
$$;
