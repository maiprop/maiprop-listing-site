-- Forward-only reconciliation for the historical 20260602032000..040000
-- migration rows. Production recorded marker-only rows and used a conflicting
-- name at 20260602034000, while the canonical replay executed SQL. This
-- migration converges the resulting schema and privilege postconditions only.
-- It deliberately never reads or writes the migration-history catalog.

-- The seven foreign-key support indexes are the durable effect of 32000.
CREATE INDEX IF NOT EXISTS idx_conversations_closed_by
  ON public.conversations (closed_by);

CREATE INDEX IF NOT EXISTS idx_firesale_interest_proof_of_funds_verified_by
  ON public.firesale_interest (proof_of_funds_verified_by);

CREATE INDEX IF NOT EXISTS idx_firesale_interest_reserved_by
  ON public.firesale_interest (reserved_by);

CREATE INDEX IF NOT EXISTS idx_firesale_interest_audit_log_actor_id
  ON public.firesale_interest_audit_log (actor_id);

CREATE INDEX IF NOT EXISTS idx_firesale_interest_audit_log_deal_id
  ON public.firesale_interest_audit_log (deal_id);

CREATE INDEX IF NOT EXISTS idx_professional_review_responses_responder_id
  ON public.professional_review_responses (responder_id);

CREATE INDEX IF NOT EXISTS idx_profiles_account_moderated_by
  ON public.profiles (account_moderated_by);

-- Reapply the canonical function bodies whose historical definitions differ
-- between the production marker-only history and a clean migration replay.
-- Staging and production execute these same definitions before schema evidence
-- is captured, so the signed pg_get_functiondef fingerprints converge exactly.
CREATE OR REPLACE FUNCTION public.can_review_professional(
  p_professional_id UUID,
  p_reviewer_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p_professional_id IS NOT NULL
    AND p_reviewer_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = p_professional_id
        AND p.user_id = p_reviewer_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.consultation_requests cr
      WHERE cr.professional_id = p_professional_id
        AND cr.requester_id = p_reviewer_id
        AND cr.status = 'completed'
    );
$function$;

CREATE OR REPLACE FUNCTION public.check_listing_quota()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN private.check_listing_quota_for_owner(v_actor);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_agent_monthly_input_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller UUID := auth.uid();
  v_target UUID := COALESCE(p_user_id, v_caller);
  v_count INTEGER;
BEGIN
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF v_caller IS NOT NULL
     AND v_caller IS DISTINCT FROM v_target
     AND NOT public.has_platform_admin(v_caller) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_count
  FROM public.agent_data_inputs
  WHERE user_id = v_target
    AND date_trunc('month', created_at AT TIME ZONE 'UTC')
      = date_trunc('month', now() AT TIME ZONE 'UTC');

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_auction_alert_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role public.user_role;
BEGIN
  v_role := public.authoritative_role(p_user_id);

  IF v_role = 'buyer'::public.user_role THEN
    RETURN CASE WHEN public.is_pro(p_user_id) THEN 5 ELSE 1 END;
  END IF;
  RETURN 999;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_auction_listing_visible_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role public.user_role;
BEGIN
  v_role := public.authoritative_role(p_user_id);

  IF v_role IN (
    'buyer'::public.user_role,
    'seller'::public.user_role,
    'agent'::public.user_role
  ) THEN
    RETURN CASE WHEN public.is_pro(p_user_id) THEN 600 ELSE 60 END;
  END IF;

  RETURN 999;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_contact_monthly_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role public.user_role;
BEGIN
  v_role := public.authoritative_role(p_user_id);

  IF v_role = 'buyer'::public.user_role THEN
    RETURN CASE WHEN public.is_pro(p_user_id) THEN 999 ELSE 1 END;
  END IF;

  RETURN 999;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_listing_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role TEXT;
  v_limit INTEGER;
BEGIN
  v_role := public.authoritative_role(p_user_id)::TEXT;
  v_limit := public.get_listing_limit(v_role, public.is_pro(p_user_id));
  RETURN COALESCE(v_limit, 999);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_open_house_rsvp_monthly_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role public.user_role;
BEGIN
  v_role := public.authoritative_role(p_user_id);

  IF v_role = 'buyer'::public.user_role THEN
    RETURN CASE WHEN public.is_pro(p_user_id) THEN 999 ELSE 3 END;
  END IF;

  RETURN 999;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_professionals_per_category_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role public.user_role;
BEGIN
  v_role := public.authoritative_role(p_user_id);

  IF v_role = 'buyer'::public.user_role THEN
    RETURN CASE WHEN public.is_pro(p_user_id) THEN 999 ELSE 5 END;
  END IF;

  RETURN 999;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_saved_search_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role public.user_role;
BEGIN
  v_role := public.authoritative_role(p_user_id);

  IF v_role = 'buyer'::public.user_role THEN
    RETURN CASE WHEN public.is_pro(p_user_id) THEN 999 ELSE 1 END;
  END IF;
  RETURN 999;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_search_alert_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role public.user_role;
BEGIN
  v_role := public.authoritative_role(p_user_id);

  IF v_role = 'buyer'::public.user_role THEN
    RETURN CASE WHEN public.is_pro(p_user_id) THEN 5 ELSE 1 END;
  END IF;
  RETURN 999;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_valuation_monthly_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role public.user_role;
  v_is_pro BOOLEAN;
BEGIN
  IF public.has_platform_admin(p_user_id) THEN
    RETURN 999;
  END IF;

  v_role := public.authoritative_role(p_user_id);
  v_is_pro := public.is_pro(p_user_id);

  IF v_role IN ('buyer'::public.user_role, 'seller'::public.user_role) THEN
    RETURN CASE WHEN v_is_pro THEN 5 ELSE 0 END;
  END IF;

  IF v_role IN (
    'agent'::public.user_role,
    'professional'::public.user_role,
    'developer'::public.user_role,
    'investor'::public.user_role,
    'institutional'::public.user_role
  ) THEN
    RETURN CASE WHEN v_is_pro THEN 999 ELSE 0 END;
  END IF;

  RETURN 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_buy_side_role(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
    AND role::TEXT IN ('investor', 'institutional')
  );
$function$;

CREATE OR REPLACE FUNCTION public.has_sell_side_role(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
    AND role::TEXT IN ('agent', 'institutional', 'developer')
  );
$function$;

CREATE OR REPLACE FUNCTION public.reserve_ai_quota_for_user(
  _user_id UUID,
  p_bucket TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := _user_id;
  v_base_limit INTEGER;
  v_available_credits INTEGER;
  v_effective_limit INTEGER;
  v_count INTEGER;
  v_month_start TIMESTAMPTZ;
  v_reservation_id UUID;
  v_consumed_credit BOOLEAN := FALSE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'reason', 'not_authenticated',
      'used', 0,
      'limit', 0
    );
  END IF;

  IF p_bucket IS NULL OR length(trim(p_bucket)) = 0 OR length(p_bucket) > 120 THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'reason', 'invalid_bucket',
      'used', 0,
      'limit', 0
    );
  END IF;

  v_month_start := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_uid::TEXT || ':' || p_bucket || ':' || v_month_start::DATE::TEXT, 0)
  );

  v_base_limit := public.get_ai_call_monthly_base_limit(v_uid, p_bucket);
  v_available_credits := public.get_available_addon_credits(v_uid, p_bucket);
  v_effective_limit := v_base_limit + v_available_credits;

  SELECT COUNT(*)::INTEGER
  INTO v_count
  FROM public.usage_ai_calls
  WHERE user_id = v_uid
    AND bucket = p_bucket
    AND created_at >= v_month_start;

  IF v_effective_limit <= 0 THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'reason', 'plan_does_not_include_feature',
      'used', v_count,
      'limit', v_effective_limit
    );
  END IF;

  IF v_count >= v_effective_limit THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'reason', 'monthly_limit_reached',
      'used', v_count,
      'limit', v_effective_limit
    );
  END IF;

  v_consumed_credit := v_base_limit < 999999 AND v_count >= v_base_limit;

  INSERT INTO public.usage_ai_calls (user_id, bucket)
  VALUES (v_uid, p_bucket)
  RETURNING id INTO v_reservation_id;

  RETURN jsonb_build_object(
    'allowed', TRUE,
    'reason', NULL,
    'used', v_count + 1,
    'limit', v_effective_limit,
    'reservation_id', v_reservation_id,
    'addon_credit_consumed', v_consumed_credit
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_agent_data_input(
  p_closed_at DATE,
  p_property_address TEXT,
  p_property_city TEXT,
  p_transaction_type TEXT,
  p_closing_price NUMERIC,
  p_property_postal_code TEXT DEFAULT NULL,
  p_property_type TEXT DEFAULT NULL,
  p_kaek TEXT DEFAULT NULL,
  p_buyer_name TEXT DEFAULT NULL,
  p_seller_name TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_agent_side TEXT DEFAULT 'seller'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_role TEXT;
  v_used INTEGER;
  v_id UUID;
  v_transaction_type TEXT;
  v_month_start TIMESTAMPTZ;
  v_month_bucket DATE;
  v_agent_side TEXT := lower(trim(COALESCE(p_agent_side, 'seller')));
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT role::TEXT INTO v_role
  FROM public.profiles
  WHERE user_id = v_user
  LIMIT 1;

  IF v_role IS DISTINCT FROM 'agent' AND NOT public.has_platform_admin(v_user) THEN
    RAISE EXCEPTION 'Only agents can submit data inputs' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.agent_data_input_bans WHERE user_id = v_user) THEN
    RAISE EXCEPTION 'Data input submissions are permanently disabled for this account'
      USING ERRCODE = '42501';
  END IF;

  IF p_transaction_type NOT IN ('sale', 'rent', 'rental') THEN
    RAISE EXCEPTION 'transaction_type must be sale or rent' USING ERRCODE = '22023';
  END IF;
  IF v_agent_side NOT IN ('buyer', 'seller', 'both') THEN
    RAISE EXCEPTION 'agent_side must be buyer, seller, or both' USING ERRCODE = '22023';
  END IF;
  IF p_closing_price IS NULL OR p_closing_price < 0 THEN
    RAISE EXCEPTION 'closing_price must be >= 0' USING ERRCODE = '22023';
  END IF;
  IF p_closed_at IS NULL OR p_closed_at > CURRENT_DATE THEN
    RAISE EXCEPTION 'closed_at must be a past or present date' USING ERRCODE = '22023';
  END IF;
  IF length(COALESCE(p_property_address, '')) = 0 THEN
    RAISE EXCEPTION 'property_address is required' USING ERRCODE = '22023';
  END IF;
  IF length(COALESCE(p_property_city, '')) = 0 THEN
    RAISE EXCEPTION 'property_city is required' USING ERRCODE = '22023';
  END IF;

  v_month_start := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_month_bucket := (v_month_start AT TIME ZONE 'UTC')::DATE;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_user::TEXT || ':' || v_month_bucket::TEXT, 0)
  );

  SELECT COUNT(*)
  INTO v_used
  FROM public.agent_data_inputs
  WHERE user_id = v_user
    AND created_at >= v_month_start;

  IF v_used >= 20 THEN
    RAISE EXCEPTION 'Monthly data input limit (20) reached'
      USING ERRCODE = '23514';
  END IF;

  v_transaction_type := CASE
    WHEN p_transaction_type = 'rent' THEN 'rental'
    ELSE p_transaction_type
  END;

  INSERT INTO public.agent_data_inputs (
    user_id,
    property_address,
    city,
    postal_code,
    kaek,
    property_type,
    transaction_type,
    agent_side,
    sale_price,
    closing_date,
    buyer_name,
    seller_name,
    notes,
    discount_pct
  ) VALUES (
    v_user,
    p_property_address,
    p_property_city,
    p_property_postal_code,
    p_kaek,
    COALESCE(p_property_type, 'other'),
    v_transaction_type,
    v_agent_side,
    p_closing_price,
    p_closed_at,
    p_buyer_name,
    p_seller_name,
    p_notes,
    public.agent_data_input_discount_pct_per_input()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- A clean canonical replay drops this eleven-argument overload in
-- 20260707020000_serialize_agent_data_input_quota.sql and never recreates it.
-- Staging also proves that only the twelve-argument form remains.
DROP FUNCTION IF EXISTS public.submit_agent_data_input(
  DATE, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);

DO $$
DECLARE
  signature TEXT;
  target_function REGPROCEDURE;
BEGIN
  -- These are the final service-only postconditions for the marker/collision
  -- scope after all later advisor and authoritative-role hardening migrations.
  FOREACH signature IN ARRAY ARRAY[
    'public.get_agent_monthly_input_count(uuid)',
    'public.get_ai_call_monthly_limit(uuid,text)',
    'public.get_auction_alert_limit(uuid)',
    'public.get_auction_listing_visible_limit(uuid)',
    'public.get_contact_monthly_limit(uuid)',
    'public.get_listing_limit(uuid)',
    'public.get_open_house_rsvp_monthly_limit(uuid)',
    'public.get_priority_ad_monthly_limit(uuid)',
    'public.get_professionals_per_category_limit(uuid)',
    'public.get_report_monthly_limit(uuid)',
    'public.get_saved_search_limit(uuid)',
    'public.get_search_alert_limit(uuid)',
    'public.get_valuation_monthly_limit(uuid)',
    'public.get_viewing_limit(uuid,boolean)',
    'public.check_ai_quota(text)',
    'public.check_listing_quota()',
    'public.can_review_professional(uuid,uuid)',
    'public.has_buy_side_role(uuid)',
    'public.has_sell_side_role(uuid)',
    'public.record_role_switch_audit(text,text,text,boolean,boolean)',
    'public.record_role_switch_audit_for_user(uuid,text,text,text,boolean,boolean)',
    'public.reserve_ai_quota(text)',
    'public.reserve_ai_quota_for_user(uuid,text)',
    'public.submit_agent_data_input(date,text,text,text,numeric,text,text,text,text,text,text,text)'
  ]
  LOOP
    target_function := to_regprocedure(signature);
    IF target_function IS NULL THEN
      RAISE EXCEPTION 'Required legacy-reconciliation function is missing: %', signature;
    END IF;

    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', target_function);
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER', target_function);
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      target_function
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO service_role',
      target_function
    );
  END LOOP;
END
$$;

DO $$
DECLARE
  signature TEXT;
  target_function REGPROCEDURE;
BEGIN
  -- These mutating canonical RPCs have an exact hardened execution posture.
  FOREACH signature IN ARRAY ARRAY[
    'public.record_role_switch_audit(text,text,text,boolean,boolean)',
    'public.record_role_switch_audit_for_user(uuid,text,text,text,boolean,boolean)',
    'public.reserve_ai_quota(text)',
    'public.reserve_ai_quota_for_user(uuid,text)',
    'public.submit_agent_data_input(date,text,text,text,numeric,text,text,text,text,text,text,text)'
  ]
  LOOP
    target_function := to_regprocedure(signature);
    IF target_function IS NULL THEN
      RAISE EXCEPTION 'Required canonical mutating RPC is missing: %', signature;
    END IF;

    EXECUTE format('ALTER FUNCTION %s VOLATILE', target_function);
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', target_function);
  END LOOP;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.agent_data_inputs') IS NULL THEN
    RAISE EXCEPTION 'Required public.agent_data_inputs table is missing';
  END IF;
END
$$;

ALTER TABLE public.agent_data_inputs ENABLE ROW LEVEL SECURITY;

-- Direct browser INSERTs must not bypass the canonical service-side RPC.
DROP POLICY IF EXISTS "agent_data_inputs_insert_own" ON public.agent_data_inputs;
DROP POLICY IF EXISTS "agent_data_inputs_insert_blocked" ON public.agent_data_inputs;
CREATE POLICY "agent_data_inputs_insert_blocked"
  ON public.agent_data_inputs
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- Fail the migration unless every converged postcondition is now true.
DO $$
DECLARE
  expected RECORD;
  index_is_canonical BOOLEAN;
BEGIN
  FOR expected IN
    SELECT *
    FROM (VALUES
      ('idx_conversations_closed_by', 'conversations', 'closed_by'),
      ('idx_firesale_interest_proof_of_funds_verified_by', 'firesale_interest', 'proof_of_funds_verified_by'),
      ('idx_firesale_interest_reserved_by', 'firesale_interest', 'reserved_by'),
      ('idx_firesale_interest_audit_log_actor_id', 'firesale_interest_audit_log', 'actor_id'),
      ('idx_firesale_interest_audit_log_deal_id', 'firesale_interest_audit_log', 'deal_id'),
      ('idx_professional_review_responses_responder_id', 'professional_review_responses', 'responder_id'),
      ('idx_profiles_account_moderated_by', 'profiles', 'account_moderated_by')
    ) AS target(index_name, table_name, column_name)
  LOOP
    SELECT
      access_method.amname = 'btree'
      AND index_state.indisvalid
      AND index_state.indisready
      AND NOT index_state.indisunique
      AND index_state.indpred IS NULL
      AND index_state.indexprs IS NULL
      AND index_state.indnkeyatts = 1
      AND index_state.indnatts = 1
      AND pg_get_indexdef(index_state.indexrelid, 1, TRUE) = expected.column_name
    INTO index_is_canonical
    FROM pg_index AS index_state
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_state.indexrelid
    JOIN pg_am AS access_method
      ON access_method.oid = index_relation.relam
    WHERE index_state.indexrelid = to_regclass(
      format('public.%I', expected.index_name)
    )
      AND index_state.indrelid = to_regclass(
        format('public.%I', expected.table_name)
      );

    IF index_is_canonical IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Legacy reconciliation index is not canonical: %', expected.index_name;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  signature TEXT;
  target_function REGPROCEDURE;
  function_is_canonical BOOLEAN;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.get_agent_monthly_input_count(uuid)',
    'public.get_ai_call_monthly_limit(uuid,text)',
    'public.get_auction_alert_limit(uuid)',
    'public.get_auction_listing_visible_limit(uuid)',
    'public.get_contact_monthly_limit(uuid)',
    'public.get_listing_limit(uuid)',
    'public.get_open_house_rsvp_monthly_limit(uuid)',
    'public.get_priority_ad_monthly_limit(uuid)',
    'public.get_professionals_per_category_limit(uuid)',
    'public.get_report_monthly_limit(uuid)',
    'public.get_saved_search_limit(uuid)',
    'public.get_search_alert_limit(uuid)',
    'public.get_valuation_monthly_limit(uuid)',
    'public.get_viewing_limit(uuid,boolean)',
    'public.check_ai_quota(text)',
    'public.check_listing_quota()',
    'public.can_review_professional(uuid,uuid)',
    'public.has_buy_side_role(uuid)',
    'public.has_sell_side_role(uuid)',
    'public.record_role_switch_audit(text,text,text,boolean,boolean)',
    'public.record_role_switch_audit_for_user(uuid,text,text,text,boolean,boolean)',
    'public.reserve_ai_quota(text)',
    'public.reserve_ai_quota_for_user(uuid,text)',
    'public.submit_agent_data_input(date,text,text,text,numeric,text,text,text,text,text,text,text)'
  ]
  LOOP
    target_function := to_regprocedure(signature);
    IF target_function IS NULL THEN
      RAISE EXCEPTION 'Required reconciled function is missing: %', signature;
    END IF;

    SELECT
      procedure_state.proowner = 'postgres'::regrole::oid
      AND procedure_state.prosecdef
      AND NOT EXISTS (
        SELECT 1
        FROM aclexplode(
          COALESCE(
            procedure_state.proacl,
            acldefault('f', procedure_state.proowner)
          )
        ) AS privilege
        WHERE privilege.grantee = 0
          AND privilege.privilege_type = 'EXECUTE'
      )
      AND NOT has_function_privilege('anon', procedure_state.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', procedure_state.oid, 'EXECUTE')
      AND has_function_privilege('service_role', procedure_state.oid, 'EXECUTE')
    INTO function_is_canonical
    FROM pg_proc AS procedure_state
    WHERE procedure_state.oid = target_function::oid;

    IF function_is_canonical IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Reconciled function has an unsafe owner/grant posture: %', signature;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  signature TEXT;
  target_function REGPROCEDURE;
  function_is_canonical BOOLEAN;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.record_role_switch_audit(text,text,text,boolean,boolean)',
    'public.record_role_switch_audit_for_user(uuid,text,text,text,boolean,boolean)',
    'public.reserve_ai_quota(text)',
    'public.reserve_ai_quota_for_user(uuid,text)',
    'public.submit_agent_data_input(date,text,text,text,numeric,text,text,text,text,text,text,text)'
  ]
  LOOP
    target_function := to_regprocedure(signature);
    SELECT
      procedure_state.provolatile = 'v'
      AND COALESCE(procedure_state.proconfig, ARRAY[]::TEXT[])
        @> ARRAY['search_path=public']::TEXT[]
    INTO function_is_canonical
    FROM pg_proc AS procedure_state
    WHERE procedure_state.oid = target_function::oid;

    IF function_is_canonical IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Canonical mutating RPC configuration drifted: %', signature;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  insert_policy_count INTEGER;
  blocked_policy_is_canonical BOOLEAN;
BEGIN
  IF to_regprocedure(
    'public.submit_agent_data_input(date,text,text,text,numeric,text,text,text,text,text,text)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'Obsolete eleven-argument submit_agent_data_input overload remains';
  END IF;

  IF NOT (
    SELECT relation_state.relrowsecurity
    FROM pg_class AS relation_state
    WHERE relation_state.oid = 'public.agent_data_inputs'::regclass
  ) THEN
    RAISE EXCEPTION 'agent_data_inputs must have row-level security enabled';
  END IF;

  SELECT count(*)::INTEGER
  INTO insert_policy_count
  FROM pg_policy
  WHERE polrelid = 'public.agent_data_inputs'::regclass
    AND polcmd = 'a';

  SELECT
    policy_state.polroles = ARRAY['authenticated'::regrole::oid]
    AND pg_get_expr(policy_state.polwithcheck, policy_state.polrelid) = 'false'
  INTO blocked_policy_is_canonical
  FROM pg_policy AS policy_state
  WHERE policy_state.polrelid = 'public.agent_data_inputs'::regclass
    AND policy_state.polname = 'agent_data_inputs_insert_blocked'
    AND policy_state.polcmd = 'a';

  IF insert_policy_count <> 1
     OR blocked_policy_is_canonical IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'agent_data_inputs direct INSERT policy is not fail-closed';
  END IF;
END
$$;
