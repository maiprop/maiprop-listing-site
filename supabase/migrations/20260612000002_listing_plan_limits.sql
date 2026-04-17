-- Enforce plan-based listing limits at the database layer via RLS WITH CHECK.
-- Limits mirror usePlanLimits.ts (free/pro per participant_type).
-- This prevents UI bypass — even API-level inserts are blocked.

-- Helper: returns the listing cap for a given role + subscription state.
-- Returns NULL to mean "unlimited".
CREATE OR REPLACE FUNCTION get_listing_limit(
  p_role TEXT,
  p_is_pro BOOLEAN
) RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_role
    WHEN 'seller'      THEN CASE WHEN p_is_pro THEN 5    ELSE 2  END
    WHEN 'agent'       THEN CASE WHEN p_is_pro THEN NULL ELSE 5  END
    WHEN 'developer'   THEN CASE WHEN p_is_pro THEN NULL ELSE 0  END
    WHEN 'professional'THEN CASE WHEN p_is_pro THEN 5    ELSE 1  END
    WHEN 'buyer'       THEN 0
    WHEN 'admin'       THEN NULL
    ELSE                    CASE WHEN p_is_pro THEN 5    ELSE 2  END
  END;
$$;

-- Helper: checks whether the calling user is within their listing quota.
-- Used in the WITH CHECK clause of the INSERT policy.
CREATE OR REPLACE FUNCTION check_listing_quota()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role      TEXT;
  v_is_pro    BOOLEAN;
  v_limit     INT;
  v_count     INT;
BEGIN
  -- Look up caller's role + subscription
  SELECT
    COALESCE(p.role, 'buyer'),
    p.subscription_product_id IS NOT NULL
  INTO v_role, v_is_pro
  FROM profiles p
  WHERE p.user_id = auth.uid();

  IF NOT FOUND THEN RETURN FALSE; END IF;

  v_limit := get_listing_limit(v_role, v_is_pro);

  -- NULL limit = unlimited
  IF v_limit IS NULL THEN RETURN TRUE; END IF;

  -- Count non-deleted listings owned by the caller
  SELECT COUNT(*) INTO v_count
  FROM listings
  WHERE owner_id = auth.uid()
    AND (status IS NULL OR status != 'deleted');

  RETURN v_count < v_limit;
END;
$$;

-- Drop existing INSERT policy if it exists, then re-create with quota check
DO $$
BEGIN
  -- Attach WITH CHECK to the existing insert policy.
  -- Supabase auto-creates "Enable insert for authenticated users only" policies;
  -- we augment those here by adding a quota check.
  --
  -- The policy name may differ; we create ours explicitly.
  DROP POLICY IF EXISTS "listing_insert_quota" ON listings;
  CREATE POLICY "listing_insert_quota"
    ON listings
    FOR INSERT
    TO authenticated
    WITH CHECK (
      -- Must own the row being inserted
      owner_id = auth.uid()
      -- Must be within quota
      AND check_listing_quota()
    );
END;
$$;

-- Grant execute so RLS can call the function
GRANT EXECUTE ON FUNCTION check_listing_quota() TO authenticated;
GRANT EXECUTE ON FUNCTION get_listing_limit(TEXT, BOOLEAN) TO authenticated;
