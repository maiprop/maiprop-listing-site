-- Remove Advisor-reported indexes that do not serve current read paths.
--
-- Kept:
-- - idx_project_views_project supports current project view counts.
-- - idx_subscription_trial_claims_user_id supports own-claim reads and webhook sync.

DROP INDEX IF EXISTS public.idx_project_views_viewed_at;
DROP INDEX IF EXISTS public.idx_subscription_trial_claims_status;
DROP INDEX IF EXISTS public.idx_subscription_trial_claims_customer_id;

DO $$
DECLARE
  required_index text;
  removed_index text;
BEGIN
  FOREACH required_index IN ARRAY ARRAY[
    'idx_project_views_project',
    'idx_subscription_trial_claims_user_id'
  ] LOOP
    IF to_regclass('public.' || required_index) IS NULL THEN
      RAISE EXCEPTION 'required advisor replacement/index path is missing: %', required_index;
    END IF;
  END LOOP;

  FOREACH removed_index IN ARRAY ARRAY[
    'idx_project_views_viewed_at',
    'idx_subscription_trial_claims_status',
    'idx_subscription_trial_claims_customer_id'
  ] LOOP
    IF to_regclass('public.' || removed_index) IS NOT NULL THEN
      RAISE EXCEPTION 'low-risk advisor index still exists: %', removed_index;
    END IF;
  END LOOP;
END $$;
