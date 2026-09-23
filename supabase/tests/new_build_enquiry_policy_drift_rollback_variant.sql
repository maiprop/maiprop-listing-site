-- Run after new_build_enquiry_policy_drift_setup.sql and the expected failed migration.
-- This finalizer is intentionally outside ordinary *_test.sql discovery.
\set ON_ERROR_STOP on
\if :{?drift_case}
\else
  \echo 'drift_case is required'
  \quit 2
\endif

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(7);
SELECT set_config('task18.drift_case', :'drift_case', true);

SELECT hasnt_column('public', 'new_building_leads', 'submission_key', 'rejected drift leaves additive column absent');
SELECT hasnt_function('private', 'current_user_owns_listing', ARRAY['uuid'], 'rejected drift leaves owner helper absent');
SELECT hasnt_function('private', 'preserve_new_build_enquiry_submission', ARRAY[]::text[], 'rejected drift leaves immutable helper absent');
SELECT hasnt_function(
  'public',
  'submit_new_build_enquiry',
  ARRAY['uuid','uuid','uuid','text','text','text','text'],
  'rejected drift leaves submit RPC absent'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_policies WHERE schemaname='public' AND tablename='new_building_leads'),
  CASE WHEN current_setting('task18.drift_case')='extra_all' THEN 3 ELSE 2 END,
  'rejected drift preserves the complete policy set'
);
SELECT ok(
  CASE current_setting('task18.drift_case')
    WHEN 'null_select' THEN (
      SELECT qual IS NULL
      FROM pg_policies
      WHERE schemaname='public' AND tablename='new_building_leads' AND policyname='new_building_leads_select'
    )
    WHEN 'null_insert' THEN (
      SELECT with_check IS NULL
      FROM pg_policies
      WHERE schemaname='public' AND tablename='new_building_leads' AND policyname='new_building_leads_insert'
    )
    WHEN 'extra_all' THEN EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname='public' AND tablename='new_building_leads'
        AND policyname='task18_unexpected_all' AND cmd='ALL'
    )
    ELSE false
  END,
  'the injected unsupported policy drift remains byte-for-byte in place'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_trigger WHERE tgrelid='public.new_building_leads'::regclass AND tgname='new_building_leads_preserve_submission_identity'),
  0,
  'rejected drift leaves the trigger set unchanged'
);

SELECT * FROM finish();
ROLLBACK;
