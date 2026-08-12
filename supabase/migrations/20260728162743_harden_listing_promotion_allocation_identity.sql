-- Promotion allocations are an audit ledger. Administrative re-enable may
-- extend the active interval, but it must not rewrite campaign identity.
CREATE OR REPLACE FUNCTION private.guard_listing_promotion_allocation_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_listing_tombstone boolean :=
    OLD.listing_id IS NOT NULL
    AND NEW.listing_id IS NULL
    AND NEW.listing_snapshot ->> 'id' = OLD.listing_id::text
    AND NULLIF(NEW.listing_snapshot ->> 'deleted_at', '') IS NOT NULL
    AND NEW.status <> 'active';
  v_owner_tombstone boolean :=
    OLD.owner_id IS NOT NULL
    AND NEW.owner_id IS NULL
    AND NEW.owner_snapshot ->> 'user_id' = OLD.owner_id::text
    AND NULLIF(NEW.owner_snapshot ->> 'deleted_at', '') IS NOT NULL;
  v_creator_tombstone boolean :=
    OLD.created_by IS NOT NULL
    AND NEW.created_by IS NULL;
BEGIN
  IF (NEW.listing_id IS DISTINCT FROM OLD.listing_id AND NOT v_listing_tombstone)
     OR (
       NEW.listing_snapshot IS DISTINCT FROM OLD.listing_snapshot
       AND NOT v_listing_tombstone
     )
     OR (NEW.owner_id IS DISTINCT FROM OLD.owner_id AND NOT v_owner_tombstone)
     OR (
       NEW.owner_snapshot IS DISTINCT FROM OLD.owner_snapshot
       AND NOT v_owner_tombstone
     )
     OR NEW.promotion_type IS DISTINCT FROM OLD.promotion_type
     OR NEW.source_type IS DISTINCT FROM OLD.source_type
     OR NEW.billing_subscription_id IS DISTINCT FROM OLD.billing_subscription_id
     OR NEW.addon_purchase_id IS DISTINCT FROM OLD.addon_purchase_id
     OR NEW.request_key IS DISTINCT FROM OLD.request_key
     OR NEW.plan_cycle_start IS DISTINCT FROM OLD.plan_cycle_start
     OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
     OR (NEW.created_by IS DISTINCT FROM OLD.created_by AND NOT v_creator_tombstone)
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'promotion_allocation_identity_immutable'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_listing_promotion_allocation_identity
  ON public.listing_promotion_allocations;
CREATE TRIGGER trg_guard_listing_promotion_allocation_identity
BEFORE UPDATE ON public.listing_promotion_allocations
FOR EACH ROW
EXECUTE FUNCTION private.guard_listing_promotion_allocation_identity();

-- The canonical source trigger ordinarily revalidates owner-bound paid
-- provenance. Account deletion is the sole exception: the identity trigger
-- independently requires an immutable one-way owner tombstone and snapshot.
CREATE OR REPLACE FUNCTION private.guard_listing_promotion_subscription_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_canonical_subscription_id uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.owner_id IS NOT NULL
     AND NEW.owner_id IS NULL
     AND NEW.owner_snapshot ->> 'user_id' = OLD.owner_id::text
     AND NULLIF(NEW.owner_snapshot ->> 'deleted_at', '') IS NOT NULL
     AND NEW.source_type IS NOT DISTINCT FROM OLD.source_type
     AND NEW.billing_subscription_id IS NOT DISTINCT FROM OLD.billing_subscription_id
     AND NEW.addon_purchase_id IS NOT DISTINCT FROM OLD.addon_purchase_id THEN
    RETURN NEW;
  END IF;

  IF NEW.source_type = 'plan' THEN
    SELECT subscription.id
    INTO v_canonical_subscription_id
    FROM private.current_listing_promotion_plan_subscription(NEW.owner_id)
      AS subscription;

    IF v_canonical_subscription_id IS NULL THEN
      RAISE EXCEPTION 'promotion_plan_entitlement_required'
        USING ERRCODE = '42501';
    END IF;

    NEW.billing_subscription_id := v_canonical_subscription_id;
    NEW.addon_purchase_id := NULL;
  ELSIF NEW.source_type = 'addon' THEN
    NEW.billing_subscription_id := NULL;
    IF NEW.addon_purchase_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.addon_purchases AS purchase
      WHERE purchase.id = NEW.addon_purchase_id
        AND purchase.user_id = NEW.owner_id
        AND purchase.runtime_mode = public.current_billing_runtime_mode()
        AND purchase.status IN ('paid', 'active')
        AND purchase.credits_consumed <=
          purchase.credits_granted - COALESCE(purchase.credits_refunded, 0)
    ) THEN
      RAISE EXCEPTION 'promotion_addon_entitlement_required'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.source_type = 'admin' THEN
    NEW.billing_subscription_id := NULL;
    NEW.addon_purchase_id := NULL;
  ELSE
    RAISE EXCEPTION 'invalid_promotion_source' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_listing_promotion_subscription_source()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.guard_listing_promotion_subscription_source()
  TO service_role;

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
  v_rows integer;
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
    UPDATE public.listing_promotion_allocations
    SET
      ends_at = COALESCE(p_spotlight_ends_at, ends_at),
      updated_at = CASE
        WHEN p_spotlight_ends_at IS NOT NULL
          AND p_spotlight_ends_at IS DISTINCT FROM ends_at
        THEN v_now
        ELSE updated_at
      END
    WHERE listing_id = p_listing_id
      AND promotion_type = 'spotlight'
      AND status = 'active';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
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
      VALUES (
        p_listing_id,
        v_owner_id,
        'spotlight',
        'admin',
        'admin:' || p_actor_id::text || ':' || gen_random_uuid()::text,
        v_now,
        COALESCE(p_spotlight_ends_at, v_now + interval '30 days'),
        p_actor_id
      );
    END IF;
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
    PERFORM 1
    FROM public.listing_promotion_allocations
    WHERE listing_id = p_listing_id
      AND promotion_type = 'priority'
      AND status = 'active';
    IF NOT FOUND THEN
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
      VALUES (
        p_listing_id,
        v_owner_id,
        'priority',
        'admin',
        'admin:' || p_actor_id::text || ':' || gen_random_uuid()::text,
        v_now,
        v_now + interval '30 days',
        p_actor_id
      );
    END IF;
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
