-- Forward-only reassertion for environments that already applied earlier
-- promotion migrations before the canonical listing-first lock order was fixed.

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

REVOKE ALL ON FUNCTION private.activate_listing_promotion(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.activate_listing_promotion(uuid, text, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.reconcile_plan_promotion_allocations(
  p_subscription_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reconciled integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('listing_promotion:' || candidate.listing_id::text, 0)
  )
  FROM (
    SELECT DISTINCT allocation.listing_id
    FROM public.listing_promotion_allocations AS allocation
    JOIN public.billing_subscriptions AS subscription
      ON subscription.id = allocation.billing_subscription_id
    WHERE allocation.source_type = 'plan'
      AND allocation.status = 'active'
      AND (p_subscription_id IS NULL OR subscription.id = p_subscription_id)
      AND (
        subscription.current_period_end IS NULL
        OR subscription.current_period_end <= statement_timestamp()
        OR subscription.status NOT IN ('active', 'trialing', 'past_due')
      )
    ORDER BY allocation.listing_id
  ) AS candidate;

  UPDATE public.listing_promotion_allocations AS allocation
  SET
    status = 'revoked',
    revoked_at = statement_timestamp(),
    revoke_reason = CASE
      WHEN subscription.current_period_end IS NULL
        OR subscription.current_period_end <= statement_timestamp()
        THEN 'subscription_entitlement_lapsed'
      ELSE 'subscription_entitlement_terminal'
    END,
    updated_at = statement_timestamp()
  FROM public.billing_subscriptions AS subscription
  WHERE allocation.billing_subscription_id = subscription.id
    AND allocation.source_type = 'plan'
    AND allocation.status = 'active'
    AND (
      p_subscription_id IS NULL
      OR subscription.id = p_subscription_id
    )
    AND (
      subscription.current_period_end IS NULL
      OR subscription.current_period_end <= statement_timestamp()
      OR subscription.status NOT IN ('active', 'trialing', 'past_due')
    );

  GET DIAGNOSTICS v_reconciled = ROW_COUNT;
  RETURN v_reconciled;
END;
$$;

REVOKE ALL ON FUNCTION private.reconcile_plan_promotion_allocations(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.expire_listing_promotions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM private.reconcile_plan_promotion_allocations(NULL);

  PERFORM pg_advisory_xact_lock(
    hashtextextended('listing_promotion:' || candidate.listing_id::text, 0)
  )
  FROM (
    SELECT DISTINCT allocation.listing_id
    FROM public.listing_promotion_allocations AS allocation
    WHERE allocation.status = 'active'
      AND allocation.ends_at <= statement_timestamp()
    ORDER BY allocation.listing_id
  ) AS candidate;

  UPDATE public.listing_promotion_allocations
  SET status = 'expired', updated_at = statement_timestamp()
  WHERE status = 'active'
    AND ends_at <= statement_timestamp();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_listing_promotions()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expire_listing_promotions()
  TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_addon_refund_event(
  p_purchase_id uuid,
  p_stripe_refund_id text,
  p_refunded_amount bigint,
  p_total_amount bigint,
  p_status text,
  p_runtime_mode text,
  p_livemode boolean,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_purchase public.addon_purchases%ROWTYPE;
  v_existing private.addon_refund_events%ROWTYPE;
  v_status text := lower(btrim(COALESCE(p_status, '')));
  v_successful_amount bigint := 0;
  v_credits_refunded integer := 0;
  v_refund_status text := 'none';
BEGIN
  IF p_purchase_id IS NULL OR NULLIF(btrim(p_stripe_refund_id), '') IS NULL THEN
    RAISE EXCEPTION 'addon_refund_identity_required' USING ERRCODE = '22023';
  END IF;

  IF p_refunded_amount IS NULL OR p_refunded_amount <= 0
     OR p_total_amount IS NULL OR p_total_amount <= 0
     OR p_refunded_amount > p_total_amount THEN
    RAISE EXCEPTION 'addon_refund_amount_invalid' USING ERRCODE = '22023';
  END IF;

  IF v_status NOT IN (
    'pending', 'requires_action', 'succeeded', 'failed', 'canceled'
  ) THEN
    RAISE EXCEPTION 'addon_refund_status_invalid' USING ERRCODE = '22023';
  END IF;

  IF p_runtime_mode <> public.current_billing_runtime_mode()
     OR p_livemode <> (p_runtime_mode = 'live') THEN
    RAISE EXCEPTION 'addon_refund_runtime_mismatch' USING ERRCODE = '22023';
  END IF;

  -- Activation also takes these locks before touching a purchase row. Lock
  -- all listings consumed by this purchase in UUID order so a refund cannot
  -- deadlock with concurrent activation or expiry.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('listing_promotion:' || candidate.listing_id::text, 0)
  )
  FROM (
    SELECT DISTINCT allocation.listing_id
    FROM public.listing_promotion_allocations AS allocation
    WHERE allocation.addon_purchase_id = p_purchase_id
    ORDER BY allocation.listing_id
  ) AS candidate;

  SELECT purchase.*
  INTO v_purchase
  FROM public.addon_purchases AS purchase
  WHERE purchase.id = p_purchase_id
  FOR UPDATE;

  IF v_purchase.id IS NULL THEN
    RAISE EXCEPTION 'addon_purchase_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_purchase.runtime_mode <> p_runtime_mode
     OR v_purchase.livemode <> p_livemode THEN
    RAISE EXCEPTION 'addon_refund_runtime_mismatch' USING ERRCODE = '22023';
  END IF;

  IF v_purchase.stripe_amount_total IS NOT NULL
     AND v_purchase.stripe_amount_total <> p_total_amount THEN
    RAISE EXCEPTION 'addon_refund_total_mismatch' USING ERRCODE = '22023';
  END IF;

  IF v_purchase.stripe_charge_id IS NOT NULL
     AND NULLIF(p_metadata ->> 'charge_id', '') IS NOT NULL
     AND v_purchase.stripe_charge_id <> p_metadata ->> 'charge_id' THEN
    RAISE EXCEPTION 'addon_refund_charge_mismatch' USING ERRCODE = '22023';
  END IF;

  IF v_purchase.stripe_invoice_id IS NOT NULL
     AND NULLIF(p_metadata ->> 'invoice_id', '') IS NOT NULL
     AND v_purchase.stripe_invoice_id <> p_metadata ->> 'invoice_id' THEN
    RAISE EXCEPTION 'addon_refund_invoice_mismatch' USING ERRCODE = '22023';
  END IF;

  SELECT refund_event.*
  INTO v_existing
  FROM private.addon_refund_events AS refund_event
  WHERE refund_event.runtime_mode = p_runtime_mode
    AND refund_event.stripe_refund_id = p_stripe_refund_id
  FOR UPDATE;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.purchase_id <> p_purchase_id
       OR v_existing.refunded_amount <> p_refunded_amount
       OR v_existing.total_amount <> p_total_amount
       OR v_existing.livemode <> p_livemode THEN
      RAISE EXCEPTION 'addon_refund_event_identity_mismatch'
        USING ERRCODE = '22023';
    END IF;

    UPDATE private.addon_refund_events
    SET
      status = CASE
        WHEN status = 'succeeded' THEN status
        ELSE v_status
      END,
      metadata = metadata || COALESCE(p_metadata, '{}'::jsonb),
      updated_at = transaction_timestamp()
    WHERE id = v_existing.id;
  ELSE
    INSERT INTO private.addon_refund_events (
      purchase_id,
      stripe_refund_id,
      refunded_amount,
      total_amount,
      status,
      runtime_mode,
      livemode,
      metadata
    ) VALUES (
      p_purchase_id,
      p_stripe_refund_id,
      p_refunded_amount,
      p_total_amount,
      v_status,
      p_runtime_mode,
      p_livemode,
      COALESCE(p_metadata, '{}'::jsonb)
    );
  END IF;

  SELECT LEAST(
    p_total_amount,
    COALESCE(sum(refund_event.refunded_amount), 0)::bigint
  )
  INTO v_successful_amount
  FROM private.addon_refund_events AS refund_event
  WHERE refund_event.purchase_id = p_purchase_id
    AND refund_event.status = 'succeeded';

  IF v_successful_amount > 0 THEN
    v_credits_refunded := LEAST(
      v_purchase.credits_granted,
      (
        (v_purchase.credits_granted::bigint * v_successful_amount)
        + p_total_amount - 1
      ) / p_total_amount
    )::integer;
  END IF;

  v_credits_refunded := GREATEST(
    v_purchase.credits_refunded,
    v_credits_refunded
  );

  v_refund_status := CASE
    WHEN v_credits_refunded >= v_purchase.credits_granted
      AND v_purchase.credits_granted > 0 THEN 'refunded'
    WHEN v_credits_refunded > 0 THEN 'partial_refund'
    WHEN EXISTS (
      SELECT 1
      FROM private.addon_refund_events AS refund_event
      WHERE refund_event.purchase_id = p_purchase_id
        AND refund_event.status = 'failed'
    ) THEN 'failed'
    ELSE 'none'
  END;

  UPDATE public.addon_purchases
  SET
    stripe_amount_total = COALESCE(stripe_amount_total, p_total_amount),
    stripe_charge_id = COALESCE(
      stripe_charge_id,
      NULLIF(p_metadata ->> 'charge_id', '')
    ),
    stripe_invoice_id = COALESCE(
      stripe_invoice_id,
      NULLIF(p_metadata ->> 'invoice_id', '')
    ),
    stripe_currency = COALESCE(
      stripe_currency,
      lower(NULLIF(p_metadata ->> 'currency', ''))
    ),
    credits_refunded = v_credits_refunded,
    refund_status = v_refund_status,
    status = CASE
      WHEN v_refund_status = 'refunded' THEN 'refunded'
      ELSE status
    END,
    last_refund_id = CASE
      WHEN v_status = 'succeeded' THEN p_stripe_refund_id
      ELSE last_refund_id
    END,
    refunded_at = CASE
      WHEN v_status = 'succeeded' THEN transaction_timestamp()
      ELSE refunded_at
    END,
    updated_at = transaction_timestamp()
  WHERE id = p_purchase_id;

  RETURN jsonb_build_object(
    'purchase_id', p_purchase_id,
    'refund_id', p_stripe_refund_id,
    'successful_refunded_amount', v_successful_amount,
    'credits_refunded', v_credits_refunded,
    'refund_status', v_refund_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_addon_refund_event(
  uuid, text, bigint, bigint, text, text, boolean, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_addon_refund_event(
  uuid, text, bigint, bigint, text, text, boolean, jsonb
) TO service_role;
