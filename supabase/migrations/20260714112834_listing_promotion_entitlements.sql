-- Server-owned listing promotion entitlements.
--
-- Business contract:
--   Spotlight: EUR 39 / 30 days, visual placement only.
--   Priority:  EUR 59 / 30 days, ranking only.
--   Bundle:    EUR 79 / 30 days, Spotlight + Priority.
--   Seller Pro:    1 Spotlight per calendar month.
--   Agent Pro:    10 Priority placements per calendar month.
--   Developer Pro: 1 Spotlight + 1 Priority per calendar month.
--   Trials receive no included promotion credits. Credits never roll over.
--
-- Stripe/webhooks remain the payment source of truth. addon_purchases and
-- billing_subscriptions are the durable verified ledgers. This migration adds
-- the operational allocation ledger and keeps listing columns as indexed read
-- projections so catalogue requests never join billing tables.

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS priority_until timestamptz;

COMMENT ON COLUMN public.listings.is_featured IS
  'Server-managed Spotlight projection. Do not write from browser clients.';
COMMENT ON COLUMN public.listings.featured_until IS
  'Server-managed Spotlight expiry projection.';
COMMENT ON COLUMN public.listings.priority_placement IS
  'Server-managed Priority projection: 1 while active, otherwise 0.';
COMMENT ON COLUMN public.listings.priority_until IS
  'Server-managed Priority expiry projection.';

CREATE TABLE IF NOT EXISTS public.listing_promotion_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  promotion_type text NOT NULL
    CHECK (promotion_type IN ('spotlight', 'priority')),
  source_type text NOT NULL
    CHECK (source_type IN ('plan', 'addon', 'admin')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'revoked')),
  billing_subscription_id uuid
    REFERENCES public.billing_subscriptions(id) ON DELETE SET NULL,
  addon_purchase_id uuid
    REFERENCES public.addon_purchases(id) ON DELETE SET NULL,
  request_key text NOT NULL,
  plan_cycle_start date,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (
    (source_type = 'plan' AND billing_subscription_id IS NOT NULL AND addon_purchase_id IS NULL)
    OR (source_type = 'addon' AND addon_purchase_id IS NOT NULL)
    OR (source_type = 'admin' AND billing_subscription_id IS NULL AND addon_purchase_id IS NULL)
  ),
  UNIQUE (owner_id, request_key, promotion_type)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_promotion_one_active_type
  ON public.listing_promotion_allocations (listing_id, promotion_type)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_listing_promotion_owner_cycle
  ON public.listing_promotion_allocations
    (owner_id, promotion_type, source_type, plan_cycle_start, created_at);

CREATE INDEX IF NOT EXISTS idx_listing_promotion_expiry
  ON public.listing_promotion_allocations (ends_at, listing_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_listings_spotlight_catalogue
  ON public.listings (is_featured DESC, featured_until DESC, created_at DESC, id DESC)
  WHERE status = 'active' AND is_off_market = false;

CREATE INDEX IF NOT EXISTS idx_listings_priority_catalogue
  ON public.listings (priority_placement DESC, priority_until DESC, created_at DESC, id DESC)
  WHERE status = 'active' AND is_off_market = false;

ALTER TABLE public.listing_promotion_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.listing_promotion_allocations FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.listing_promotion_allocations FROM authenticated;
GRANT SELECT ON public.listing_promotion_allocations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_promotion_allocations TO service_role;

DROP POLICY IF EXISTS listing_promotion_allocations_select_own
  ON public.listing_promotion_allocations;
CREATE POLICY listing_promotion_allocations_select_own
  ON public.listing_promotion_allocations
  FOR SELECT
  TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    OR public.has_platform_admin((SELECT auth.uid()))
  );

CREATE OR REPLACE FUNCTION private.touch_listing_promotion_allocation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_listing_promotion_allocation
  ON public.listing_promotion_allocations;
CREATE TRIGGER trg_touch_listing_promotion_allocation
  BEFORE UPDATE ON public.listing_promotion_allocations
  FOR EACH ROW EXECUTE FUNCTION private.touch_listing_promotion_allocation();

-- Projection writes are never a browser capability. Inserts may carry the
-- harmless defaults for backwards compatibility, but any attempt to promote a
-- listing or alter an expiry through the Data API is rejected.
CREATE OR REPLACE FUNCTION private.guard_listing_promotion_projection()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_privileged boolean := current_user = ANY (
    ARRAY['postgres', 'service_role', 'supabase_admin']::name[]
  );
BEGIN
  IF v_privileged THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_featured, false)
       OR NEW.featured_until IS NOT NULL
       OR COALESCE(NEW.priority_placement, 0) <> 0
       OR NEW.priority_until IS NOT NULL THEN
      RAISE EXCEPTION 'listing_promotion_fields_are_server_managed'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_featured IS DISTINCT FROM OLD.is_featured
     OR NEW.featured_until IS DISTINCT FROM OLD.featured_until
     OR NEW.priority_placement IS DISTINCT FROM OLD.priority_placement
     OR NEW.priority_until IS DISTINCT FROM OLD.priority_until THEN
    RAISE EXCEPTION 'listing_promotion_fields_are_server_managed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_listing_promotion_projection_insert
  ON public.listings;
CREATE TRIGGER trg_guard_listing_promotion_projection_insert
  BEFORE INSERT ON public.listings
  FOR EACH ROW EXECUTE FUNCTION private.guard_listing_promotion_projection();

DROP TRIGGER IF EXISTS trg_guard_listing_promotion_projection_update
  ON public.listings;
CREATE TRIGGER trg_guard_listing_promotion_projection_update
  BEFORE UPDATE OF is_featured, featured_until, priority_placement, priority_until
  ON public.listings
  FOR EACH ROW EXECUTE FUNCTION private.guard_listing_promotion_projection();

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
      AND (
        p.subscription_product_id IS NULL
        OR bs.stripe_product_id = p.subscription_product_id
      )
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

CREATE OR REPLACE FUNCTION private.sync_listing_promotion_projection(
  p_listing_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_spotlight_until timestamptz;
  v_priority_until timestamptz;
BEGIN
  SELECT
    max(ends_at) FILTER (WHERE promotion_type = 'spotlight'),
    max(ends_at) FILTER (WHERE promotion_type = 'priority')
  INTO v_spotlight_until, v_priority_until
  FROM public.listing_promotion_allocations
  WHERE listing_id = p_listing_id
    AND status = 'active'
    AND ends_at > now();

  UPDATE public.listings
  SET
    is_featured = v_spotlight_until IS NOT NULL,
    featured_until = v_spotlight_until,
    priority_placement = CASE WHEN v_priority_until IS NULL THEN 0 ELSE 1 END,
    priority_until = v_priority_until
  WHERE id = p_listing_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_listing_promotion_projection_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM private.sync_listing_promotion_projection(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.listing_id ELSE NEW.listing_id END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_listing_promotion_projection
  ON public.listing_promotion_allocations;
CREATE TRIGGER trg_sync_listing_promotion_projection
  AFTER INSERT OR UPDATE OR DELETE ON public.listing_promotion_allocations
  FOR EACH ROW EXECUTE FUNCTION private.sync_listing_promotion_projection_trigger();

CREATE OR REPLACE FUNCTION public.activate_listing_promotion(
  p_listing_id uuid,
  p_promotion_type text,
  p_request_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_owner_id uuid;
  v_role public.user_role;
  v_subscription_id uuid;
  v_cycle_start date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  v_ends_at timestamptz := now() + interval '30 days';
  v_spotlight_allowance integer := 0;
  v_priority_allowance integer := 0;
  v_spotlight_used integer := 0;
  v_priority_used integer := 0;
  v_spotlight_source text;
  v_priority_source text;
  v_spotlight_purchase_id uuid;
  v_priority_purchase_id uuid;
  v_bundle_purchase_id uuid;
  v_existing_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
  END IF;
  IF p_promotion_type NOT IN ('spotlight', 'priority', 'bundle') THEN
    RAISE EXCEPTION 'invalid_promotion_type' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_request_key), '') IS NULL OR length(p_request_key) > 200 THEN
    RAISE EXCEPTION 'invalid_promotion_request_key' USING ERRCODE = '22023';
  END IF;

  SELECT owner_id
  INTO v_owner_id
  FROM public.listings
  WHERE id = p_listing_id
    AND status = 'active'
    AND is_off_market = false
  FOR UPDATE;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'listing_not_available' USING ERRCODE = 'P0002';
  END IF;
  IF v_owner_id <> v_user_id AND NOT public.has_platform_admin(v_user_id) THEN
    RAISE EXCEPTION 'listing_promotion_forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('listing_promotion:' || p_listing_id::text, 0)
  );

  -- Idempotent retries return the already-created allocation set.
  SELECT count(*)::integer
  INTO v_existing_count
  FROM public.listing_promotion_allocations
  WHERE owner_id = v_owner_id
    AND request_key = p_request_key;

  IF v_existing_count > 0 THEN
    RETURN jsonb_build_object(
      'listing_id', p_listing_id,
      'request_key', p_request_key,
      'allocations', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'type', promotion_type,
            'status', status,
            'source', source_type,
            'ends_at', ends_at
          ) ORDER BY promotion_type
        )
        FROM public.listing_promotion_allocations
        WHERE owner_id = v_owner_id
          AND request_key = p_request_key
      )
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.listing_promotion_allocations
    WHERE listing_id = p_listing_id
      AND status = 'active'
      AND ends_at > now()
      AND (
        (p_promotion_type = 'spotlight' AND promotion_type = 'spotlight')
        OR (p_promotion_type = 'priority' AND promotion_type = 'priority')
        OR (p_promotion_type = 'bundle')
      )
  ) THEN
    RAISE EXCEPTION 'listing_promotion_already_active' USING ERRCODE = '23505';
  END IF;

  v_role := public.authoritative_role(v_owner_id);
  v_spotlight_allowance := private.get_listing_promotion_plan_allowance(
    v_owner_id,
    'spotlight'
  );
  v_priority_allowance := private.get_listing_promotion_plan_allowance(
    v_owner_id,
    'priority'
  );

  SELECT count(*)::integer
  INTO v_spotlight_used
  FROM public.listing_promotion_allocations
  WHERE owner_id = v_owner_id
    AND promotion_type = 'spotlight'
    AND source_type = 'plan'
    AND plan_cycle_start = v_cycle_start;

  SELECT count(*)::integer
  INTO v_priority_used
  FROM public.listing_promotion_allocations
  WHERE owner_id = v_owner_id
    AND promotion_type = 'priority'
    AND source_type = 'plan'
    AND plan_cycle_start = v_cycle_start;

  SELECT bs.id
  INTO v_subscription_id
  FROM public.billing_subscriptions bs
  JOIN public.profiles p ON p.user_id = bs.user_id
  WHERE bs.user_id = v_owner_id
    AND bs.status = 'active'
    AND bs.runtime_mode = public.current_billing_runtime_mode()
    AND (bs.current_period_end IS NULL OR bs.current_period_end > now())
    AND bs.audience = public.profile_pricing_audience(
      p.role,
      p.participant_type::text
    )
  ORDER BY bs.updated_at DESC, bs.id DESC
  LIMIT 1;

  IF public.has_platform_admin(v_owner_id) THEN
    IF p_promotion_type IN ('spotlight', 'bundle') THEN
      v_spotlight_source := 'admin';
    END IF;
    IF p_promotion_type IN ('priority', 'bundle') THEN
      v_priority_source := 'admin';
    END IF;
  ELSIF p_promotion_type = 'bundle'
    AND v_spotlight_used < v_spotlight_allowance
    AND v_priority_used < v_priority_allowance THEN
    v_spotlight_source := 'plan';
    v_priority_source := 'plan';
  ELSIF p_promotion_type = 'bundle' THEN
    SELECT id
    INTO v_bundle_purchase_id
    FROM public.addon_purchases
    WHERE user_id = v_owner_id
      AND addon_key = 'featured_priority_bundle'
      AND status IN ('paid', 'active')
      AND runtime_mode = public.current_billing_runtime_mode()
      AND credits_consumed < credits_granted - COALESCE(credits_refunded, 0)
    ORDER BY created_at ASC, id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF v_bundle_purchase_id IS NOT NULL THEN
      UPDATE public.addon_purchases
      SET credits_consumed = credits_consumed + 1
      WHERE id = v_bundle_purchase_id
        AND credits_consumed < credits_granted - COALESCE(credits_refunded, 0);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'promotion_entitlement_concurrent_use';
      END IF;
      v_spotlight_source := 'addon';
      v_priority_source := 'addon';
      v_spotlight_purchase_id := v_bundle_purchase_id;
      v_priority_purchase_id := v_bundle_purchase_id;
    END IF;
  END IF;

  IF p_promotion_type IN ('spotlight', 'bundle')
     AND v_spotlight_source IS NULL THEN
    IF v_spotlight_used < v_spotlight_allowance THEN
      v_spotlight_source := 'plan';
    ELSE
      SELECT id
      INTO v_spotlight_purchase_id
      FROM public.addon_purchases
      WHERE user_id = v_owner_id
        AND addon_key = 'featured_listing'
        AND status IN ('paid', 'active')
        AND runtime_mode = public.current_billing_runtime_mode()
        AND credits_consumed < credits_granted - COALESCE(credits_refunded, 0)
      ORDER BY created_at ASC, id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1;

      IF v_spotlight_purchase_id IS NULL THEN
        RAISE EXCEPTION 'spotlight_entitlement_required' USING ERRCODE = '42501';
      END IF;
      UPDATE public.addon_purchases
      SET credits_consumed = credits_consumed + 1
      WHERE id = v_spotlight_purchase_id
        AND credits_consumed < credits_granted - COALESCE(credits_refunded, 0);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'promotion_entitlement_concurrent_use';
      END IF;
      v_spotlight_source := 'addon';
    END IF;
  END IF;

  IF p_promotion_type IN ('priority', 'bundle')
     AND v_priority_source IS NULL THEN
    IF v_priority_used < v_priority_allowance THEN
      v_priority_source := 'plan';
    ELSE
      SELECT id
      INTO v_priority_purchase_id
      FROM public.addon_purchases
      WHERE user_id = v_owner_id
        AND addon_key = 'priority_placement'
        AND status IN ('paid', 'active')
        AND runtime_mode = public.current_billing_runtime_mode()
        AND credits_consumed < credits_granted - COALESCE(credits_refunded, 0)
      ORDER BY created_at ASC, id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1;

      IF v_priority_purchase_id IS NULL THEN
        RAISE EXCEPTION 'priority_entitlement_required' USING ERRCODE = '42501';
      END IF;
      UPDATE public.addon_purchases
      SET credits_consumed = credits_consumed + 1
      WHERE id = v_priority_purchase_id
        AND credits_consumed < credits_granted - COALESCE(credits_refunded, 0);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'promotion_entitlement_concurrent_use';
      END IF;
      v_priority_source := 'addon';
    END IF;
  END IF;

  IF p_promotion_type IN ('spotlight', 'bundle') THEN
    INSERT INTO public.listing_promotion_allocations (
      listing_id,
      owner_id,
      promotion_type,
      source_type,
      billing_subscription_id,
      addon_purchase_id,
      request_key,
      plan_cycle_start,
      starts_at,
      ends_at,
      created_by
    ) VALUES (
      p_listing_id,
      v_owner_id,
      'spotlight',
      v_spotlight_source,
      CASE WHEN v_spotlight_source = 'plan' THEN v_subscription_id ELSE NULL END,
      v_spotlight_purchase_id,
      p_request_key,
      CASE WHEN v_spotlight_source = 'plan' THEN v_cycle_start ELSE NULL END,
      now(),
      v_ends_at,
      v_user_id
    );
  END IF;

  IF p_promotion_type IN ('priority', 'bundle') THEN
    INSERT INTO public.listing_promotion_allocations (
      listing_id,
      owner_id,
      promotion_type,
      source_type,
      billing_subscription_id,
      addon_purchase_id,
      request_key,
      plan_cycle_start,
      starts_at,
      ends_at,
      created_by
    ) VALUES (
      p_listing_id,
      v_owner_id,
      'priority',
      v_priority_source,
      CASE WHEN v_priority_source = 'plan' THEN v_subscription_id ELSE NULL END,
      v_priority_purchase_id,
      p_request_key,
      CASE WHEN v_priority_source = 'plan' THEN v_cycle_start ELSE NULL END,
      now(),
      v_ends_at,
      v_user_id
    );
  END IF;

  RETURN jsonb_build_object(
    'listing_id', p_listing_id,
    'request_key', p_request_key,
    'ends_at', v_ends_at,
    'spotlight', p_promotion_type IN ('spotlight', 'bundle'),
    'priority', p_promotion_type IN ('priority', 'bundle')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_listing_promotion(
  p_listing_id uuid,
  p_promotion_type text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_owner_id uuid;
  v_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
  END IF;
  IF p_promotion_type NOT IN ('spotlight', 'priority', 'bundle') THEN
    RAISE EXCEPTION 'invalid_promotion_type' USING ERRCODE = '22023';
  END IF;

  SELECT owner_id INTO v_owner_id
  FROM public.listings
  WHERE id = p_listing_id
  FOR UPDATE;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'listing_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_owner_id <> v_user_id AND NOT public.has_platform_admin(v_user_id) THEN
    RAISE EXCEPTION 'listing_promotion_forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.listing_promotion_allocations
  SET
    status = 'revoked',
    revoked_at = now(),
    revoke_reason = 'owner_deactivated'
  WHERE listing_id = p_listing_id
    AND status = 'active'
    AND (
      p_promotion_type = 'bundle'
      OR promotion_type = p_promotion_type
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_listing_promotion_balance()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_cycle_start date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  v_spotlight_allowance integer;
  v_priority_allowance integer;
  v_spotlight_used integer;
  v_priority_used integer;
  v_spotlight_addons integer;
  v_priority_addons integer;
  v_bundle_addons integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
  END IF;

  v_spotlight_allowance := private.get_listing_promotion_plan_allowance(
    v_user_id,
    'spotlight'
  );
  v_priority_allowance := private.get_listing_promotion_plan_allowance(
    v_user_id,
    'priority'
  );

  SELECT count(*)::integer
  INTO v_spotlight_used
  FROM public.listing_promotion_allocations
  WHERE owner_id = v_user_id
    AND promotion_type = 'spotlight'
    AND source_type = 'plan'
    AND plan_cycle_start = v_cycle_start;

  SELECT count(*)::integer
  INTO v_priority_used
  FROM public.listing_promotion_allocations
  WHERE owner_id = v_user_id
    AND promotion_type = 'priority'
    AND source_type = 'plan'
    AND plan_cycle_start = v_cycle_start;

  SELECT
    COALESCE(sum(credits_granted - credits_consumed - credits_refunded)
      FILTER (WHERE addon_key = 'featured_listing'), 0)::integer,
    COALESCE(sum(credits_granted - credits_consumed - credits_refunded)
      FILTER (WHERE addon_key = 'priority_placement'), 0)::integer,
    COALESCE(sum(credits_granted - credits_consumed - credits_refunded)
      FILTER (WHERE addon_key = 'featured_priority_bundle'), 0)::integer
  INTO v_spotlight_addons, v_priority_addons, v_bundle_addons
  FROM public.addon_purchases
  WHERE user_id = v_user_id
    AND status IN ('paid', 'active')
    AND runtime_mode = public.current_billing_runtime_mode();

  RETURN jsonb_build_object(
    'cycle_start', v_cycle_start,
    'spotlight', jsonb_build_object(
      'included', v_spotlight_allowance,
      'used', v_spotlight_used,
      'remaining', GREATEST(v_spotlight_allowance - v_spotlight_used, 0),
      'addons', GREATEST(v_spotlight_addons, 0)
    ),
    'priority', jsonb_build_object(
      'included', v_priority_allowance,
      'used', v_priority_used,
      'remaining', GREATEST(v_priority_allowance - v_priority_used, 0),
      'addons', GREATEST(v_priority_addons, 0)
    ),
    'bundles', jsonb_build_object(
      'addons', GREATEST(v_bundle_addons, 0)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_listing_promotion(
  p_listing_id uuid,
  p_promotion_type text,
  p_enabled boolean,
  p_ends_at timestamptz,
  p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  IF p_promotion_type NOT IN ('spotlight', 'priority') THEN
    RAISE EXCEPTION 'invalid_promotion_type' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_platform_admin(p_actor_id) THEN
    RAISE EXCEPTION 'platform_admin_required' USING ERRCODE = '42501';
  END IF;

  SELECT owner_id INTO v_owner_id
  FROM public.listings
  WHERE id = p_listing_id
  FOR UPDATE;
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'listing_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_enabled THEN
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
      p_promotion_type,
      'admin',
      'admin:' || p_actor_id::text || ':' || gen_random_uuid()::text,
      now(),
      COALESCE(p_ends_at, now() + interval '30 days'),
      p_actor_id
    )
    ON CONFLICT (listing_id, promotion_type) WHERE status = 'active'
    DO UPDATE SET
      ends_at = EXCLUDED.ends_at,
      revoked_at = NULL,
      revoke_reason = NULL,
      updated_at = now();
  ELSE
    UPDATE public.listing_promotion_allocations
    SET
      status = 'revoked',
      revoked_at = now(),
      revoke_reason = 'admin_revoked'
    WHERE listing_id = p_listing_id
      AND promotion_type = p_promotion_type
      AND status = 'active';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_listing_promotions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.listing_promotion_allocations
  SET status = 'expired', updated_at = now()
  WHERE status = 'active'
    AND ends_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Keep the legacy cron entry stable while moving expiry ownership to the
-- allocation ledger.
CREATE OR REPLACE FUNCTION public.expire_featured_listings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.expire_listing_promotions();
END;
$$;

CREATE OR REPLACE FUNCTION private.revoke_refunded_listing_promotions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'refunded'
     OR NEW.refund_status = 'refunded'
     OR NEW.credits_refunded >= NEW.credits_granted THEN
    UPDATE public.listing_promotion_allocations
    SET
      status = 'revoked',
      revoked_at = now(),
      revoke_reason = 'stripe_refund'
    WHERE addon_purchase_id = NEW.id
      AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_revoke_refunded_listing_promotions
  ON public.addon_purchases;
CREATE TRIGGER trg_revoke_refunded_listing_promotions
  AFTER UPDATE OF status, refund_status, credits_refunded
  ON public.addon_purchases
  FOR EACH ROW EXECUTE FUNCTION private.revoke_refunded_listing_promotions();

-- Promotion purchases become one operational credit each. Bundle credits are
-- consumed once and create one Spotlight plus one Priority allocation.
CREATE OR REPLACE FUNCTION public.addon_credit_units(
  p_addon_key text,
  p_quantity integer DEFAULT 1
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT GREATEST(COALESCE(p_quantity, 1), 1) * CASE p_addon_key
    WHEN 'valuation_single' THEN 1
    WHEN 'valuation_bundle' THEN 5
    WHEN 'neighbourhood_report_single' THEN 1
    WHEN 'neighbourhood_report_bundle' THEN 3
    WHEN 'property_report_single' THEN 1
    WHEN 'featured_listing' THEN 1
    WHEN 'priority_placement' THEN 1
    WHEN 'featured_priority_bundle' THEN 1
    ELSE 0
  END
$$;

-- Preserve existing administrator-managed promotions as explicit 30-day admin
-- grants. Any non-admin orphaned projection is removed by the sync pass below.
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
  l.id,
  l.owner_id,
  'spotlight',
  'admin',
  'legacy-admin-spotlight:' || l.id::text,
  now(),
  COALESCE(l.featured_until, now() + interval '30 days'),
  l.owner_id
FROM public.listings l
WHERE l.is_featured = true
  AND public.has_platform_admin(l.owner_id)
ON CONFLICT DO NOTHING;

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
  l.id,
  l.owner_id,
  'priority',
  'admin',
  'legacy-admin-priority:' || l.id::text,
  now(),
  COALESCE(l.priority_until, l.featured_until, now() + interval '30 days'),
  l.owner_id
FROM public.listings l
WHERE l.priority_placement > 0
  AND public.has_platform_admin(l.owner_id)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_listing_id uuid;
BEGIN
  FOR v_listing_id IN
    SELECT id
    FROM public.listings
    WHERE is_featured = true
       OR featured_until IS NOT NULL
       OR priority_placement > 0
       OR priority_until IS NOT NULL
  LOOP
    PERFORM private.sync_listing_promotion_projection(v_listing_id);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION private.touch_listing_promotion_allocation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.guard_listing_promotion_projection() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.get_listing_promotion_plan_allowance(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sync_listing_promotion_projection(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sync_listing_promotion_projection_trigger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.revoke_refunded_listing_promotions() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.activate_listing_promotion(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deactivate_listing_promotion(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_listing_promotion_balance() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_listing_promotion(uuid, text, boolean, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_listing_promotions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_featured_listings() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.activate_listing_promotion(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deactivate_listing_promotion(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_listing_promotion_balance() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_listing_promotion(uuid, text, boolean, timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_listing_promotions() TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_featured_listings() TO service_role;

COMMENT ON TABLE public.listing_promotion_allocations IS
  'Authoritative operational ledger for time-bounded Spotlight and Priority allocations. Browser writes are forbidden.';
COMMENT ON FUNCTION public.activate_listing_promotion(uuid, text, text) IS
  'Atomically consumes an included paid-plan allowance or verified Stripe add-on credit and activates a 30-day listing promotion.';
COMMENT ON FUNCTION public.get_listing_promotion_balance() IS
  'Returns the signed-in user monthly included promotion usage and verified add-on balances.';

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.listing_promotion_allocations', 'INSERT')
     OR has_table_privilege('authenticated', 'public.listing_promotion_allocations', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.listing_promotion_allocations', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated browser role can mutate promotion allocations';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.activate_listing_promotion(uuid,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anonymous role can activate listing promotions';
  END IF;
END $$;
