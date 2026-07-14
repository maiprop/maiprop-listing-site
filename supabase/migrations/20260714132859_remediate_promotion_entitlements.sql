-- Forward-only promotion entitlement remediation.
--
-- Earlier promotion migrations have already run on staging. Keep their history
-- immutable and repair the durable runtime model here.

CREATE INDEX IF NOT EXISTS idx_listing_promotion_addon_purchase_id
  ON public.listing_promotion_allocations (addon_purchase_id);

CREATE INDEX IF NOT EXISTS idx_listing_promotion_billing_subscription_id
  ON public.listing_promotion_allocations (billing_subscription_id);

CREATE INDEX IF NOT EXISTS idx_listing_promotion_created_by
  ON public.listing_promotion_allocations (created_by);

-- The catalogue sorts the full active feed by Priority then recency. Priority
-- expiry is a projection filter, not a sort key. The Spotlight homepage filters
-- to active Spotlight rows and orders by recency.
DROP INDEX IF EXISTS public.idx_listings_priority_catalogue;
CREATE INDEX IF NOT EXISTS idx_listings_priority_catalogue
  ON public.listings (priority_placement DESC, created_at DESC, id DESC)
  WHERE status = 'active' AND is_off_market = false;

DROP INDEX IF EXISTS public.idx_listings_spotlight_catalogue;
CREATE INDEX IF NOT EXISTS idx_listings_spotlight_catalogue
  ON public.listings (created_at DESC, id DESC)
  INCLUDE (featured_until, listing_type)
  WHERE status = 'active' AND is_off_market = false AND is_featured = true;

CREATE OR REPLACE FUNCTION private.get_listing_promotion_plan_allowance(
  p_user_id uuid,
  p_promotion_type text
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role public.user_role;
  v_has_paid_plan boolean := false;
BEGIN
  IF p_promotion_type NOT IN ('spotlight', 'priority') THEN
    RETURN 0;
  END IF;

  IF public.has_platform_admin(p_user_id) THEN
    RETURN 999;
  END IF;

  v_role := public.authoritative_role(p_user_id);

  SELECT EXISTS (
    SELECT 1
    FROM public.billing_subscriptions bs
    JOIN public.profiles p ON p.user_id = bs.user_id
    WHERE bs.user_id = p_user_id
      AND bs.status = 'active'
      AND bs.runtime_mode = public.current_billing_runtime_mode()
      AND (bs.current_period_end IS NULL OR bs.current_period_end > now())
      AND bs.audience = public.profile_pricing_audience(
        p.role,
        p.participant_type::text
      )
      AND (
        (v_role::text = 'seller' AND bs.plan_key = 'pro')
        OR (v_role::text = 'agent' AND bs.plan_key = 'agent_basic')
        OR (v_role::text = 'developer' AND bs.plan_key = 'developer_pro')
      )
      AND p.subscription_product_id IS NOT NULL
      AND bs.stripe_product_id = p.subscription_product_id
  ) INTO v_has_paid_plan;

  IF NOT v_has_paid_plan THEN
    RETURN 0;
  END IF;

  IF p_promotion_type = 'spotlight' THEN
    RETURN CASE v_role::text
      WHEN 'seller' THEN 1
      WHEN 'developer' THEN 1
      ELSE 0
    END;
  END IF;

  RETURN CASE v_role::text
    WHEN 'agent' THEN 10
    WHEN 'developer' THEN 1
    ELSE 0
  END;
END;
$$;

REVOKE ALL ON FUNCTION private.get_listing_promotion_plan_allowance(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_listing_promotion_plan_allowance(uuid, text)
  TO service_role;

-- Preserve recognizable legacy Priority state as an independent admin grant.
-- This deliberately never reads Spotlight projection fields. Existing longer
-- legacy windows are retained, while short or elapsed inherited windows receive
-- at least 30 days from the explicit migration anchor.
CREATE OR REPLACE FUNCTION private.repair_legacy_priority_promotions(
  p_grant_started_at timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated integer := 0;
  v_inserted integer := 0;
BEGIN
  IF p_grant_started_at IS NULL THEN
    RAISE EXCEPTION 'legacy_priority_grant_anchor_required'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.listing_promotion_allocations legacy
  SET
    source_type = 'admin',
    status = 'active',
    billing_subscription_id = NULL,
    addon_purchase_id = NULL,
    plan_cycle_start = NULL,
    starts_at = LEAST(legacy.starts_at, p_grant_started_at),
    ends_at = GREATEST(
      legacy.ends_at,
      p_grant_started_at + interval '30 days'
    ),
    revoked_at = NULL,
    revoke_reason = NULL,
    updated_at = now()
  WHERE legacy.promotion_type = 'priority'
    AND legacy.request_key = 'legacy-admin-priority:' || legacy.listing_id::text
    AND legacy.status IN ('active', 'expired')
    AND legacy.revoke_reason IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.listing_promotion_allocations current_allocation
      WHERE current_allocation.listing_id = legacy.listing_id
        AND current_allocation.promotion_type = 'priority'
        AND current_allocation.status = 'active'
        AND current_allocation.id <> legacy.id
    );
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  INSERT INTO public.listing_promotion_allocations (
    listing_id,
    owner_id,
    promotion_type,
    source_type,
    request_key,
    starts_at,
    ends_at,
    created_by
  )
  SELECT
    listing.id,
    listing.owner_id,
    'priority',
    'admin',
    'legacy-admin-priority:' || listing.id::text,
    p_grant_started_at,
    p_grant_started_at + interval '30 days',
    listing.owner_id
  FROM public.listings listing
  WHERE listing.priority_placement > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.listing_promotion_allocations allocation
      WHERE allocation.listing_id = listing.id
        AND allocation.promotion_type = 'priority'
        AND allocation.status = 'active'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.listing_promotion_allocations prior_legacy
      WHERE prior_legacy.owner_id = listing.owner_id
        AND prior_legacy.request_key =
          'legacy-admin-priority:' || listing.id::text
        AND prior_legacy.promotion_type = 'priority'
    );
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN v_updated + v_inserted;
END;
$$;

SELECT private.repair_legacy_priority_promotions(
  transaction_timestamp()
);

REVOKE ALL ON FUNCTION private.repair_legacy_priority_promotions(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.repair_legacy_priority_promotions(timestamptz)
  TO service_role;

UPDATE public.listings
SET priority_placement = CASE WHEN priority_placement > 0 THEN 1 ELSE 0 END
WHERE priority_placement NOT IN (0, 1);

ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_priority_placement_boolean_check;
ALTER TABLE public.listings
  ADD CONSTRAINT listings_priority_placement_boolean_check
  CHECK (priority_placement IN (0, 1)) NOT VALID;
ALTER TABLE public.listings
  VALIDATE CONSTRAINT listings_priority_placement_boolean_check;

-- Remove the product-at-a-time API so callers cannot expose half-applied bundle
-- state across multiple transactions.
DROP FUNCTION IF EXISTS public.admin_set_listing_promotion(
  uuid,
  text,
  boolean,
  timestamptz,
  uuid
);
DROP FUNCTION IF EXISTS private.admin_set_listing_promotion(
  uuid,
  text,
  boolean,
  timestamptz,
  uuid
);

CREATE OR REPLACE FUNCTION private.admin_set_listing_promotions(
  p_listing_id uuid,
  p_spotlight_enabled boolean,
  p_spotlight_ends_at timestamptz,
  p_priority_enabled boolean,
  p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner_id uuid;
  v_now timestamptz := statement_timestamp();
BEGIN
  IF p_spotlight_enabled IS NULL AND p_priority_enabled IS NULL THEN
    RAISE EXCEPTION 'promotion_update_required' USING ERRCODE = '22023';
  END IF;
  IF p_spotlight_enabled = true
     AND p_spotlight_ends_at IS NOT NULL
     AND p_spotlight_ends_at <= v_now THEN
    RAISE EXCEPTION 'promotion_expiry_must_be_future' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_platform_admin(p_actor_id) THEN
    RAISE EXCEPTION 'platform_admin_required' USING ERRCODE = '42501';
  END IF;

  SELECT owner_id
  INTO v_owner_id
  FROM public.listings
  WHERE id = p_listing_id
  FOR UPDATE;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'listing_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.listing_promotion_allocations
  SET status = 'expired', updated_at = v_now
  WHERE listing_id = p_listing_id
    AND status = 'active'
    AND ends_at <= v_now
    AND (
      (p_spotlight_enabled IS NOT NULL AND promotion_type = 'spotlight')
      OR (p_priority_enabled IS NOT NULL AND promotion_type = 'priority')
    );

  IF p_spotlight_enabled = true THEN
    INSERT INTO public.listing_promotion_allocations (
      listing_id,
      owner_id,
      promotion_type,
      source_type,
      request_key,
      starts_at,
      ends_at,
      created_by
    ) VALUES (
      p_listing_id,
      v_owner_id,
      'spotlight',
      'admin',
      'admin:' || p_actor_id::text || ':' || gen_random_uuid()::text,
      v_now,
      COALESCE(p_spotlight_ends_at, v_now + interval '30 days'),
      p_actor_id
    )
    ON CONFLICT (listing_id, promotion_type) WHERE status = 'active'
    DO UPDATE SET
      owner_id = EXCLUDED.owner_id,
      source_type = 'admin',
      status = 'active',
      billing_subscription_id = NULL,
      addon_purchase_id = NULL,
      request_key = EXCLUDED.request_key,
      plan_cycle_start = NULL,
      starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at,
      revoked_at = NULL,
      revoke_reason = NULL,
      created_by = EXCLUDED.created_by,
      updated_at = v_now;
  ELSIF p_spotlight_enabled = false THEN
    UPDATE public.listing_promotion_allocations
    SET
      status = 'revoked',
      revoked_at = v_now,
      revoke_reason = 'admin_revoked',
      updated_at = v_now
    WHERE listing_id = p_listing_id
      AND promotion_type = 'spotlight'
      AND status = 'active';
  END IF;

  IF p_priority_enabled = true THEN
    INSERT INTO public.listing_promotion_allocations (
      listing_id,
      owner_id,
      promotion_type,
      source_type,
      request_key,
      starts_at,
      ends_at,
      created_by
    ) VALUES (
      p_listing_id,
      v_owner_id,
      'priority',
      'admin',
      'admin:' || p_actor_id::text || ':' || gen_random_uuid()::text,
      v_now,
      v_now + interval '30 days',
      p_actor_id
    )
    ON CONFLICT (listing_id, promotion_type) WHERE status = 'active'
    DO UPDATE SET
      owner_id = EXCLUDED.owner_id,
      source_type = 'admin',
      status = 'active',
      billing_subscription_id = NULL,
      addon_purchase_id = NULL,
      request_key = EXCLUDED.request_key,
      plan_cycle_start = NULL,
      starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at,
      revoked_at = NULL,
      revoke_reason = NULL,
      created_by = EXCLUDED.created_by,
      updated_at = v_now;
  ELSIF p_priority_enabled = false THEN
    UPDATE public.listing_promotion_allocations
    SET
      status = 'revoked',
      revoked_at = v_now,
      revoke_reason = 'admin_revoked',
      updated_at = v_now
    WHERE listing_id = p_listing_id
      AND promotion_type = 'priority'
      AND status = 'active';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_listing_promotions(
  p_listing_id uuid,
  p_spotlight_enabled boolean,
  p_spotlight_ends_at timestamptz,
  p_priority_enabled boolean,
  p_actor_id uuid
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
  SELECT private.admin_set_listing_promotions(
    p_listing_id,
    p_spotlight_enabled,
    p_spotlight_ends_at,
    p_priority_enabled,
    p_actor_id
  );
$$;

REVOKE ALL ON FUNCTION private.admin_set_listing_promotions(
  uuid,
  boolean,
  timestamptz,
  boolean,
  uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.admin_set_listing_promotions(
  uuid,
  boolean,
  timestamptz,
  boolean,
  uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.admin_set_listing_promotions(
  uuid,
  boolean,
  timestamptz,
  boolean,
  uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_listing_promotions(
  uuid,
  boolean,
  timestamptz,
  boolean,
  uuid
) TO service_role;

COMMENT ON FUNCTION public.admin_set_listing_promotions(
  uuid,
  boolean,
  timestamptz,
  boolean,
  uuid
) IS 'Atomically applies optional Spotlight and Priority administrator state through the promotion allocation ledger.';
