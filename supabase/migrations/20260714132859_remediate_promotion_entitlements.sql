-- Idempotent promotion entitlement remediation for the undeployed branch.

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
SET search_path = ''
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
      AND bs.status IN ('active', 'past_due')
      AND bs.runtime_mode = public.current_billing_runtime_mode()
      AND bs.current_period_end IS NOT NULL
      AND bs.current_period_end > now()
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

CREATE TABLE IF NOT EXISTS private.legacy_listing_promotion_quarantine (
  listing_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  promotion_type text NOT NULL
    CHECK (promotion_type IN ('spotlight', 'priority')),
  observed_until timestamptz,
  first_observed_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  last_observed_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  resolution text NOT NULL DEFAULT 'pending'
    CHECK (resolution IN ('pending', 'migrated', 'cleared')),
  evidence_type text
    CHECK (evidence_type IS NULL OR evidence_type IN ('plan', 'addon', 'admin')),
  evidence_reference text,
  resolved_at timestamptz,
  PRIMARY KEY (listing_id, promotion_type)
);

REVOKE ALL ON TABLE private.legacy_listing_promotion_quarantine
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE private.legacy_listing_promotion_quarantine
  TO service_role;

CREATE OR REPLACE FUNCTION private.remediate_legacy_listing_promotions(
  p_observed_at timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_candidate record;
  v_bundle record;
  v_evidence_type text;
  v_evidence_reference text;
  v_subscription_id uuid;
  v_subscription_end timestamptz;
  v_addon_purchase_id uuid;
  v_audit_id bigint;
  v_audit_actor_id uuid;
  v_audit_end_text text;
  v_ends_at timestamptz;
  v_processed integer := 0;
BEGIN
  IF p_observed_at IS NULL THEN
    RAISE EXCEPTION 'legacy_promotion_observation_time_required'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO private.legacy_listing_promotion_quarantine (
    listing_id,
    owner_id,
    promotion_type,
    observed_until
  )
  SELECT listing.id, listing.owner_id, 'spotlight', listing.featured_until
  FROM public.listings AS listing
  WHERE listing.is_featured = true
    AND (listing.featured_until IS NULL OR listing.featured_until > p_observed_at)
  ON CONFLICT (listing_id, promotion_type) DO UPDATE
  SET
    owner_id = EXCLUDED.owner_id,
    observed_until = GREATEST(
      private.legacy_listing_promotion_quarantine.observed_until,
      EXCLUDED.observed_until
    ),
    last_observed_at = p_observed_at,
    resolution = 'pending',
    evidence_type = NULL,
    evidence_reference = NULL,
    resolved_at = NULL;

  INSERT INTO private.legacy_listing_promotion_quarantine (
    listing_id,
    owner_id,
    promotion_type,
    observed_until
  )
  SELECT listing.id, listing.owner_id, 'priority', listing.priority_until
  FROM public.listings AS listing
  WHERE listing.priority_placement > 0
    AND (listing.priority_until IS NULL OR listing.priority_until > p_observed_at)
  ON CONFLICT (listing_id, promotion_type) DO UPDATE
  SET
    owner_id = EXCLUDED.owner_id,
    observed_until = GREATEST(
      private.legacy_listing_promotion_quarantine.observed_until,
      EXCLUDED.observed_until
    ),
    last_observed_at = p_observed_at,
    resolution = 'pending',
    evidence_type = NULL,
    evidence_reference = NULL,
    resolved_at = NULL;

  INSERT INTO private.legacy_listing_promotion_quarantine (
    listing_id,
    owner_id,
    promotion_type,
    observed_until
  )
  SELECT
    allocation.listing_id,
    allocation.owner_id,
    allocation.promotion_type,
    allocation.ends_at
  FROM public.listing_promotion_allocations AS allocation
  WHERE allocation.request_key =
      'legacy-admin-' || allocation.promotion_type || ':' ||
      allocation.listing_id::text
  ON CONFLICT (listing_id, promotion_type) DO UPDATE
  SET
    owner_id = EXCLUDED.owner_id,
    observed_until = GREATEST(
      private.legacy_listing_promotion_quarantine.observed_until,
      EXCLUDED.observed_until
    ),
    last_observed_at = p_observed_at,
    resolution = 'pending',
    evidence_type = NULL,
    evidence_reference = NULL,
    resolved_at = NULL;

  UPDATE public.listing_promotion_allocations AS allocation
  SET
    status = CASE
      WHEN allocation.status = 'active' THEN 'revoked'
      ELSE allocation.status
    END,
    revoked_at = CASE
      WHEN allocation.status = 'active' THEN p_observed_at
      ELSE allocation.revoked_at
    END,
    revoke_reason = CASE
      WHEN allocation.status = 'active' THEN 'legacy_projection_unverified'
      ELSE allocation.revoke_reason
    END,
    created_by = NULL,
    updated_at = p_observed_at
  WHERE allocation.request_key =
    'legacy-admin-' || allocation.promotion_type || ':' ||
    allocation.listing_id::text;

  FOR v_candidate IN
    SELECT
      quarantine.listing_id,
      quarantine.owner_id,
      quarantine.promotion_type,
      quarantine.observed_until
    FROM private.legacy_listing_promotion_quarantine AS quarantine
    JOIN public.listings AS listing ON listing.id = quarantine.listing_id
    WHERE quarantine.resolution = 'pending'
      AND listing.owner_id = quarantine.owner_id
    ORDER BY quarantine.listing_id, quarantine.promotion_type
    FOR UPDATE OF quarantine
  LOOP
    v_evidence_type := NULL;
    v_evidence_reference := NULL;

    SELECT
      allocation.source_type,
      CASE allocation.source_type
        WHEN 'plan' THEN allocation.billing_subscription_id::text
        WHEN 'addon' THEN allocation.addon_purchase_id::text
        ELSE allocation.created_by::text
      END
    INTO v_evidence_type, v_evidence_reference
    FROM public.listing_promotion_allocations AS allocation
    LEFT JOIN public.billing_subscriptions AS subscription
      ON subscription.id = allocation.billing_subscription_id
    LEFT JOIN public.addon_purchases AS purchase
      ON purchase.id = allocation.addon_purchase_id
    LEFT JOIN public.profiles AS evidence_profile
      ON evidence_profile.user_id = allocation.owner_id
    WHERE allocation.listing_id = v_candidate.listing_id
      AND allocation.owner_id = v_candidate.owner_id
      AND allocation.promotion_type = v_candidate.promotion_type
      AND allocation.status = 'active'
      AND allocation.ends_at > p_observed_at
      AND (
        (
          allocation.source_type = 'plan'
          AND subscription.user_id = v_candidate.owner_id
          AND subscription.status IN ('active', 'past_due')
          AND subscription.current_period_end > p_observed_at
          AND subscription.runtime_mode = public.current_billing_runtime_mode()
          AND subscription.audience = public.profile_pricing_audience(
            evidence_profile.role,
            evidence_profile.participant_type::text
          )
          AND evidence_profile.subscription_product_id IS NOT NULL
          AND subscription.stripe_product_id =
            evidence_profile.subscription_product_id
          AND private.get_listing_promotion_plan_allowance(
            v_candidate.owner_id,
            v_candidate.promotion_type
          ) > 0
        )
        OR (
          allocation.source_type = 'addon'
          AND purchase.user_id = v_candidate.owner_id
          AND purchase.status IN ('paid', 'active')
          AND purchase.runtime_mode = public.current_billing_runtime_mode()
          AND COALESCE(purchase.credits_refunded, 0) < purchase.credits_granted
          AND purchase.credits_consumed > 0
          AND (
            purchase.addon_key = CASE allocation.promotion_type
              WHEN 'spotlight' THEN 'featured_listing'
              ELSE 'priority_placement'
            END
            OR (
              purchase.addon_key = 'featured_priority_bundle'
              AND EXISTS (
                SELECT 1
                FROM public.listing_promotion_allocations AS bundle_peer
                WHERE bundle_peer.listing_id = allocation.listing_id
                  AND bundle_peer.owner_id = allocation.owner_id
                  AND bundle_peer.request_key = allocation.request_key
                  AND bundle_peer.addon_purchase_id = allocation.addon_purchase_id
                  AND bundle_peer.promotion_type <> allocation.promotion_type
                  AND bundle_peer.status = 'active'
                  AND bundle_peer.ends_at > p_observed_at
              )
            )
          )
        )
        OR (
          allocation.source_type = 'admin'
          AND allocation.created_by IS NOT NULL
          AND allocation.created_by <> allocation.owner_id
          AND public.has_platform_admin(allocation.created_by)
        )
      )
    ORDER BY allocation.created_at, allocation.id
    LIMIT 1;

    IF v_evidence_type IS NOT NULL THEN
      UPDATE private.legacy_listing_promotion_quarantine
      SET
        resolution = 'migrated',
        evidence_type = v_evidence_type,
        evidence_reference = v_evidence_reference,
        resolved_at = p_observed_at
      WHERE listing_id = v_candidate.listing_id
        AND promotion_type = v_candidate.promotion_type;
      v_processed := v_processed + 1;
      CONTINUE;
    END IF;

    v_audit_id := NULL;
    v_audit_actor_id := NULL;
    v_audit_end_text := NULL;
    SELECT audit.id, audit.actor_id, audit.new_data ->> 'ends_at'
    INTO v_audit_id, v_audit_actor_id, v_audit_end_text
    FROM public.admin_audit_log AS audit
    WHERE audit.target_id = v_candidate.listing_id
      AND audit.entity = 'listing_promotion'
      AND upper(audit.action) = 'ENABLE'
      AND audit.actor_id IS NOT NULL
      AND audit.actor_id <> v_candidate.owner_id
      AND public.has_platform_admin(audit.actor_id)
      AND audit.new_data @> jsonb_build_object(
        'promotion_type', v_candidate.promotion_type,
        'enabled', true
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.listing_promotion_allocations AS used_audit
        WHERE used_audit.owner_id = v_candidate.owner_id
          AND used_audit.promotion_type = v_candidate.promotion_type
          AND used_audit.request_key =
            'legacy-audit:' || audit.id::text || ':' ||
            v_candidate.listing_id::text
      )
    ORDER BY audit.occurred_at DESC, audit.id DESC
    LIMIT 1;

    IF v_audit_id IS NOT NULL THEN
      v_ends_at := p_observed_at + interval '30 days';
      IF NULLIF(v_audit_end_text, '') IS NOT NULL THEN
        BEGIN
          v_ends_at := v_audit_end_text::timestamptz;
        EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
          v_audit_id := NULL;
        END;
      END IF;

      IF v_audit_id IS NOT NULL AND v_ends_at > p_observed_at THEN
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
          v_candidate.listing_id,
          v_candidate.owner_id,
          v_candidate.promotion_type,
          'admin',
          'legacy-audit:' || v_audit_id::text || ':' ||
            v_candidate.listing_id::text,
          p_observed_at,
          v_ends_at,
          v_audit_actor_id
        );

        UPDATE private.legacy_listing_promotion_quarantine
        SET
          resolution = 'migrated',
          evidence_type = 'admin',
          evidence_reference = v_audit_id::text,
          resolved_at = p_observed_at
        WHERE listing_id = v_candidate.listing_id
          AND promotion_type = v_candidate.promotion_type;
        v_processed := v_processed + 1;
        CONTINUE;
      END IF;
    END IF;

    v_subscription_id := NULL;
    v_subscription_end := NULL;
    SELECT subscription.id, subscription.current_period_end
    INTO v_subscription_id, v_subscription_end
    FROM public.billing_subscriptions AS subscription
    JOIN public.profiles AS profile ON profile.user_id = subscription.user_id
    WHERE subscription.user_id = v_candidate.owner_id
      AND subscription.status IN ('active', 'past_due')
      AND subscription.current_period_end > p_observed_at
      AND subscription.runtime_mode = public.current_billing_runtime_mode()
      AND subscription.audience = public.profile_pricing_audience(
        profile.role,
        profile.participant_type::text
      )
      AND profile.subscription_product_id IS NOT NULL
      AND subscription.stripe_product_id = profile.subscription_product_id
      AND private.get_listing_promotion_plan_allowance(
        v_candidate.owner_id,
        v_candidate.promotion_type
      ) > (
        SELECT count(*)
        FROM public.listing_promotion_allocations AS used_plan
        WHERE used_plan.owner_id = v_candidate.owner_id
          AND used_plan.promotion_type = v_candidate.promotion_type
          AND used_plan.source_type = 'plan'
          AND used_plan.plan_cycle_start =
            date_trunc('month', p_observed_at AT TIME ZONE 'UTC')::date
      )
    ORDER BY subscription.updated_at DESC, subscription.id DESC
    LIMIT 1;

    IF v_subscription_id IS NOT NULL THEN
      v_ends_at := LEAST(
        p_observed_at + interval '30 days',
        v_subscription_end
      );
      INSERT INTO public.listing_promotion_allocations (
        listing_id,
        owner_id,
        promotion_type,
        source_type,
        billing_subscription_id,
        request_key,
        plan_cycle_start,
        starts_at,
        ends_at,
        created_by
      ) VALUES (
        v_candidate.listing_id,
        v_candidate.owner_id,
        v_candidate.promotion_type,
        'plan',
        v_subscription_id,
        'legacy-plan:' || v_subscription_id::text || ':' ||
          v_candidate.listing_id::text,
        date_trunc('month', p_observed_at AT TIME ZONE 'UTC')::date,
        p_observed_at,
        v_ends_at,
        NULL
      );

      UPDATE private.legacy_listing_promotion_quarantine
      SET
        resolution = 'migrated',
        evidence_type = 'plan',
        evidence_reference = v_subscription_id::text,
        resolved_at = p_observed_at
      WHERE listing_id = v_candidate.listing_id
        AND promotion_type = v_candidate.promotion_type;
      v_processed := v_processed + 1;
      CONTINUE;
    END IF;

    v_addon_purchase_id := NULL;
    SELECT purchase.id
    INTO v_addon_purchase_id
    FROM public.addon_purchases AS purchase
    WHERE purchase.user_id = v_candidate.owner_id
      AND purchase.addon_key = CASE v_candidate.promotion_type
        WHEN 'spotlight' THEN 'featured_listing'
        ELSE 'priority_placement'
      END
      AND purchase.status IN ('paid', 'active')
      AND purchase.runtime_mode = public.current_billing_runtime_mode()
      AND purchase.credits_consumed <
        purchase.credits_granted - COALESCE(purchase.credits_refunded, 0)
    ORDER BY purchase.created_at, purchase.id
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF v_addon_purchase_id IS NOT NULL THEN
      UPDATE public.addon_purchases
      SET credits_consumed = credits_consumed + 1
      WHERE id = v_addon_purchase_id
        AND credits_consumed <
          credits_granted - COALESCE(credits_refunded, 0);

      IF FOUND THEN
        INSERT INTO public.listing_promotion_allocations (
          listing_id,
          owner_id,
          promotion_type,
          source_type,
          addon_purchase_id,
          request_key,
          starts_at,
          ends_at,
          created_by
        ) VALUES (
          v_candidate.listing_id,
          v_candidate.owner_id,
          v_candidate.promotion_type,
          'addon',
          v_addon_purchase_id,
          'legacy-addon:' || v_addon_purchase_id::text || ':' ||
            v_candidate.listing_id::text,
          p_observed_at,
          p_observed_at + interval '30 days',
          NULL
        );

        UPDATE private.legacy_listing_promotion_quarantine
        SET
          resolution = 'migrated',
          evidence_type = 'addon',
          evidence_reference = v_addon_purchase_id::text,
          resolved_at = p_observed_at
        WHERE listing_id = v_candidate.listing_id
          AND promotion_type = v_candidate.promotion_type;
        v_processed := v_processed + 1;
      END IF;
    END IF;
  END LOOP;

  FOR v_bundle IN
    SELECT
      spotlight.listing_id,
      spotlight.owner_id
    FROM private.legacy_listing_promotion_quarantine AS spotlight
    JOIN private.legacy_listing_promotion_quarantine AS priority
      ON priority.listing_id = spotlight.listing_id
      AND priority.owner_id = spotlight.owner_id
      AND priority.promotion_type = 'priority'
      AND priority.resolution = 'pending'
    WHERE spotlight.promotion_type = 'spotlight'
      AND spotlight.resolution = 'pending'
    ORDER BY spotlight.listing_id
    FOR UPDATE OF spotlight, priority
  LOOP
    v_addon_purchase_id := NULL;
    SELECT purchase.id
    INTO v_addon_purchase_id
    FROM public.addon_purchases AS purchase
    WHERE purchase.user_id = v_bundle.owner_id
      AND purchase.addon_key = 'featured_priority_bundle'
      AND purchase.status IN ('paid', 'active')
      AND purchase.runtime_mode = public.current_billing_runtime_mode()
      AND purchase.credits_consumed <
        purchase.credits_granted - COALESCE(purchase.credits_refunded, 0)
    ORDER BY purchase.created_at, purchase.id
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF v_addon_purchase_id IS NOT NULL THEN
      UPDATE public.addon_purchases
      SET credits_consumed = credits_consumed + 1
      WHERE id = v_addon_purchase_id
        AND credits_consumed <
          credits_granted - COALESCE(credits_refunded, 0);

      IF FOUND THEN
        INSERT INTO public.listing_promotion_allocations (
          listing_id,
          owner_id,
          promotion_type,
          source_type,
          addon_purchase_id,
          request_key,
          starts_at,
          ends_at,
          created_by
        )
        SELECT
          v_bundle.listing_id,
          v_bundle.owner_id,
          promotion_type,
          'addon',
          v_addon_purchase_id,
          'legacy-addon-bundle:' || v_addon_purchase_id::text || ':' ||
            v_bundle.listing_id::text,
          p_observed_at,
          p_observed_at + interval '30 days',
          NULL
        FROM unnest(ARRAY['spotlight', 'priority']::text[])
          AS promotion_rows(promotion_type);

        UPDATE private.legacy_listing_promotion_quarantine
        SET
          resolution = 'migrated',
          evidence_type = 'addon',
          evidence_reference = v_addon_purchase_id::text,
          resolved_at = p_observed_at
        WHERE listing_id = v_bundle.listing_id
          AND promotion_type IN ('spotlight', 'priority');
        v_processed := v_processed + 2;
      END IF;
    END IF;
  END LOOP;

  FOR v_candidate IN
    UPDATE private.legacy_listing_promotion_quarantine
    SET
      resolution = 'cleared',
      evidence_type = NULL,
      evidence_reference = NULL,
      resolved_at = p_observed_at
    WHERE resolution = 'pending'
    RETURNING listing_id
  LOOP
    v_processed := v_processed + 1;
  END LOOP;

  FOR v_candidate IN
    SELECT DISTINCT quarantine.listing_id
    FROM private.legacy_listing_promotion_quarantine AS quarantine
  LOOP
    PERFORM private.sync_listing_promotion_projection(v_candidate.listing_id);
  END LOOP;

  RETURN v_processed;
END;
$$;

CREATE OR REPLACE FUNCTION private.repair_legacy_priority_promotions(
  p_grant_started_at timestamptz
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.remediate_legacy_listing_promotions(p_grant_started_at)
$$;

REVOKE ALL ON FUNCTION private.remediate_legacy_listing_promotions(timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.remediate_legacy_listing_promotions(timestamptz)
  TO service_role;

REVOKE ALL ON FUNCTION private.repair_legacy_priority_promotions(timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.repair_legacy_priority_promotions(timestamptz)
  TO service_role;

SELECT private.remediate_legacy_listing_promotions(transaction_timestamp());

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
