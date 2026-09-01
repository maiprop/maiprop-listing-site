-- Read-only schema evidence for the historical 20260602032000..040000
-- production/staging migration-history split. This query intentionally avoids
-- supabase_migrations.schema_migrations: reconciliation is based on final
-- schema postconditions, and function bodies are exposed only as SHA-256.

WITH function_targets(
  check_name,
  signature,
  must_exist,
  expected_volatility,
  expected_search_path
) AS (
  VALUES
    ('function.public.can_review_professional', 'public.can_review_professional(uuid,uuid)', TRUE, NULL::TEXT, NULL::TEXT),
    ('function.public.check_ai_quota', 'public.check_ai_quota(text)', TRUE, NULL::TEXT, NULL::TEXT),
    ('function.public.check_listing_quota', 'public.check_listing_quota()', TRUE, NULL::TEXT, NULL::TEXT),
    ('function.public.get_agent_monthly_input_count', 'public.get_agent_monthly_input_count(uuid)', TRUE, NULL::TEXT, NULL::TEXT),
    ('function.public.get_ai_call_monthly_limit', 'public.get_ai_call_monthly_limit(uuid,text)', TRUE, NULL::TEXT, NULL::TEXT),
    ('function.public.get_auction_alert_limit', 'public.get_auction_alert_limit(uuid)', TRUE, NULL::TEXT, NULL::TEXT),
    ('function.public.get_auction_listing_visible_limit', 'public.get_auction_listing_visible_limit(uuid)', TRUE, NULL::TEXT, NULL::TEXT),
    ('function.public.get_contact_monthly_limit', 'public.get_contact_monthly_limit(uuid)', TRUE, NULL::TEXT, NULL::TEXT),
    ('function.public.get_listing_limit', 'public.get_listing_limit(uuid)', TRUE, NULL::TEXT, NULL::TEXT),
    ('function.public.get_open_house_rsvp_monthly_limit', 'public.get_open_house_rsvp_monthly_limit(uuid)', TRUE, NULL::TEXT, NULL::TEXT),
    ('function.public.get_priority_ad_monthly_limit', 'public.get_priority_ad_monthly_limit(uuid)', TRUE, NULL::TEXT, NULL::TEXT),
    ('function.public.get_professionals_per_category_limit', 'public.get_professionals_per_category_limit(uuid)', TRUE, NULL::TEXT, NULL::TEXT),
    ('function.public.get_report_monthly_limit', 'public.get_report_monthly_limit(uuid)', TRUE, NULL::TEXT, NULL::TEXT),
    ('function.public.get_saved_search_limit', 'public.get_saved_search_limit(uuid)', TRUE, NULL::TEXT, NULL::TEXT),
    ('function.public.get_search_alert_limit', 'public.get_search_alert_limit(uuid)', TRUE, NULL::TEXT, NULL::TEXT),
    ('function.public.get_valuation_monthly_limit', 'public.get_valuation_monthly_limit(uuid)', TRUE, NULL::TEXT, NULL::TEXT),
    ('function.public.get_viewing_limit', 'public.get_viewing_limit(uuid,boolean)', TRUE, NULL::TEXT, NULL::TEXT),
    ('function.public.has_buy_side_role', 'public.has_buy_side_role(uuid)', TRUE, NULL::TEXT, NULL::TEXT),
    ('function.public.has_sell_side_role', 'public.has_sell_side_role(uuid)', TRUE, NULL::TEXT, NULL::TEXT),
    ('function.public.record_role_switch_audit', 'public.record_role_switch_audit(text,text,text,boolean,boolean)', TRUE, 'v', 'public'),
    ('function.public.record_role_switch_audit_for_user', 'public.record_role_switch_audit_for_user(uuid,uuid,text,text,text)', TRUE, 'v', 'pg_catalog, public'),
    ('function.public.reserve_ai_quota', 'public.reserve_ai_quota(text)', TRUE, 'v', 'public'),
    ('function.public.reserve_ai_quota_for_user', 'public.reserve_ai_quota_for_user(uuid,text)', TRUE, 'v', 'public'),
    ('function.public.submit_agent_data_input_canonical', 'public.submit_agent_data_input(date,text,text,text,numeric,text,text,text,text,text,text,text)', TRUE, 'v', 'public'),
    ('function.public.submit_agent_data_input_obsolete_absent', 'public.submit_agent_data_input(date,text,text,text,numeric,text,text,text,text,text,text)', FALSE, NULL::TEXT, NULL::TEXT)
),
function_observed AS (
  SELECT
    target.check_name,
    target.signature,
    target.must_exist,
    target.expected_volatility,
    target.expected_search_path,
    procedure_state.oid,
    pg_get_userbyid(procedure_state.proowner) AS owner_name,
    procedure_state.prosecdef AS security_definer,
    procedure_state.provolatile::TEXT AS volatility,
    COALESCE(
      (
        SELECT jsonb_agg(setting ORDER BY setting)
        FROM unnest(procedure_state.proconfig) AS config(setting)
      ),
      '[]'::JSONB
    ) AS config,
    CASE
      WHEN procedure_state.oid IS NULL THEN FALSE
      ELSE EXISTS (
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
    END AS public_execute,
    COALESCE(
      has_function_privilege('anon', procedure_state.oid, 'EXECUTE'),
      FALSE
    ) AS anon_execute,
    COALESCE(
      has_function_privilege('authenticated', procedure_state.oid, 'EXECUTE'),
      FALSE
    ) AS authenticated_execute,
    COALESCE(
      has_function_privilege('service_role', procedure_state.oid, 'EXECUTE'),
      FALSE
    ) AS service_execute,
    CASE
      WHEN procedure_state.oid IS NULL THEN NULL
      ELSE encode(
        extensions.digest(
          convert_to(pg_get_functiondef(procedure_state.oid), 'UTF8'),
          'sha256'
        ),
        'hex'
      )
    END AS definition_sha256
  FROM function_targets AS target
  LEFT JOIN pg_proc AS procedure_state
    ON procedure_state.oid = to_regprocedure(target.signature)
),
function_checks AS (
  SELECT
    observed.check_name AS name,
    CASE
      WHEN observed.must_exist THEN
        observed.oid IS NOT NULL
        AND observed.owner_name = 'postgres'
        AND observed.security_definer
        AND NOT observed.public_execute
        AND NOT observed.anon_execute
        AND NOT observed.authenticated_execute
        AND observed.service_execute
        AND (
          observed.expected_volatility IS NULL
          OR observed.volatility = observed.expected_volatility
        )
        AND (
          observed.expected_search_path IS NULL
          OR observed.config @> jsonb_build_array(
            'search_path=' || observed.expected_search_path
          )
        )
      ELSE observed.oid IS NULL
    END AS ok,
    'sha256:' || encode(
      extensions.digest(
        convert_to(
          jsonb_build_object(
            'signature', observed.signature,
            'exists', observed.oid IS NOT NULL,
            'owner', observed.owner_name,
            'security_definer', observed.security_definer,
            'volatility', observed.volatility,
            'config', observed.config,
            'public_execute', observed.public_execute,
            'anon_execute', observed.anon_execute,
            'authenticated_execute', observed.authenticated_execute,
            'service_execute', observed.service_execute,
            'definition_sha256', observed.definition_sha256
          )::TEXT,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) AS fingerprint
  FROM function_observed AS observed
),
index_targets(check_name, index_name, table_name, column_name) AS (
  VALUES
    ('index.public.idx_conversations_closed_by', 'idx_conversations_closed_by', 'conversations', 'closed_by'),
    ('index.public.idx_firesale_interest_audit_log_actor_id', 'idx_firesale_interest_audit_log_actor_id', 'firesale_interest_audit_log', 'actor_id'),
    ('index.public.idx_firesale_interest_audit_log_deal_id', 'idx_firesale_interest_audit_log_deal_id', 'firesale_interest_audit_log', 'deal_id'),
    ('index.public.idx_firesale_interest_proof_of_funds_verified_by', 'idx_firesale_interest_proof_of_funds_verified_by', 'firesale_interest', 'proof_of_funds_verified_by'),
    ('index.public.idx_firesale_interest_reserved_by', 'idx_firesale_interest_reserved_by', 'firesale_interest', 'reserved_by'),
    ('index.public.idx_professional_review_responses_responder_id', 'idx_professional_review_responses_responder_id', 'professional_review_responses', 'responder_id'),
    ('index.public.idx_profiles_account_moderated_by', 'idx_profiles_account_moderated_by', 'profiles', 'account_moderated_by')
),
index_observed AS (
  SELECT
    target.check_name,
    target.index_name,
    target.table_name,
    target.column_name,
    index_state.indexrelid,
    access_method.amname AS access_method,
    index_state.indisvalid,
    index_state.indisready,
    index_state.indisunique,
    index_state.indnkeyatts,
    index_state.indnatts,
    index_state.indpred IS NOT NULL AS has_predicate,
    index_state.indexprs IS NOT NULL AS has_expression,
    CASE
      WHEN index_state.indexrelid IS NULL THEN NULL
      ELSE pg_get_indexdef(index_state.indexrelid, 1, TRUE)
    END AS indexed_column,
    CASE
      WHEN index_state.indexrelid IS NULL THEN NULL
      ELSE pg_get_indexdef(index_state.indexrelid)
    END AS definition
  FROM index_targets AS target
  LEFT JOIN pg_index AS index_state
    ON index_state.indexrelid = to_regclass(format('public.%I', target.index_name))
    AND index_state.indrelid = to_regclass(format('public.%I', target.table_name))
  LEFT JOIN pg_class AS index_relation
    ON index_relation.oid = index_state.indexrelid
  LEFT JOIN pg_am AS access_method
    ON access_method.oid = index_relation.relam
),
index_checks AS (
  SELECT
    observed.check_name AS name,
    observed.indexrelid IS NOT NULL
      AND observed.access_method = 'btree'
      AND observed.indisvalid
      AND observed.indisready
      AND NOT observed.indisunique
      AND observed.indnkeyatts = 1
      AND observed.indnatts = 1
      AND NOT observed.has_predicate
      AND NOT observed.has_expression
      AND observed.indexed_column = observed.column_name AS ok,
    'sha256:' || encode(
      extensions.digest(
        convert_to(
          jsonb_build_object(
            'index_name', observed.index_name,
            'table_name', observed.table_name,
            'column_name', observed.column_name,
            'exists', observed.indexrelid IS NOT NULL,
            'access_method', observed.access_method,
            'valid', observed.indisvalid,
            'ready', observed.indisready,
            'unique', observed.indisunique,
            'key_columns', observed.indnkeyatts,
            'total_columns', observed.indnatts,
            'has_predicate', observed.has_predicate,
            'has_expression', observed.has_expression,
            'indexed_column', observed.indexed_column,
            'definition', observed.definition
          )::TEXT,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) AS fingerprint
  FROM index_observed AS observed
),
agent_policy_state AS (
  SELECT
    relation_state.oid AS table_oid,
    relation_state.relrowsecurity,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'name', policy_state.polname,
            'command', policy_state.polcmd,
            'permissive', policy_state.polpermissive,
            'roles', COALESCE(
              (
                SELECT jsonb_agg(
                  COALESCE(role_state.rolname, 'PUBLIC')
                  ORDER BY COALESCE(role_state.rolname, 'PUBLIC')
                )
                FROM unnest(policy_state.polroles) AS policy_role(role_oid)
                LEFT JOIN pg_roles AS role_state
                  ON role_state.oid = policy_role.role_oid
              ),
              '[]'::JSONB
            ),
            'using', pg_get_expr(policy_state.polqual, policy_state.polrelid),
            'with_check', pg_get_expr(
              policy_state.polwithcheck,
              policy_state.polrelid
            )
          )
          ORDER BY policy_state.polname
        )
        FROM pg_policy AS policy_state
        WHERE policy_state.polrelid = relation_state.oid
          AND policy_state.polcmd = 'a'
      ),
      '[]'::JSONB
    ) AS insert_policies,
    (
      SELECT count(*)::INTEGER
      FROM pg_policy AS policy_state
      WHERE policy_state.polrelid = relation_state.oid
        AND policy_state.polcmd = 'a'
    ) AS insert_policy_count,
    (
      SELECT count(*)::INTEGER
      FROM pg_policy AS policy_state
      WHERE policy_state.polrelid = relation_state.oid
        AND policy_state.polcmd = 'a'
        AND policy_state.polname = 'agent_data_inputs_insert_blocked'
        AND policy_state.polroles = ARRAY['authenticated'::regrole::oid]
        AND pg_get_expr(policy_state.polwithcheck, policy_state.polrelid) = 'false'
    ) AS canonical_blocked_policy_count
  FROM pg_class AS relation_state
  WHERE relation_state.oid = to_regclass('public.agent_data_inputs')
),
agent_policy_check AS (
  SELECT
    'policy.public.agent_data_inputs_insert_blocked'::TEXT AS name,
    COALESCE(
      state.table_oid IS NOT NULL
      AND state.relrowsecurity
      AND state.insert_policy_count = 1
      AND state.canonical_blocked_policy_count = 1,
      FALSE
    ) AS ok,
    'sha256:' || encode(
      extensions.digest(
        convert_to(
          jsonb_build_object(
            'table_exists', state.table_oid IS NOT NULL,
            'rls_enabled', state.relrowsecurity,
            'insert_policies', COALESCE(state.insert_policies, '[]'::JSONB)
          )::TEXT,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) AS fingerprint
  FROM (SELECT 1) AS singleton
  LEFT JOIN agent_policy_state AS state ON TRUE
),
base_checks AS (
  SELECT name, ok, fingerprint FROM function_checks
  UNION ALL
  SELECT name, ok, fingerprint FROM index_checks
  UNION ALL
  SELECT name, ok, fingerprint FROM agent_policy_check
),
aggregate_checks AS (
  SELECT
    'legacy.20260602034000_collision_converged'::TEXT AS name,
    bool_and(check_state.ok) AS ok,
    'sha256:' || encode(
      extensions.digest(
        convert_to(
          jsonb_agg(
            jsonb_build_object(
              'name', check_state.name,
              'ok', check_state.ok,
              'fingerprint', check_state.fingerprint
            )
            ORDER BY check_state.name
          )::TEXT,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) AS fingerprint
  FROM base_checks AS check_state
  WHERE check_state.name LIKE 'function.public.record_role_switch_audit%'
     OR check_state.name LIKE 'function.public.submit_agent_data_input%'
     OR check_state.name = 'policy.public.agent_data_inputs_insert_blocked'

  UNION ALL

  SELECT
    'legacy.20260602032000_040000_marker_effects_converged'::TEXT AS name,
    bool_and(check_state.ok) AS ok,
    'sha256:' || encode(
      extensions.digest(
        convert_to(
          jsonb_agg(
            jsonb_build_object(
              'name', check_state.name,
              'ok', check_state.ok,
              'fingerprint', check_state.fingerprint
            )
            ORDER BY check_state.name
          )::TEXT,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) AS fingerprint
  FROM base_checks AS check_state
),
all_checks AS (
  SELECT name, ok, fingerprint FROM base_checks
  UNION ALL
  SELECT name, ok, fingerprint FROM aggregate_checks
),
evidence AS (
  SELECT
    bool_and(check_state.ok) AS ok,
    jsonb_agg(
      jsonb_build_object(
        'name', check_state.name,
        'ok', check_state.ok,
        'fingerprint', check_state.fingerprint
      )
      ORDER BY check_state.name
    ) AS checks
  FROM all_checks AS check_state
)
SELECT jsonb_build_object(
  'schema_version', 1,
  'evidence_type', 'maiprop-legacy-migration-schema-evidence',
  'reconciliation_id', 'production-history-v1',
  'ok', evidence.ok,
  'checks', evidence.checks
)::TEXT
FROM evidence;
