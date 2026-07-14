-- Review follow-up for the staging-applied promotion entitlement ledger.
-- Production also receives the corrected legacy backfill in the original
-- migration before this runtime hardening is applied.

-- A new build has exactly one canonical catalogue listing. Individual units
-- remain in project_units and never receive promotion allocations themselves.
CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_one_per_project
  ON public.listings (project_id)
  WHERE project_id IS NOT NULL;

COMMENT ON INDEX public.idx_listings_one_per_project IS
  'Canonical new-build promotion target: one listings row per project; project_units are not independently promoted.';

-- Promotion-consumed billing ledgers must agree with Stripe's livemode bit.
-- Backfill from livemode, which is populated directly from verified Stripe
-- payloads, before validating the constraints.
UPDATE public.billing_subscriptions
SET runtime_mode = CASE WHEN livemode THEN 'live' ELSE 'test' END
WHERE runtime_mode IS DISTINCT FROM CASE WHEN livemode THEN 'live' ELSE 'test' END;

ALTER TABLE public.billing_subscriptions
  DROP CONSTRAINT IF EXISTS billing_subscriptions_runtime_livemode_consistent;
ALTER TABLE public.billing_subscriptions
  ADD CONSTRAINT billing_subscriptions_runtime_livemode_consistent
  CHECK ((runtime_mode = 'live') = livemode) NOT VALID;
ALTER TABLE public.billing_subscriptions
  VALIDATE CONSTRAINT billing_subscriptions_runtime_livemode_consistent;

UPDATE public.addon_purchases
SET runtime_mode = CASE WHEN livemode THEN 'live' ELSE 'test' END
WHERE runtime_mode IS DISTINCT FROM CASE WHEN livemode THEN 'live' ELSE 'test' END;

ALTER TABLE public.addon_purchases
  DROP CONSTRAINT IF EXISTS addon_purchases_runtime_livemode_consistent;
ALTER TABLE public.addon_purchases
  ADD CONSTRAINT addon_purchases_runtime_livemode_consistent
  CHECK ((runtime_mode = 'live') = livemode) NOT VALID;
ALTER TABLE public.addon_purchases
  VALIDATE CONSTRAINT addon_purchases_runtime_livemode_consistent;

CREATE OR REPLACE FUNCTION private.activate_listing_promotion(
  p_listing_id uuid,
  p_promotion_type text,
  p_request_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_owner_id uuid;
  v_project_id uuid;
  v_project_owner_id uuid;
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
  v_existing_spotlight_count integer := 0;
  v_existing_priority_count integer := 0;
  v_existing_listing_matches boolean := true;
  v_expected_allocation_count integer;
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

  -- Every mutation that can project promotion state locks the canonical
  -- listing before taking row locks. This keeps activation, expiry, and
  -- Stripe refund reconciliation on one deadlock-safe lock order.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('listing_promotion:' || p_listing_id::text, 0)
  );

  SELECT listing.owner_id, listing.project_id, project.owner_id
  INTO v_owner_id, v_project_id, v_project_owner_id
  FROM public.listings AS listing
  LEFT JOIN public.projects AS project ON project.id = listing.project_id
  WHERE listing.id = p_listing_id
    AND listing.status = 'active'
    AND listing.is_off_market = false
  FOR UPDATE OF listing;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'listing_not_available' USING ERRCODE = 'P0002';
  END IF;
  IF v_project_id IS NOT NULL
     AND v_project_owner_id IS DISTINCT FROM v_owner_id THEN
    RAISE EXCEPTION 'listing_project_owner_mismatch'
      USING ERRCODE = '23514';
  END IF;
  IF v_owner_id <> v_user_id AND NOT public.has_platform_admin(v_user_id) THEN
    RAISE EXCEPTION 'listing_promotion_forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'listing_promotion_request:' || v_owner_id::text || ':' || p_request_key,
      0
    )
  );

  v_expected_allocation_count := CASE p_promotion_type
    WHEN 'bundle' THEN 2
    ELSE 1
  END;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE promotion_type = 'spotlight')::integer,
    count(*) FILTER (WHERE promotion_type = 'priority')::integer,
    COALESCE(bool_and(listing_id = p_listing_id), true)
  INTO
    v_existing_count,
    v_existing_spotlight_count,
    v_existing_priority_count,
    v_existing_listing_matches
  FROM public.listing_promotion_allocations
  WHERE owner_id = v_owner_id
    AND request_key = p_request_key;

  IF v_existing_count > 0 THEN
    IF NOT v_existing_listing_matches
       OR v_existing_count <> v_expected_allocation_count
       OR v_existing_spotlight_count <> (
         CASE WHEN p_promotion_type IN ('spotlight', 'bundle') THEN 1 ELSE 0 END
       )
       OR v_existing_priority_count <> (
         CASE WHEN p_promotion_type IN ('priority', 'bundle') THEN 1 ELSE 0 END
       ) THEN
      RAISE EXCEPTION 'promotion_request_key_conflict' USING ERRCODE = '23505';
    END IF;

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

  -- Release the active-row uniqueness slot before checking or inserting a
  -- renewal; cron remains a cleanup mechanism, not a correctness dependency.
  UPDATE public.listing_promotion_allocations
  SET status = 'expired', updated_at = now()
  WHERE listing_id = p_listing_id
    AND status = 'active'
    AND ends_at <= now();

  IF EXISTS (
    SELECT 1
    FROM public.listing_promotion_allocations
    WHERE listing_id = p_listing_id
      AND status = 'active'
      AND ends_at > now()
      AND (
        (p_promotion_type = 'spotlight' AND promotion_type = 'spotlight')
        OR (p_promotion_type = 'priority' AND promotion_type = 'priority')
        OR p_promotion_type = 'bundle'
      )
  ) THEN
    RAISE EXCEPTION 'listing_promotion_already_active' USING ERRCODE = '23505';
  END IF;

  -- Serialize the owner/type/calendar-cycle allowance independently of the
  -- listing lock so concurrent requests for different listings cannot both
  -- observe the same included credit.
  IF p_promotion_type IN ('spotlight', 'bundle') THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        'listing_promotion_plan:' || v_owner_id::text || ':spotlight:' ||
          v_cycle_start::text,
        0
      )
    );
  END IF;
  IF p_promotion_type IN ('priority', 'bundle') THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        'listing_promotion_plan:' || v_owner_id::text || ':priority:' ||
          v_cycle_start::text,
        0
      )
    );
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
    AND (
      (v_role::text = 'seller' AND bs.plan_key = 'pro')
      OR (v_role::text = 'agent' AND bs.plan_key = 'agent_basic')
      OR (v_role::text = 'developer' AND bs.plan_key = 'developer_pro')
    )
    AND (
      p.subscription_product_id IS NULL
      OR bs.stripe_product_id = p.subscription_product_id
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

CREATE OR REPLACE FUNCTION private.revoke_refunded_listing_promotions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_effective_refunded integer;
  v_already_refunded_count integer := 0;
  v_target_refunded_consumed integer := 0;
  v_credits_to_revoke integer := 0;
  v_revoked_credit_count integer := 0;
BEGIN
  v_effective_refunded := GREATEST(NEW.credits_refunded, OLD.credits_refunded);
  v_effective_refunded := LEAST(
    NEW.credits_granted,
    GREATEST(
      0,
      v_effective_refunded,
      CASE
        WHEN NEW.status = 'refunded' OR NEW.refund_status = 'refunded'
          THEN NEW.credits_granted
        ELSE 0
      END
    )
  );

  SELECT count(DISTINCT request_key)::integer
  INTO v_already_refunded_count
  FROM public.listing_promotion_allocations
  WHERE addon_purchase_id = NEW.id
    AND revoke_reason = 'stripe_refund';

  v_target_refunded_consumed := LEAST(
    v_effective_refunded,
    GREATEST(NEW.credits_consumed, 0) + v_already_refunded_count
  );
  v_credits_to_revoke := GREATEST(
    v_target_refunded_consumed - v_already_refunded_count,
    0
  );

  IF v_credits_to_revoke > 0 THEN
    WITH refundable_requests AS (
      SELECT request_key
      FROM public.listing_promotion_allocations
      WHERE addon_purchase_id = NEW.id
      GROUP BY request_key
      HAVING bool_and(revoke_reason IS DISTINCT FROM 'stripe_refund')
      ORDER BY
        bool_or(status = 'active') DESC,
        max(created_at) DESC,
        request_key DESC
      LIMIT v_credits_to_revoke
    ), revoked AS (
      UPDATE public.listing_promotion_allocations allocation
      SET
        status = 'revoked',
        revoked_at = now(),
        revoke_reason = 'stripe_refund'
      FROM refundable_requests request
      WHERE allocation.addon_purchase_id = NEW.id
        AND allocation.request_key = request.request_key
      RETURNING allocation.request_key
    )
    SELECT count(DISTINCT request_key)::integer
    INTO v_revoked_credit_count
    FROM revoked;
  END IF;

  IF v_revoked_credit_count > 0 THEN
    UPDATE public.addon_purchases
    SET credits_consumed = GREATEST(credits_consumed - v_revoked_credit_count, 0)
    WHERE id = NEW.id;
  END IF;

  IF NEW.credits_refunded <> v_effective_refunded THEN
    UPDATE public.addon_purchases
    SET credits_refunded = v_effective_refunded
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Move the service-only admin implementation behind an invoker-safe public
-- wrapper. The guard makes this safe to rerun after the wrapper exists.
DO $$
BEGIN
  IF to_regprocedure(
    'private.admin_set_listing_promotion(uuid,text,boolean,timestamp with time zone,uuid)'
  ) IS NULL
  AND to_regprocedure(
    'public.admin_set_listing_promotion(uuid,text,boolean,timestamp with time zone,uuid)'
  ) IS NOT NULL THEN
    ALTER FUNCTION public.admin_set_listing_promotion(
      uuid,
      text,
      boolean,
      timestamptz,
      uuid
    ) SET SCHEMA private;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.admin_set_listing_promotion(
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
    UPDATE public.listing_promotion_allocations
    SET status = 'expired', updated_at = now()
    WHERE listing_id = p_listing_id
      AND promotion_type = p_promotion_type
      AND status = 'active'
      AND ends_at <= now();

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

CREATE OR REPLACE FUNCTION public.admin_set_listing_promotion(
  p_listing_id uuid,
  p_promotion_type text,
  p_enabled boolean,
  p_ends_at timestamptz,
  p_actor_id uuid
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
  SELECT private.admin_set_listing_promotion(
    p_listing_id,
    p_promotion_type,
    p_enabled,
    p_ends_at,
    p_actor_id
  );
$$;

REVOKE ALL ON FUNCTION private.activate_listing_promotion(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.activate_listing_promotion(uuid, text, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION private.revoke_refunded_listing_promotions()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.sync_listing_promotion_projection(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION private.admin_set_listing_promotion(
  uuid,
  text,
  boolean,
  timestamptz,
  uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.admin_set_listing_promotion(
  uuid,
  text,
  boolean,
  timestamptz,
  uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.admin_set_listing_promotion(
  uuid,
  text,
  boolean,
  timestamptz,
  uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_listing_promotion(
  uuid,
  text,
  boolean,
  timestamptz,
  uuid
) TO service_role;

COMMENT ON FUNCTION public.admin_set_listing_promotion(
  uuid,
  text,
  boolean,
  timestamptz,
  uuid
) IS 'Invoker-safe service-role API wrapper for the private promotion ledger administrator.';
