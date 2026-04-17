-- Unify role naming: DB enum now matches participant_type and all frontend keys.
--
-- Before: role='individual'      participant_type='buyer'
--         role='seller_landlord' participant_type='seller'
--
-- After:  role='buyer'           participant_type='buyer'
--         role='seller'          participant_type='seller'
--
-- ALTER TYPE ... RENAME VALUE is safe in Postgres 10+:
--   existing rows are updated automatically (enum is stored by OID, not label).

ALTER TYPE public.user_role RENAME VALUE 'individual'     TO 'buyer';
ALTER TYPE public.user_role RENAME VALUE 'seller_landlord' TO 'seller';

-- ── Update default value on profiles.role ────────────────────────────────────
ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'buyer'::public.user_role;

-- ── Re-create get_listing_limit with new enum values ─────────────────────────
CREATE OR REPLACE FUNCTION public.get_listing_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_bio TEXT;
  v_product_id TEXT;
  v_is_pro BOOLEAN;
BEGIN
  SELECT role::TEXT, bio INTO v_role, v_bio
  FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
  SELECT subscription_product_id INTO v_product_id
  FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
  v_is_pro := (v_product_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pro_product_ids WHERE product_id = v_product_id
  ));

  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_user_id AND is_platform_admin = true) THEN
    RETURN 999;
  END IF;

  -- Seller (was seller_landlord)
  IF v_role = 'seller' OR (v_bio LIKE '__type:seller%') THEN
    RETURN CASE WHEN v_is_pro THEN 5 ELSE 2 END;
  END IF;

  -- Agent
  IF v_role = 'agent' OR (v_bio LIKE '__type:agent%') THEN
    RETURN CASE WHEN v_is_pro THEN 999 ELSE 5 END;
  END IF;

  -- Institutional, developer: unlimited
  IF v_role IN ('institutional', 'developer') THEN
    RETURN 999;
  END IF;

  RETURN 0;
END;
$$;

-- ── Re-create profiles_guard_admin_and_role with new enum values ─────────────
CREATE OR REPLACE FUNCTION public.profiles_guard_admin_and_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin THEN
    IF NOT public.has_platform_admin(auth.uid()) THEN
      NEW.is_platform_admin := OLD.is_platform_admin;
    END IF;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    DECLARE
      admin_only_roles public.user_role[] := ARRAY[
        'admin'::public.user_role,
        'professional'::public.user_role,
        'investor'::public.user_role,
        'institutional'::public.user_role
      ];
    BEGIN
      IF NEW.role = ANY(admin_only_roles) THEN
        IF NOT public.has_platform_admin(auth.uid()) THEN
          NEW.role := OLD.role;
        END IF;
      END IF;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- ── Re-create RLS UPDATE policy with new enum values ─────────────────────────
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      role = (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid())

      -- buyer may self-upgrade to seller, agent, or developer
      OR (
        (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid())
          = 'buyer'::public.user_role
        AND role IN (
          'seller'::public.user_role,
          'agent'::public.user_role,
          'developer'::public.user_role
        )
      )

      -- seller may revert to buyer
      OR (
        (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid())
          = 'seller'::public.user_role
        AND role = 'buyer'::public.user_role
      )

      OR public.has_platform_admin(auth.uid())
    )
  );

-- ── Re-create INSERT policy: new accounts default to buyer ───────────────────
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND role = 'buyer'::public.user_role
  );

-- ── Update participant_type backfill trigger (if still present) ──────────────
-- The backfill migration (20260522100000) set participant_type='buyer'/'seller'
-- from role='individual'/'seller_landlord'. After this rename the column values
-- are already correct — no data change needed. The trigger/function there only
-- ran at migration time so nothing to update.
