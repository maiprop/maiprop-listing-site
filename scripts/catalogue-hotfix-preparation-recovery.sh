#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077
readonly replay_path="supabase/migrations/20260728115960_prepare_batched_os_duplicate_quarantine.sql"
readonly replay_sha256="a35a4f6390937a04202e81ef67d2bd6d98e00c0118b9d7bff7b85544f6ed7a5b"
if [ -z "${RUNNER_TEMP:-}" ] || [ -z "${TARGET_DB_URL:-}" ] || [ ! -r "$replay_path" ] ||
   [ "$(sha256sum "$replay_path" | awk '{print $1}')" != "$replay_sha256" ]; then
  echo "::error::Catalogue preparation recovery failed safely."
  exit 1
fi
driver="$(mktemp "$RUNNER_TEMP/catalogue-preparation-recovery.XXXXXX.sql")"
output="$(mktemp "$RUNNER_TEMP/catalogue-preparation-recovery.XXXXXX.out")"
replay_copy="$(mktemp "$RUNNER_TEMP/catalogue-preparation-recovery.XXXXXX.sql")"
cp -- "$replay_path" "$replay_copy"
chmod 600 "$driver" "$output" "$replay_copy"
if [ "$(sha256sum "$replay_copy" | awk '{print $1}')" != "$replay_sha256" ]; then
  echo "::error::Catalogue preparation recovery failed safely."
  exit 1
fi
trap 'rm -f -- "$driver" "$output" "$replay_copy"' EXIT
cat > "$driver" <<'RECOVERY_SQL'
\set ON_ERROR_STOP on
\set QUIET 1
SET ROLE postgres;
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.listings IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.listing_promotion_allocations IN SHARE MODE;
CREATE TEMP TABLE pg_temp.catalogue_recovery_history ON COMMIT PRESERVE ROWS AS
SELECT count(*)::bigint AS numeric_version_count,
  md5(COALESCE(string_agg(version, ',' ORDER BY version), '')) AS digest
FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]+$';
CREATE TEMP TABLE pg_temp.catalogue_recovery_plan ON COMMIT PRESERVE ROWS AS
WITH candidates AS MATERIALIZED (
  SELECT listing.id, listing.owner_id, private.extract_os_auction_id(listing.tags) AS provider_id,
    listing.status, listing.updated_at, listing.created_at
  FROM public.listings AS listing WHERE listing.listing_type = 'auction'::public.listing_type
), ranked AS MATERIALIZED (
  SELECT candidate.*, row_number() OVER (PARTITION BY candidate.provider_id ORDER BY
    CASE WHEN candidate.status = 'active'::public.listing_status THEN 1 ELSE 0 END DESC,
    candidate.updated_at DESC, candidate.created_at DESC, candidate.id DESC) AS identity_rank
  FROM candidates AS candidate WHERE candidate.provider_id IS NOT NULL
) SELECT id AS duplicate_listing_id, owner_id FROM ranked WHERE identity_rank > 1;
SELECT CASE WHEN (
  (SELECT COALESCE(json_agg(version ORDER BY version), '[]'::json)::text
   FROM supabase_migrations.schema_migrations
   WHERE version IN ('20260728115959','20260728115960','20260728120000','20260728121500','20260728123058','20260729120405'))
     = '["20260728115959", "20260728115960"]'
  AND EXISTS (
    SELECT 1 FROM pg_proc AS procedure
    WHERE procedure.oid = to_regprocedure('private.extract_os_auction_id(text[])')
      AND pg_get_userbyid(procedure.proowner) = 'postgres' AND procedure.prokind = 'f'
      AND procedure.prorettype = 'text'::regtype AND NOT procedure.prosecdef
      AND procedure.provolatile = 'i' AND procedure.proparallel = 's'
      AND COALESCE(procedure.proconfig, ARRAY[]::text[]) = ARRAY['search_path=""']::text[]
      AND md5(procedure.prosrc) = '532205de65120d3e34729a515d949f65'
  )
  AND 1 = (SELECT count(*) FROM pg_proc AS procedure
    CROSS JOIN LATERAL aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) AS privilege
    WHERE procedure.oid = to_regprocedure('private.extract_os_auction_id(text[])')
      AND privilege.privilege_type = 'EXECUTE' AND pg_get_userbyid(privilege.grantee) = 'service_role')
  AND NOT EXISTS (SELECT 1 FROM pg_proc AS procedure
    CROSS JOIN LATERAL aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) AS privilege
    WHERE procedure.oid = to_regprocedure('private.extract_os_auction_id(text[])')
      AND (privilege.privilege_type <> 'EXECUTE' OR privilege.grantee NOT IN
        (procedure.proowner, (SELECT oid FROM pg_roles WHERE rolname = 'service_role'))))
  AND COALESCE((SELECT relation.relkind = 'r' AND relation.relpersistence = 'p'
    AND relation.relrowsecurity AND NOT relation.relforcerowsecurity
    AND pg_get_userbyid(relation.relowner) = 'postgres'
    FROM pg_class AS relation WHERE relation.oid = to_regclass('private.os_auction_invalid_identity_quarantine')), false)
  AND (SELECT count(*) FROM pg_attribute AS attribute
    WHERE attribute.attrelid = to_regclass('private.os_auction_invalid_identity_quarantine')
      AND attribute.attnum > 0 AND NOT attribute.attisdropped) = 5
  AND (SELECT count(*) FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid = to_regclass('private.os_auction_invalid_identity_quarantine')) = 3
  AND NOT EXISTS (SELECT 1 FROM pg_class AS relation
    CROSS JOIN LATERAL aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner))) AS privilege
    WHERE relation.oid = to_regclass('private.os_auction_invalid_identity_quarantine')
      AND privilege.grantee IN (0, (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role'))))
  AND NOT EXISTS (SELECT 1 FROM public.listings AS listing
    WHERE COALESCE(listing.tags, '{}'::text[]) @> ARRAY['source:maiprop-os']::text[]
      AND NOT COALESCE(listing.tags, '{}'::text[]) @> ARRAY['source:maiprop-os-duplicate-quarantine']::text[]
      AND (listing.listing_type <> 'auction'::public.listing_type OR private.extract_os_auction_id(listing.tags) IS NULL))
  AND COALESCE((SELECT relation.relkind = 'r' AND relation.relpersistence = 'p'
    AND NOT relation.relrowsecurity AND NOT relation.relforcerowsecurity
    AND pg_get_userbyid(relation.relowner) = 'postgres'
    FROM pg_class AS relation WHERE relation.oid = to_regclass('private.os_auction_duplicate_quarantine')), false)
  AND NOT EXISTS (SELECT 1 FROM pg_class AS relation
    CROSS JOIN LATERAL aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner))) AS privilege
    WHERE relation.oid = to_regclass('private.os_auction_duplicate_quarantine') AND privilege.grantee <> relation.relowner)
  AND to_regclass('public.idx_listings_os_auction_id_unique') IS NULL
  AND NOT EXISTS (SELECT 1 FROM pg_attribute AS attribute WHERE attribute.attrelid = 'public.listings'::regclass
    AND attribute.attname = 'os_auction_id' AND attribute.attnum > 0 AND NOT attribute.attisdropped)
  AND NOT EXISTS (SELECT 1 FROM pg_constraint AS constraint_definition WHERE constraint_definition.conrelid = 'public.listings'::regclass
    AND constraint_definition.conname = 'listings_os_auction_source_identity_valid')
  AND (SELECT count(*) FROM pg_temp.catalogue_recovery_plan) = 600
  AND NOT EXISTS (SELECT 1 FROM pg_temp.catalogue_recovery_plan WHERE owner_id IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM pg_temp.catalogue_recovery_plan AS plan JOIN public.listing_promotion_allocations AS allocation
    ON allocation.listing_id = plan.duplicate_listing_id
    WHERE allocation.ends_at > statement_timestamp() AND allocation.revoked_at IS NULL)
  AND (SELECT count(*) FROM private.os_auction_duplicate_quarantine) = 47123
  AND (SELECT count(*) FROM public.listings AS listing WHERE COALESCE(listing.tags, '{}'::text[])
    @> ARRAY['source:maiprop-os-duplicate-quarantine']::text[]) = 47123
  AND NOT EXISTS (SELECT 1 FROM private.os_auction_duplicate_quarantine AS quarantine
    JOIN public.listing_promotion_allocations AS allocation ON allocation.listing_id = quarantine.duplicate_listing_id
    WHERE allocation.ends_at > statement_timestamp() AND allocation.revoked_at IS NULL)
) THEN 'true' ELSE 'false' END AS recovery_replay \gset
\if :recovery_replay
\i :recovery_replay_file
\else
COMMIT;
\endif
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.listings IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.listing_promotion_allocations IN SHARE MODE;
TRUNCATE pg_temp.catalogue_recovery_plan;
INSERT INTO pg_temp.catalogue_recovery_plan
WITH candidates AS MATERIALIZED (
  SELECT listing.id, listing.owner_id, private.extract_os_auction_id(listing.tags) AS provider_id,
    listing.status, listing.updated_at, listing.created_at
  FROM public.listings AS listing WHERE listing.listing_type = 'auction'::public.listing_type
), ranked AS MATERIALIZED (
  SELECT candidate.*, row_number() OVER (PARTITION BY candidate.provider_id ORDER BY
    CASE WHEN candidate.status = 'active'::public.listing_status THEN 1 ELSE 0 END DESC,
    candidate.updated_at DESC, candidate.created_at DESC, candidate.id DESC) AS identity_rank
  FROM candidates AS candidate WHERE candidate.provider_id IS NOT NULL
) SELECT id AS duplicate_listing_id, owner_id FROM ranked WHERE identity_rank > 1;
DO $$
BEGIN
  IF NOT (
    (SELECT COALESCE(json_agg(version ORDER BY version), '[]'::json)::text FROM supabase_migrations.schema_migrations
      WHERE version IN ('20260728115959','20260728115960','20260728120000','20260728121500','20260728123058','20260729120405'))
      = '["20260728115959", "20260728115960"]'
    AND EXISTS (SELECT 1 FROM pg_proc AS procedure WHERE procedure.oid = to_regprocedure('private.extract_os_auction_id(text[])')
      AND pg_get_userbyid(procedure.proowner) = 'postgres' AND procedure.prokind = 'f'
      AND procedure.prorettype = 'text'::regtype AND NOT procedure.prosecdef AND procedure.provolatile = 'i'
      AND procedure.proparallel = 's' AND COALESCE(procedure.proconfig, ARRAY[]::text[]) = ARRAY['search_path=""']::text[]
      AND md5(procedure.prosrc) = '532205de65120d3e34729a515d949f65')
    AND NOT EXISTS (SELECT 1 FROM pg_proc AS procedure
      CROSS JOIN LATERAL aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) AS privilege
      WHERE procedure.oid = to_regprocedure('private.extract_os_auction_id(text[])')
        AND (privilege.privilege_type <> 'EXECUTE' OR privilege.grantee NOT IN
          (procedure.proowner, (SELECT oid FROM pg_roles WHERE rolname = 'service_role'))))
    AND 1 = (SELECT count(*) FROM pg_proc AS procedure
      CROSS JOIN LATERAL aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) AS privilege
      WHERE procedure.oid = to_regprocedure('private.extract_os_auction_id(text[])')
        AND privilege.privilege_type = 'EXECUTE' AND pg_get_userbyid(privilege.grantee) = 'service_role')
    AND COALESCE((SELECT relation.relkind = 'r' AND relation.relpersistence = 'p'
      AND NOT relation.relrowsecurity AND NOT relation.relforcerowsecurity
      AND pg_get_userbyid(relation.relowner) = 'postgres'
      FROM pg_class AS relation WHERE relation.oid = to_regclass('private.os_auction_duplicate_quarantine')), false)
    AND COALESCE((SELECT relation.relkind = 'r' AND relation.relpersistence = 'p'
      AND relation.relrowsecurity AND NOT relation.relforcerowsecurity
      AND pg_get_userbyid(relation.relowner) = 'postgres'
      FROM pg_class AS relation WHERE relation.oid = to_regclass('private.os_auction_invalid_identity_quarantine')), false)
    AND (SELECT count(*) FROM pg_attribute AS attribute
      WHERE attribute.attrelid = to_regclass('private.os_auction_invalid_identity_quarantine')
        AND attribute.attnum > 0 AND NOT attribute.attisdropped) = 5
    AND (SELECT count(*) FROM pg_constraint AS constraint_definition
      WHERE constraint_definition.conrelid = to_regclass('private.os_auction_invalid_identity_quarantine')) = 3
    AND NOT EXISTS (SELECT 1 FROM pg_class AS relation
      CROSS JOIN LATERAL aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner))) AS privilege
      WHERE relation.oid = to_regclass('private.os_auction_invalid_identity_quarantine')
        AND privilege.grantee IN (0, (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role'))))
    AND (SELECT count(*) FROM pg_attribute AS attribute
      WHERE attribute.attrelid = to_regclass('private.os_auction_duplicate_quarantine')
        AND attribute.attnum > 0 AND NOT attribute.attisdropped) = 7
    AND (SELECT count(*) FROM pg_constraint AS constraint_definition
      WHERE constraint_definition.conrelid = to_regclass('private.os_auction_duplicate_quarantine')) = 5
    AND NOT EXISTS (SELECT 1 FROM pg_class AS relation
      CROSS JOIN LATERAL aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner))) AS privilege
      WHERE relation.oid = to_regclass('private.os_auction_duplicate_quarantine')
        AND privilege.grantee <> relation.relowner)
    AND NOT EXISTS (SELECT 1 FROM pg_temp.catalogue_recovery_plan WHERE owner_id IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM pg_temp.catalogue_recovery_plan AS plan
      JOIN public.listing_promotion_allocations AS allocation ON allocation.listing_id = plan.duplicate_listing_id
      WHERE allocation.ends_at > statement_timestamp() AND allocation.revoked_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM private.os_auction_duplicate_quarantine AS quarantine
      LEFT JOIN public.listings AS listing ON listing.id = quarantine.duplicate_listing_id
      LEFT JOIN public.listings AS canonical ON canonical.id = quarantine.canonical_listing_id
      WHERE listing.id IS NULL OR canonical.id IS NULL OR listing.owner_id IS NOT NULL
        OR private.extract_os_auction_id(quarantine.previous_tags) IS DISTINCT FROM quarantine.provider_id
        OR private.extract_os_auction_id(canonical.tags) IS DISTINCT FROM quarantine.provider_id
        OR NOT COALESCE(listing.tags, '{}'::text[]) @> ARRAY['source:maiprop-os-duplicate-quarantine']::text[])
    AND NOT EXISTS (SELECT 1 FROM public.listings AS listing
      WHERE COALESCE(listing.tags, '{}'::text[]) @> ARRAY['source:maiprop-os-duplicate-quarantine']::text[]
        AND NOT EXISTS (SELECT 1 FROM private.os_auction_duplicate_quarantine AS quarantine
          WHERE quarantine.duplicate_listing_id = listing.id))
    AND NOT EXISTS (SELECT 1 FROM private.os_auction_invalid_identity_quarantine AS quarantine
      LEFT JOIN public.listings AS listing ON listing.id = quarantine.listing_id
      LEFT JOIN public.listing_promotion_allocations AS allocation
        ON allocation.listing_id = quarantine.listing_id
       AND allocation.ends_at > statement_timestamp() AND allocation.revoked_at IS NULL
      WHERE listing.id IS NULL OR listing.owner_id IS NOT NULL OR allocation.listing_id IS NOT NULL)

    AND (SELECT count(*) FROM pg_temp.catalogue_recovery_plan) = 0
    AND (SELECT count(*) FROM private.os_auction_duplicate_quarantine) = 47723
    AND (SELECT count(*) FROM public.listings AS listing WHERE COALESCE(listing.tags, '{}'::text[])
      @> ARRAY['source:maiprop-os-duplicate-quarantine']::text[]) = 47723
    AND to_regclass('public.idx_listings_os_auction_id_unique') IS NULL
    AND NOT EXISTS (SELECT 1 FROM pg_attribute AS attribute WHERE attribute.attrelid = 'public.listings'::regclass
      AND attribute.attname = 'os_auction_id' AND attribute.attnum > 0 AND NOT attribute.attisdropped)
    AND NOT EXISTS (SELECT 1 FROM pg_constraint AS constraint_definition WHERE constraint_definition.conrelid = 'public.listings'::regclass
      AND constraint_definition.conname = 'listings_os_auction_source_identity_valid')
    AND NOT EXISTS (SELECT 1 FROM public.listings AS listing WHERE COALESCE(listing.tags, '{}'::text[])
      @> ARRAY['source:maiprop-os']::text[] AND NOT COALESCE(listing.tags, '{}'::text[])
      @> ARRAY['source:maiprop-os-duplicate-quarantine']::text[] AND
      (listing.listing_type <> 'auction'::public.listing_type OR private.extract_os_auction_id(listing.tags) IS NULL))
    AND NOT EXISTS (SELECT 1 FROM private.os_auction_duplicate_quarantine AS quarantine
      JOIN public.listing_promotion_allocations AS allocation ON allocation.listing_id = quarantine.duplicate_listing_id
      WHERE allocation.ends_at > statement_timestamp() AND allocation.revoked_at IS NULL)
    AND (SELECT numeric_version_count FROM pg_temp.catalogue_recovery_history) = (
      SELECT count(*)::bigint FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]+$'
    )
    AND (SELECT digest FROM pg_temp.catalogue_recovery_history) = (
      SELECT md5(COALESCE(string_agg(version, ',' ORDER BY version), ''))
      FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]+$'
    )
  ) THEN RAISE EXCEPTION 'catalogue_preparation_recovery_poststate_invalid' USING ERRCODE = 'P0001';
  END IF;
END;
$$;
COMMIT;
RECOVERY_SQL
if ! psql "$TARGET_DB_URL" --no-psqlrc --set ON_ERROR_STOP=1 --set VERBOSITY=terse --set "recovery_replay_file=$replay_copy" --file "$driver" >"$output" 2>&1; then
  echo "::error::Catalogue preparation recovery failed safely."
  exit 1
fi
echo "::notice::Catalogue preparation recovery completed safely."
