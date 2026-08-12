BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(13);

CREATE TEMP TABLE legacy_reconciliation_function_targets (
  signature TEXT PRIMARY KEY,
  critical BOOLEAN NOT NULL DEFAULT FALSE
) ON COMMIT DROP;

INSERT INTO legacy_reconciliation_function_targets (signature, critical)
VALUES
  ('public.get_agent_monthly_input_count(uuid)', FALSE),
  ('public.get_ai_call_monthly_limit(uuid,text)', FALSE),
  ('public.get_auction_alert_limit(uuid)', FALSE),
  ('public.get_auction_listing_visible_limit(uuid)', FALSE),
  ('public.get_contact_monthly_limit(uuid)', FALSE),
  ('public.get_listing_limit(uuid)', FALSE),
  ('public.get_open_house_rsvp_monthly_limit(uuid)', FALSE),
  ('public.get_priority_ad_monthly_limit(uuid)', FALSE),
  ('public.get_professionals_per_category_limit(uuid)', FALSE),
  ('public.get_report_monthly_limit(uuid)', FALSE),
  ('public.get_saved_search_limit(uuid)', FALSE),
  ('public.get_search_alert_limit(uuid)', FALSE),
  ('public.get_valuation_monthly_limit(uuid)', FALSE),
  ('public.get_viewing_limit(uuid,boolean)', FALSE),
  ('public.check_ai_quota(text)', FALSE),
  ('public.check_listing_quota()', FALSE),
  ('public.can_review_professional(uuid,uuid)', FALSE),
  ('public.has_buy_side_role(uuid)', FALSE),
  ('public.has_sell_side_role(uuid)', FALSE),
  ('public.record_role_switch_audit(text,text,text,boolean,boolean)', TRUE),
  ('public.record_role_switch_audit_for_user(uuid,uuid,text,text,text)', FALSE),
  ('public.reserve_ai_quota(text)', TRUE),
  ('public.reserve_ai_quota_for_user(uuid,text)', TRUE),
  ('public.submit_agent_data_input(date,text,text,text,numeric,text,text,text,text,text,text,text)', TRUE);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM (VALUES
      ('idx_conversations_closed_by', 'conversations', 'closed_by'),
      ('idx_firesale_interest_proof_of_funds_verified_by', 'firesale_interest', 'proof_of_funds_verified_by'),
      ('idx_firesale_interest_reserved_by', 'firesale_interest', 'reserved_by'),
      ('idx_firesale_interest_audit_log_actor_id', 'firesale_interest_audit_log', 'actor_id'),
      ('idx_firesale_interest_audit_log_deal_id', 'firesale_interest_audit_log', 'deal_id'),
      ('idx_professional_review_responses_responder_id', 'professional_review_responses', 'responder_id'),
      ('idx_profiles_account_moderated_by', 'profiles', 'account_moderated_by')
    ) AS target(index_name, table_name, column_name)
    LEFT JOIN pg_index AS index_state
      ON index_state.indexrelid = to_regclass(
        format('public.%I', target.index_name)
      )
      AND index_state.indrelid = to_regclass(
        format('public.%I', target.table_name)
      )
    LEFT JOIN pg_class AS index_relation
      ON index_relation.oid = index_state.indexrelid
    LEFT JOIN pg_am AS access_method
      ON access_method.oid = index_relation.relam
    WHERE index_state.indexrelid IS NULL
       OR access_method.amname <> 'btree'
       OR NOT index_state.indisvalid
       OR NOT index_state.indisready
       OR index_state.indisunique
       OR index_state.indpred IS NOT NULL
       OR index_state.indexprs IS NOT NULL
       OR index_state.indnkeyatts <> 1
       OR index_state.indnatts <> 1
       OR pg_get_indexdef(index_state.indexrelid, 1, TRUE) <> target.column_name
  ),
  'all seven legacy marker foreign-key indexes have canonical definitions'
);

SELECT is(
  (
    SELECT count(*)::INTEGER
    FROM legacy_reconciliation_function_targets AS target
    WHERE to_regprocedure(target.signature) IS NOT NULL
  ),
  24,
  'all required marker and collision functions exist'
);

SELECT ok(
  (
    SELECT bool_and(
      procedure_state.oid IS NOT NULL
      AND procedure_state.proowner = 'postgres'::regrole::oid
      AND procedure_state.prosecdef
    )
    FROM legacy_reconciliation_function_targets AS target
    LEFT JOIN pg_proc AS procedure_state
      ON procedure_state.oid = to_regprocedure(target.signature)
  ),
  'all reconciled functions are postgres-owned security definers'
);

SELECT ok(
  (
    SELECT bool_and(
      procedure_state.oid IS NOT NULL
      AND NOT COALESCE(
        has_function_privilege('anon', procedure_state.oid, 'EXECUTE'),
        TRUE
      )
      AND NOT COALESCE(
        has_function_privilege(
          'authenticated',
          procedure_state.oid,
          'EXECUTE'
        ),
        TRUE
      )
      AND COALESCE(
        has_function_privilege('service_role', procedure_state.oid, 'EXECUTE'),
        FALSE
      )
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
    )
    FROM legacy_reconciliation_function_targets AS target
    LEFT JOIN pg_proc AS procedure_state
      ON procedure_state.oid = to_regprocedure(target.signature)
  ),
  'all reconciled functions are service-only and not PUBLIC/browser executable'
);

SELECT ok(
  (
    SELECT bool_and(
      procedure_state.provolatile = 'v'
      AND COALESCE(procedure_state.proconfig, ARRAY[]::TEXT[])
        @> ARRAY['search_path=public']::TEXT[]
    )
    FROM legacy_reconciliation_function_targets AS target
    JOIN pg_proc AS procedure_state
      ON procedure_state.oid = to_regprocedure(target.signature)
    WHERE target.critical
  ),
  'canonical mutating RPCs are volatile with a pinned public search path'
);

SELECT is(
  (
    SELECT count(*)::INTEGER
    FROM pg_proc
    WHERE oid IN (
      to_regprocedure(
        'public.record_role_switch_audit(text,text,text,boolean,boolean)'
      ),
      to_regprocedure(
        'public.record_role_switch_audit_for_user(uuid,uuid,text,text,text)'
      )
    )
  ),
  2,
  'both canonical role-switch audit signatures exist'
);

SELECT ok(
  (
    SELECT
      procedure_state.provolatile = 'v'
      AND COALESCE(procedure_state.proconfig, ARRAY[]::TEXT[])
        @> ARRAY['search_path=pg_catalog, public']::TEXT[]
    FROM pg_proc AS procedure_state
    WHERE procedure_state.oid = to_regprocedure(
      'public.record_role_switch_audit_for_user(uuid,uuid,text,text,text)'
    )
  ),
  'operation-bound role-switch audit RPC keeps the hardened search path'
);

SELECT is(
  (
    SELECT count(*)::INTEGER
    FROM pg_proc
    WHERE oid IN (
      to_regprocedure('public.reserve_ai_quota(text)'),
      to_regprocedure('public.reserve_ai_quota_for_user(uuid,text)')
    )
  ),
  2,
  'both canonical AI quota reservation signatures exist'
);

SELECT ok(
  to_regprocedure(
    'public.submit_agent_data_input(date,text,text,text,numeric,text,text,text,text,text,text,text)'
  ) IS NOT NULL,
  'the canonical twelve-argument agent input RPC exists'
);

SELECT ok(
  to_regprocedure(
    'public.submit_agent_data_input(date,text,text,text,numeric,text,text,text,text,text,text)'
  ) IS NULL,
  'the obsolete eleven-argument agent input RPC is absent'
);

SELECT ok(
  COALESCE(
    (
      SELECT relation_state.relrowsecurity
      FROM pg_class AS relation_state
      WHERE relation_state.oid = to_regclass('public.agent_data_inputs')
    ),
    FALSE
  ),
  'agent_data_inputs has row-level security enabled'
);

SELECT is(
  (
    SELECT count(*)::INTEGER
    FROM pg_policy
    WHERE polrelid = to_regclass('public.agent_data_inputs')
      AND polcmd = 'a'
  ),
  1,
  'agent_data_inputs has exactly one direct INSERT policy'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policy AS policy_state
    WHERE policy_state.polrelid = to_regclass('public.agent_data_inputs')
      AND policy_state.polcmd = 'a'
      AND policy_state.polname = 'agent_data_inputs_insert_blocked'
      AND policy_state.polroles = ARRAY['authenticated'::regrole::oid]
      AND pg_get_expr(policy_state.polwithcheck, policy_state.polrelid) = 'false'
  ),
  'the canonical authenticated INSERT policy fails closed'
);

SELECT * FROM finish();

ROLLBACK;
