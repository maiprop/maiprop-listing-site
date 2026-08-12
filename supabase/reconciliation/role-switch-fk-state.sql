WITH relation_state AS (
  SELECT
    pg_catalog.to_regclass('public.profiles') AS profiles_oid,
    pg_catalog.to_regclass('public.role_switch_history') AS history_oid
), constraint_state AS (
  SELECT
    relation_state.*,
    constraint_row.oid AS constraint_oid,
    constraint_row.conname AS constraint_name,
    constraint_row.contype::text AS constraint_type,
    constraint_row.convalidated AS validated,
    constraint_row.conrelid = relation_state.profiles_oid
      AS on_expected_table,
    constraint_row.confrelid = relation_state.history_oid
      AS references_expected_table,
    constraint_row.condeferrable AS constraint_deferrable,
    constraint_row.condeferred AS constraint_initially_deferred,
    CASE constraint_row.confdeltype
      WHEN 'a' THEN 'NO ACTION'
      WHEN 'r' THEN 'RESTRICT'
      WHEN 'c' THEN 'CASCADE'
      WHEN 'n' THEN 'SET NULL'
      WHEN 'd' THEN 'SET DEFAULT'
      ELSE NULL
    END AS delete_action,
    CASE constraint_row.confupdtype
      WHEN 'a' THEN 'NO ACTION'
      WHEN 'r' THEN 'RESTRICT'
      WHEN 'c' THEN 'CASCADE'
      WHEN 'n' THEN 'SET NULL'
      WHEN 'd' THEN 'SET DEFAULT'
      ELSE NULL
    END AS update_action,
    CASE constraint_row.confmatchtype
      WHEN 's' THEN 'SIMPLE'
      WHEN 'f' THEN 'FULL'
      WHEN 'p' THEN 'PARTIAL'
      ELSE NULL
    END AS match_type,
    pg_catalog.pg_get_constraintdef(constraint_row.oid, TRUE) AS definition,
    ARRAY(
      SELECT source_attribute.attname
      FROM pg_catalog.unnest(constraint_row.conkey)
        WITH ORDINALITY AS source_key(attribute_number, key_position)
      JOIN pg_catalog.pg_attribute AS source_attribute
        ON source_attribute.attrelid = constraint_row.conrelid
       AND source_attribute.attnum = source_key.attribute_number
      ORDER BY source_key.key_position
    ) AS key_columns,
    ARRAY(
      SELECT referenced_attribute.attname
      FROM pg_catalog.unnest(constraint_row.confkey)
        WITH ORDINALITY AS referenced_key(attribute_number, key_position)
      JOIN pg_catalog.pg_attribute AS referenced_attribute
        ON referenced_attribute.attrelid = constraint_row.confrelid
       AND referenced_attribute.attnum = referenced_key.attribute_number
      ORDER BY referenced_key.key_position
    ) AS referenced_columns
  FROM relation_state
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conname = 'profiles_role_switch_audit_id_fkey'
   AND constraint_row.conrelid = relation_state.profiles_oid
)
SELECT pg_catalog.jsonb_build_object(
  'schema_version', 2,
  'evidence_type', 'maiprop-role-switch-foreign-key-state',
  'constraint_name', COALESCE(
    constraint_name,
    'profiles_role_switch_audit_id_fkey'
  ),
  'exists', constraint_oid IS NOT NULL,
  'validated', COALESCE(validated, FALSE),
  'constraint_type', constraint_type,
  'on_expected_table', COALESCE(on_expected_table, FALSE),
  'references_expected_table', COALESCE(
    references_expected_table,
    FALSE
  ),
  'key_columns', pg_catalog.to_jsonb(COALESCE(key_columns, ARRAY[]::name[])),
  'referenced_columns', pg_catalog.to_jsonb(
    COALESCE(referenced_columns, ARRAY[]::name[])
  ),
  'delete_action', delete_action,
  'update_action', update_action,
  'match_type', match_type,
  'deferrable', COALESCE(constraint_deferrable, FALSE),
  'initially_deferred', COALESCE(
    constraint_initially_deferred,
    FALSE
  ),
  'definition', definition
)::text
FROM constraint_state;
