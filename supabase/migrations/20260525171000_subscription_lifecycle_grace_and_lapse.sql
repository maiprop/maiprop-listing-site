-- Subscription lifecycle grace and non-destructive lapse controls.
--
-- Stripe's past_due status is a recovery/grace state. MaiProp keeps Pro access
-- through that state and only applies downgrade controls when Stripe reaches a
-- terminal/non-provisioned status such as canceled, unpaid, paused, or
-- incomplete_expired.

DO $$
BEGIN
  -- This migration is current-dated so already-applied July migrations can be
  -- repaired in production. On fresh rebuilds it runs before the July audience
  -- helper exists, so skip this replacement there; 20260707070000 carries the
  -- same corrected body for fresh-DB replay.
  IF to_regprocedure('public.has_audience_scoped_pro_entitlement(uuid)') IS NOT NULL THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.is_pro(p_user_id uuid)
      RETURNS boolean
      LANGUAGE sql
      SECURITY DEFINER
      STABLE
      SET search_path = public
      AS $function$
        SELECT
          public.has_platform_admin(p_user_id)
          OR COALESCE(
            (
              SELECT p.force_pro_access
              FROM public.profiles p
              WHERE p.user_id = p_user_id
              LIMIT 1
            ),
            FALSE
          )
          OR public.has_audience_scoped_pro_entitlement(p_user_id)
          OR EXISTS (
            SELECT 1
            FROM public.investor_subscriptions s
            WHERE s.user_id = p_user_id
              AND s.status IN ('active', 'trial')
          )
      $function$;
    $sql$;

    EXECUTE 'REVOKE ALL ON FUNCTION public.is_pro(uuid) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_pro(uuid) TO service_role';
    EXECUTE $sql$
      COMMENT ON FUNCTION public.is_pro(uuid) IS
        'Canonical Pro-status reader. Returns true for platform admins, admin-managed Pro overrides, audience-scoped Pro products, or active/trial investor subscriptions.'
    $sql$;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.apply_subscription_lapse_controls(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_listing_limit integer;
  v_search_alert_limit integer;
  v_auction_alert_limit integer;
  v_paused_listings integer := 0;
  v_disabled_search_alerts integer := 0;
  v_disabled_auction_alerts integer := 0;
BEGIN
  SELECT COALESCE(p.role::text, 'buyer')
  INTO v_role
  FROM public.profiles p
  WHERE p.user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'profile_not_found');
  END IF;

  -- Manual/admin/investor entitlements are independent of the Stripe product
  -- that just lapsed. Leave their public surface untouched.
  IF public.is_pro(p_user_id) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'alternate_entitlement_active');
  END IF;

  v_listing_limit := public.get_listing_limit(v_role, FALSE);

  IF v_listing_limit IS NOT NULL AND v_listing_limit < 999 THEN
    WITH ranked_active_listings AS (
      SELECT
        l.id,
        row_number() OVER (
          ORDER BY
            l.is_featured DESC,
            l.priority_placement DESC,
            l.updated_at DESC,
            l.created_at DESC,
            l.id
        ) AS rn
      FROM public.listings l
      WHERE l.owner_id = p_user_id
        AND l.status = 'active'::public.listing_status
    )
    UPDATE public.listings l
    SET
      status = 'paused'::public.listing_status,
      updated_at = now()
    FROM ranked_active_listings r
    WHERE l.id = r.id
      AND r.rn > GREATEST(v_listing_limit, 0);

    GET DIAGNOSTICS v_paused_listings = ROW_COUNT;
  END IF;

  -- Keep saved searches as user data, but turn off paid email alert volume.
  v_search_alert_limit := public.get_search_alert_limit(p_user_id);
  IF v_search_alert_limit < 999 THEN
    WITH ranked_search_alerts AS (
      SELECT
        s.id,
        row_number() OVER (
          ORDER BY s.updated_at DESC, s.created_at DESC, s.id
        ) AS rn
      FROM public.saved_searches s
      WHERE s.user_id = p_user_id
        AND s.email_alerts = TRUE
    )
    UPDATE public.saved_searches s
    SET
      email_alerts = FALSE,
      updated_at = now()
    FROM ranked_search_alerts r
    WHERE s.id = r.id
      AND r.rn > GREATEST(v_search_alert_limit, 0);

    GET DIAGNOSTICS v_disabled_search_alerts = ROW_COUNT;
  END IF;

  v_auction_alert_limit := public.get_auction_alert_limit(p_user_id);
  IF v_auction_alert_limit < 999 THEN
    WITH ranked_auction_alerts AS (
      SELECT
        a.id,
        row_number() OVER (
          ORDER BY a.created_at DESC, a.id
        ) AS rn
      FROM public.auction_alerts a
      WHERE a.user_id = p_user_id
        AND a.active = TRUE
    )
    UPDATE public.auction_alerts a
    SET active = FALSE
    FROM ranked_auction_alerts r
    WHERE a.id = r.id
      AND r.rn > GREATEST(v_auction_alert_limit, 0);

    GET DIAGNOSTICS v_disabled_auction_alerts = ROW_COUNT;
  END IF;

  IF v_paused_listings > 0
    OR v_disabled_search_alerts > 0
    OR v_disabled_auction_alerts > 0 THEN
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (
      p_user_id,
      'Subscription access updated',
      concat_ws(
        ' ',
        CASE
          WHEN v_paused_listings > 0
            THEN v_paused_listings || ' listing(s) were paused to match your current plan.'
          ELSE NULL
        END,
        CASE
          WHEN v_disabled_search_alerts > 0
            THEN v_disabled_search_alerts || ' saved-search email alert(s) were turned off.'
          ELSE NULL
        END,
        CASE
          WHEN v_disabled_auction_alerts > 0
            THEN v_disabled_auction_alerts || ' auction alert(s) were turned off.'
          ELSE NULL
        END
      ),
      'billing',
      '/dashboard/billing'
    );
  END IF;

  RETURN jsonb_build_object(
    'skipped', false,
    'paused_listings', v_paused_listings,
    'disabled_search_alerts', v_disabled_search_alerts,
    'disabled_auction_alerts', v_disabled_auction_alerts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_subscription_lapse_controls(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_subscription_lapse_controls(uuid) TO service_role;

COMMENT ON FUNCTION public.apply_subscription_lapse_controls(uuid) IS
  'Non-destructively applies plan limits after terminal Stripe subscription lapse: pauses excess active listings and disables excess alerts without deleting user data or canceling existing viewings.';

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.apply_subscription_lapse_controls(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must not execute apply_subscription_lapse_controls directly';
  END IF;
END $$;
