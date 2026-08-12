WITH relation_state AS (
  SELECT
    pg_catalog.to_regclass('public.profiles') AS profiles_oid,
    pg_catalog.to_regclass('public.role_switch_history') AS history_oid,
    pg_catalog.to_regclass('public.agent_data_inputs') AS agent_inputs_oid,
    pg_catalog.to_regclass(
      'public.idx_profiles_role_switch_audit_id'
    ) AS profiles_index_oid,
    pg_catalog.to_regclass(
      'public.idx_role_switch_history_reconciliation_due'
    ) AS history_index_oid,
    pg_catalog.to_regclass(
      'public.idx_agent_data_inputs_user_discount_invoice'
    ) AS invoice_index_oid
), index_state AS (
  SELECT
    relation_state.*,
    profiles_index.indisvalid AS profiles_index_valid,
    profiles_index.indisready AS profiles_index_ready,
    profiles_index.indislive AS profiles_index_live,
    profiles_index.indisunique AS profiles_index_unique,
    profiles_index.indnatts AS profiles_index_attribute_count,
    profiles_index.indnkeyatts AS profiles_index_key_attribute_count,
    profiles_index.indrelid = relation_state.profiles_oid
      AS profiles_index_on_expected_table,
    profiles_access_method.amname AS profiles_index_access_method,
    ARRAY(
      SELECT pg_catalog.pg_get_indexdef(
        relation_state.profiles_index_oid,
        key_position,
        TRUE
      )
      FROM pg_catalog.generate_series(
        1,
        COALESCE(profiles_index.indnkeyatts, 0)
      ) AS key_position
    ) AS profiles_index_key_columns,
    pg_catalog.pg_get_expr(
      profiles_index.indpred,
      profiles_index.indrelid,
      TRUE
    ) AS profiles_index_predicate,
    pg_catalog.pg_get_indexdef(
      relation_state.profiles_index_oid
    ) AS profiles_index_definition,
    history_index.indisvalid AS history_index_valid,
    history_index.indisready AS history_index_ready,
    history_index.indislive AS history_index_live,
    history_index.indisunique AS history_index_unique,
    history_index.indnatts AS history_index_attribute_count,
    history_index.indnkeyatts AS history_index_key_attribute_count,
    history_index.indrelid = relation_state.history_oid
      AS history_index_on_expected_table,
    history_access_method.amname AS history_index_access_method,
    ARRAY(
      SELECT pg_catalog.pg_get_indexdef(
        relation_state.history_index_oid,
        key_position,
        TRUE
      )
      FROM pg_catalog.generate_series(
        1,
        COALESCE(history_index.indnkeyatts, 0)
      ) AS key_position
    ) AS history_index_key_columns,
    pg_catalog.pg_get_expr(
      history_index.indpred,
      history_index.indrelid,
      TRUE
    ) AS history_index_predicate,
    pg_catalog.pg_get_indexdef(
      relation_state.history_index_oid
    ) AS history_index_definition,
    invoice_index.indisvalid AS invoice_index_valid,
    invoice_index.indisready AS invoice_index_ready,
    invoice_index.indislive AS invoice_index_live,
    invoice_index.indisunique AS invoice_index_unique,
    invoice_index.indnatts AS invoice_index_attribute_count,
    invoice_index.indnkeyatts AS invoice_index_key_attribute_count,
    invoice_index.indrelid = relation_state.agent_inputs_oid
      AS invoice_index_on_expected_table,
    invoice_access_method.amname AS invoice_index_access_method,
    ARRAY(
      SELECT pg_catalog.pg_get_indexdef(
        relation_state.invoice_index_oid,
        key_position,
        TRUE
      )
      FROM pg_catalog.generate_series(
        1,
        COALESCE(invoice_index.indnkeyatts, 0)
      ) AS key_position
    ) AS invoice_index_key_columns,
    pg_catalog.pg_get_expr(
      invoice_index.indpred,
      invoice_index.indrelid,
      TRUE
    ) AS invoice_index_predicate,
    pg_catalog.pg_get_indexdef(
      relation_state.invoice_index_oid
    ) AS invoice_index_definition
  FROM relation_state
  LEFT JOIN pg_catalog.pg_index AS profiles_index
    ON profiles_index.indexrelid = relation_state.profiles_index_oid
  LEFT JOIN pg_catalog.pg_class AS profiles_index_relation
    ON profiles_index_relation.oid = relation_state.profiles_index_oid
  LEFT JOIN pg_catalog.pg_am AS profiles_access_method
    ON profiles_access_method.oid = profiles_index_relation.relam
  LEFT JOIN pg_catalog.pg_index AS history_index
    ON history_index.indexrelid = relation_state.history_index_oid
  LEFT JOIN pg_catalog.pg_class AS history_index_relation
    ON history_index_relation.oid = relation_state.history_index_oid
  LEFT JOIN pg_catalog.pg_am AS history_access_method
    ON history_access_method.oid = history_index_relation.relam
  LEFT JOIN pg_catalog.pg_index AS invoice_index
    ON invoice_index.indexrelid = relation_state.invoice_index_oid
  LEFT JOIN pg_catalog.pg_class AS invoice_index_relation
    ON invoice_index_relation.oid = relation_state.invoice_index_oid
  LEFT JOIN pg_catalog.pg_am AS invoice_access_method
    ON invoice_access_method.oid = invoice_index_relation.relam
)
SELECT pg_catalog.jsonb_build_object(
  'schema_version', 4,
  'evidence_type', 'maiprop-role-switch-index-state',
  'profiles', pg_catalog.jsonb_build_object(
    'relation_exists', profiles_oid IS NOT NULL,
    'heap_bytes', CASE
      WHEN profiles_oid IS NULL THEN NULL
      ELSE pg_catalog.pg_relation_size(profiles_oid)
    END,
    'index', pg_catalog.jsonb_build_object(
      'exists', profiles_index_oid IS NOT NULL,
      'valid', COALESCE(profiles_index_valid, FALSE),
      'ready', COALESCE(profiles_index_ready, FALSE),
      'live', COALESCE(profiles_index_live, FALSE),
      'unique', COALESCE(profiles_index_unique, FALSE),
      'attribute_count', COALESCE(profiles_index_attribute_count, 0),
      'key_attribute_count', COALESCE(
        profiles_index_key_attribute_count,
        0
      ),
      'on_expected_table', COALESCE(
        profiles_index_on_expected_table,
        FALSE
      ),
      'access_method', profiles_index_access_method,
      'key_columns', pg_catalog.to_jsonb(profiles_index_key_columns),
      'predicate', profiles_index_predicate,
      'definition', profiles_index_definition
    )
  ),
  'role_switch_history', pg_catalog.jsonb_build_object(
    'relation_exists', history_oid IS NOT NULL,
    'heap_bytes', CASE
      WHEN history_oid IS NULL THEN NULL
      ELSE pg_catalog.pg_relation_size(history_oid)
    END,
    'index', pg_catalog.jsonb_build_object(
      'exists', history_index_oid IS NOT NULL,
      'valid', COALESCE(history_index_valid, FALSE),
      'ready', COALESCE(history_index_ready, FALSE),
      'live', COALESCE(history_index_live, FALSE),
      'unique', COALESCE(history_index_unique, FALSE),
      'attribute_count', COALESCE(history_index_attribute_count, 0),
      'key_attribute_count', COALESCE(
        history_index_key_attribute_count,
        0
      ),
      'on_expected_table', COALESCE(
        history_index_on_expected_table,
        FALSE
      ),
      'access_method', history_index_access_method,
      'key_columns', pg_catalog.to_jsonb(history_index_key_columns),
      'predicate', history_index_predicate,
      'definition', history_index_definition
    )
  ),
  'agent_data_inputs', pg_catalog.jsonb_build_object(
    'relation_exists', agent_inputs_oid IS NOT NULL,
    'heap_bytes', CASE
      WHEN agent_inputs_oid IS NULL THEN NULL
      ELSE pg_catalog.pg_relation_size(agent_inputs_oid)
    END,
    'index', pg_catalog.jsonb_build_object(
      'exists', invoice_index_oid IS NOT NULL,
      'valid', COALESCE(invoice_index_valid, FALSE),
      'ready', COALESCE(invoice_index_ready, FALSE),
      'live', COALESCE(invoice_index_live, FALSE),
      'unique', COALESCE(invoice_index_unique, FALSE),
      'attribute_count', COALESCE(invoice_index_attribute_count, 0),
      'key_attribute_count', COALESCE(
        invoice_index_key_attribute_count,
        0
      ),
      'on_expected_table', COALESCE(
        invoice_index_on_expected_table,
        FALSE
      ),
      'access_method', invoice_index_access_method,
      'key_columns', pg_catalog.to_jsonb(invoice_index_key_columns),
      'predicate', invoice_index_predicate,
      'definition', invoice_index_definition
    )
  )
)::text
FROM index_state;
