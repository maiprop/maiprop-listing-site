-- A later historical migration recreated authoritative_role(uuid) as an
-- unrestricted profile reader. Live projects were repaired manually; keep
-- clean restores and future environments aligned with that secure posture.

CREATE OR REPLACE FUNCTION public.authoritative_role(_user_id uuid)
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH caller AS (
    SELECT
      auth.uid() AS uid,
      COALESCE(auth.role(), '') AS jwt_role
  )
  SELECT target.role
  FROM public.profiles AS target
  CROSS JOIN caller
  WHERE target.user_id = _user_id
    AND (
      _user_id = caller.uid
      OR caller.jwt_role = 'service_role'
      OR EXISTS (
        SELECT 1
        FROM public.profiles AS admin_profile
        WHERE admin_profile.user_id = caller.uid
          AND admin_profile.role = 'admin'::public.user_role
      )
    )
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.authoritative_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.authoritative_role(auth.uid())
$$;

COMMENT ON FUNCTION public.authoritative_role(uuid) IS
  'Canonical caller-scoped role lookup. Arbitrary users can be resolved only by service-role or platform-admin contexts.';

REVOKE ALL ON FUNCTION public.authoritative_role(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.authoritative_role() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authoritative_role(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.authoritative_role() TO service_role;

-- Private arbitrary-user resolution is reserved for server-owned maintenance
-- code. RLS uses only the caller-scoped no-argument helper.
REVOKE ALL ON FUNCTION private.authoritative_role(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.authoritative_role(uuid)
  TO service_role;
REVOKE ALL ON FUNCTION private.authoritative_role()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.authoritative_role()
  TO authenticated, service_role;

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

  IF private.authoritative_role(p_user_id) = 'admin'::public.user_role THEN
    RETURN 999;
  END IF;

  v_role := private.authoritative_role(p_user_id);

  SELECT EXISTS (
    SELECT 1
    FROM public.billing_subscriptions AS subscription
    JOIN public.profiles AS profile
      ON profile.user_id = subscription.user_id
    WHERE subscription.user_id = p_user_id
      AND subscription.status = 'active'
      AND subscription.runtime_mode = public.current_billing_runtime_mode()
      AND subscription.current_period_end IS NOT NULL
      AND subscription.current_period_end > now()
      AND subscription.audience = public.profile_pricing_audience(
        profile.role,
        profile.participant_type::text
      )
      AND (
        (v_role::text = 'seller' AND subscription.plan_key = 'pro')
        OR (
          v_role::text = 'agent'
          AND subscription.plan_key = 'agent_basic'
        )
        OR (
          v_role::text = 'developer'
          AND subscription.plan_key = 'developer_pro'
        )
      )
      AND profile.subscription_product_id IS NOT NULL
      AND subscription.stripe_product_id = profile.subscription_product_id
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
          AND private.authoritative_role(allocation.created_by) =
            'admin'::public.user_role
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
      AND private.authoritative_role(audit.actor_id) =
        'admin'::public.user_role
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

REVOKE ALL ON FUNCTION private.remediate_legacy_listing_promotions(timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.remediate_legacy_listing_promotions(timestamptz)
  TO service_role;

-- The Quick Sale seller gate must remain callable during RLS evaluation, but
-- it must not expose an arbitrary-user public RPC. Use the private,
-- caller-scoped helper that is already granted to authenticated for policies.
DROP POLICY IF EXISTS "firesale_requests_insert" ON public.firesale_requests;

CREATE POLICY "firesale_requests_insert"
  ON public.firesale_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND private.authoritative_role() = 'seller'::public.user_role
  );

-- These browser flows already use authenticated Edge Functions. Reassert the
-- service-only grants after historical out-of-order staging applications so
-- the Data API cannot invoke their privileged implementations directly.
DO $$
DECLARE
  signature text;
  target_function regprocedure;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.get_open_house_capacity(uuid)',
    'public.submit_agent_data_input(date,text,text,text,numeric,text,text,text,text,text,text)',
    'public.submit_agent_data_input(date,text,text,text,numeric,text,text,text,text,text,text,text)'
  ] LOOP
    target_function := to_regprocedure(signature);
    IF target_function IS NOT NULL THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
        target_function
      );
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO service_role',
        target_function
      );
    END IF;
  END LOOP;
END
$$;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.authoritative_role(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.authoritative_role(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authoritative_role(uuid) remains browser-executable';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.authoritative_role(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authoritative_role(uuid) must remain service-role executable';
  END IF;
END
$$;
