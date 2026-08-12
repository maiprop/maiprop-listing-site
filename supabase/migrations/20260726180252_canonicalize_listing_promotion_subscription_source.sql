BEGIN;

-- Promotion inventory is a paid entitlement. Resolve one exact subscription
-- through the same durable contract used by every other Pro gate, then narrow
-- it to plans that include promotion inventory. Trialing and past_due retain
-- core Pro access but do not issue new monthly promotion credits.
CREATE OR REPLACE FUNCTION private.current_listing_promotion_plan_subscription(
  p_user_id uuid
)
RETURNS SETOF public.billing_subscriptions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT subscription.*
  FROM private.current_billing_subscription_for_user(p_user_id, NULL)
    AS subscription
  WHERE subscription.status = 'active'
    AND (
      (
        private.authoritative_role(p_user_id)::text = 'seller'
        AND subscription.plan_key = 'pro'
      )
      OR (
        private.authoritative_role(p_user_id)::text = 'agent'
        AND subscription.plan_key = 'agent_basic'
      )
      OR (
        private.authoritative_role(p_user_id)::text = 'developer'
        AND subscription.plan_key = 'developer_pro'
      )
    )
  ORDER BY subscription.updated_at DESC, subscription.id DESC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION
  private.current_listing_promotion_plan_subscription(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  private.current_listing_promotion_plan_subscription(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION private.has_active_listing_promotion_plan(
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM private.current_listing_promotion_plan_subscription(p_user_id)
  )
$$;

REVOKE ALL ON FUNCTION private.has_active_listing_promotion_plan(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_active_listing_promotion_plan(uuid)
  TO service_role;

-- The activation function historically resolved its plan allowance and source
-- subscription through two similar-but-not-identical queries. Canonicalize the
-- row at the ledger boundary so attribution cannot drift even during a mixed
-- application/database rollout.
CREATE OR REPLACE FUNCTION private.guard_listing_promotion_subscription_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_canonical_subscription_id uuid;
BEGIN
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

REVOKE ALL ON FUNCTION
  private.guard_listing_promotion_subscription_source()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  private.guard_listing_promotion_subscription_source()
  TO service_role;

DROP TRIGGER IF EXISTS trg_guard_listing_promotion_subscription_source
  ON public.listing_promotion_allocations;
CREATE TRIGGER trg_guard_listing_promotion_subscription_source
  BEFORE INSERT OR UPDATE OF source_type, billing_subscription_id, addon_purchase_id, owner_id
  ON public.listing_promotion_allocations
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_listing_promotion_subscription_source();

COMMENT ON FUNCTION
  private.current_listing_promotion_plan_subscription(uuid) IS
  'Returns the exact canonical active paid subscription that grants monthly listing promotion inventory.';
COMMENT ON FUNCTION
  private.guard_listing_promotion_subscription_source() IS
  'Canonicalizes plan allocation attribution and rejects cross-account or inactive add-on sources.';
COMMENT ON FUNCTION
  private.get_listing_promotion_plan_allowance(uuid, text) IS
  'Seller Pro: 1 Spotlight; Agent Pro: 10 Priority; Developer Pro receives exactly one Spotlight and one Priority plan allocation per UTC month.';

COMMIT;
