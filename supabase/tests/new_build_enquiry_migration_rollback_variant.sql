-- Explicit failure-finalization variant. Run only after
-- new_build_enquiry_migration_rollback_setup.sql and the expected failed migration;
-- it is intentionally outside ordinary *_test.sql discovery.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(8);

SELECT hasnt_column(
  'public',
  'new_building_leads',
  'submission_key',
  'failed migration leaves the additive column absent'
);
SELECT hasnt_function(
  'private',
  'current_user_owns_listing',
  ARRAY['uuid'],
  'failed migration leaves the owner helper absent'
);
SELECT hasnt_function(
  'private',
  'preserve_new_build_enquiry_submission',
  ARRAY[]::text[],
  'failed migration leaves the immutable-payload helper absent'
);
SELECT hasnt_function(
  'public',
  'submit_new_build_enquiry',
  ARRAY['uuid','uuid','uuid','text','text','text','text'],
  'failed migration leaves the submit RPC absent'
);
SELECT has_trigger(
  'public',
  'new_building_leads',
  'new_building_leads_preserve_submission_identity',
  'the pre-existing collision trigger survives rollback'
);
SELECT is(
  (
    SELECT p.proname
    FROM pg_trigger AS t
    JOIN pg_proc AS p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.new_building_leads'::regclass
      AND t.tgname = 'new_building_leads_preserve_submission_identity'
      AND NOT t.tgisinternal
  ),
  'task18_existing_submission_trigger'::name,
  'the pre-existing trigger still calls its original function'
);
SELECT is(
  (
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'new_building_leads'
      AND cmd = 'SELECT'
  ),
  'new_building_leads_select'::name,
  'failed migration preserves the source SELECT policy identity'
);
SELECT ok(
  (
    SELECT qual ILIKE '%listings%owner_id%auth.uid%'
      AND qual NOT ILIKE '%current_user_owns_listing%'
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'new_building_leads'
      AND cmd = 'SELECT'
  ),
  'failed migration restores the original source owner subquery'
);

SELECT * FROM finish();
ROLLBACK;
