-- =============================================================================
-- Fix stale enum references and admin-role logic gaps
--
-- Problems addressed:
--   1. profiles_insert (snake_case, from 20260604) still references
--      'individual'::user_role — renamed to 'buyer' in 20260608.
--      The 20260608 migration dropped "Users can insert their own profile"
--      but NOT "profiles_insert", leaving both coexisting with a dead enum ref.
--
--   2. profiles_update (snake_case, from 20260604) still references
--      'individual' and 'seller_landlord' — both renamed in 20260608.
--      Same problem: 20260608 dropped/re-created "Users can update their own
--      profile" but left "profiles_update" alive with dead enum values.
--
--   3. get_listing_limit() checks is_platform_admin = true for the admin
--      unlimited-listings path. Since 20260413 set is_platform_admin = false
--      for all admins and moved authority to role='admin', this path never
--      fires — admins get RETURN 0 (no quota) instead of 999 (unlimited).
--
--   4. pricing_configs INSERT/UPDATE/DELETE and sync_log SELECT policies use
--      has_role(uid, 'agent') which excludes the platform admin (role='admin').
--      Platform admin cannot manage pricing configs or read sync logs.
-- =============================================================================


-- ── 1 & 2. Drop stale snake_case policies left over from 20260604 ─────────────

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;

-- Re-create with correct current enum values ('buyer', 'seller').
-- These mirror 20260608 exactly, but via snake_case names that 20260608 missed.

CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT
  WITH CHECK (
    (select auth.uid()) = user_id
    AND role = 'buyer'::public.user_role
  );

CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK (
    (select auth.uid()) = user_id
    AND (
      role = (SELECT p.role FROM public.profiles p WHERE p.user_id = (select auth.uid()))

      -- buyer may self-upgrade to seller, agent, or developer
      OR (
        (SELECT p.role FROM public.profiles p WHERE p.user_id = (select auth.uid()))
          = 'buyer'::public.user_role
        AND role IN (
          'seller'::public.user_role,
          'agent'::public.user_role,
          'developer'::public.user_role
        )
      )

      -- seller may revert to buyer
      OR (
        (SELECT p.role FROM public.profiles p WHERE p.user_id = (select auth.uid()))
          = 'seller'::public.user_role
        AND role = 'buyer'::public.user_role
      )

      OR public.has_platform_admin((select auth.uid()))
    )
  );


-- ── 3. Fix get_listing_limit: check role='admin' instead of is_platform_admin ──

CREATE OR REPLACE FUNCTION public.get_listing_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role      TEXT;
  v_bio       TEXT;
  v_product_id TEXT;
  v_is_pro    BOOLEAN;
BEGIN
  SELECT role::TEXT, bio, subscription_product_id
    INTO v_role, v_bio, v_product_id
    FROM public.profiles
   WHERE user_id = p_user_id
   LIMIT 1;

  v_is_pro := (v_product_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pro_product_ids WHERE product_id = v_product_id
  ));

  -- Platform admin (role='admin'): unlimited
  IF v_role = 'admin' THEN
    RETURN 999;
  END IF;

  -- Seller
  IF v_role = 'seller' OR v_bio LIKE '__type:seller%' THEN
    RETURN CASE WHEN v_is_pro THEN 5 ELSE 2 END;
  END IF;

  -- Agent
  IF v_role = 'agent' OR v_bio LIKE '__type:agent%' THEN
    RETURN CASE WHEN v_is_pro THEN 999 ELSE 5 END;
  END IF;

  -- Institutional, developer: unlimited
  IF v_role IN ('institutional', 'developer') THEN
    RETURN 999;
  END IF;

  -- buyer / professional / investor / unknown: no listing quota
  RETURN 0;
END;
$$;


-- ── 4. pricing_configs: allow platform admin in addition to agent ─────────────

DROP POLICY IF EXISTS "Agents can insert pricing_configs" ON public.pricing_configs;
DROP POLICY IF EXISTS "Agents can update pricing_configs" ON public.pricing_configs;
DROP POLICY IF EXISTS "Agents can delete pricing_configs" ON public.pricing_configs;

CREATE POLICY "admin_or_agent_insert_pricing_configs"
  ON public.pricing_configs FOR INSERT
  WITH CHECK (
    public.has_role((select auth.uid()), 'agent'::public.user_role)
    OR public.has_platform_admin((select auth.uid()))
  );

CREATE POLICY "admin_or_agent_update_pricing_configs"
  ON public.pricing_configs FOR UPDATE
  USING (
    public.has_role((select auth.uid()), 'agent'::public.user_role)
    OR public.has_platform_admin((select auth.uid()))
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'agent'::public.user_role)
    OR public.has_platform_admin((select auth.uid()))
  );

CREATE POLICY "admin_or_agent_delete_pricing_configs"
  ON public.pricing_configs FOR DELETE
  USING (
    public.has_role((select auth.uid()), 'agent'::public.user_role)
    OR public.has_platform_admin((select auth.uid()))
  );


-- ── 4b. sync_log SELECT: also allow platform admin ───────────────────────────

DROP POLICY IF EXISTS "sync_log_select"      ON public.sync_log;
DROP POLICY IF EXISTS "Admins can view sync logs" ON public.sync_log;

CREATE POLICY "sync_log_select" ON public.sync_log FOR SELECT
  USING (
    public.has_role((select auth.uid()), 'agent'::public.user_role)
    OR public.has_platform_admin((select auth.uid()))
  );
