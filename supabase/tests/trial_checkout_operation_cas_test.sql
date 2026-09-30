-- Disposable local proof of the SQL predicates serialized by trialClaims.ts.
-- No provider or hosted database effects. Synthetic fixtures roll back.
BEGIN;
DO $$
BEGIN
  IF current_database() <> 'maiprop_t13trial_20260930_cas01'
    OR inet_server_addr() IS NOT NULL
    OR current_user <> 'postgres'
    OR EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid())
    OR EXISTS (SELECT 1 FROM pg_prepared_xacts WHERE database=current_database())
  THEN RAISE EXCEPTION 'trial CAS proof requires its exclusively owned local clone'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['anon','authenticated']) AS r
    WHERE has_table_privilege(r,'public.subscription_trial_claims','INSERT,UPDATE,DELETE')
    OR has_any_column_privilege(r,'public.subscription_trial_claims','INSERT,UPDATE'))
  THEN RAISE EXCEPTION 'trial envelope browser write authority exists'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.subscription_trial_claims'::regclass)
  THEN RAISE EXCEPTION 'trial claims RLS disabled'; END IF;
END $$;
SET LOCAL session_replication_role=replica;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-8000-000000000731','trial-cas-731@example.invalid'),
 ('00000000-0000-4000-8000-000000000732','trial-cas-732@example.invalid');
SET LOCAL session_replication_role=origin;
SET LOCAL ROLE service_role;
INSERT INTO public.subscription_trial_claims(id,user_id,plan_key,pricing_audience,stripe_customer_id,runtime_mode,livemode,status,metadata)
VALUES ('00000000-0000-4000-8000-000000000733','00000000-0000-4000-8000-000000000731','pro','participant','cus_local_trial_cas','test',false,'checkout_started',
 '{"trial_days":"7","checkout_operation_v1":{"revision":"00000000-0000-4000-8000-000000000734","dispatch_count":0,"key":"local-only"}}');
DO $$
DECLARE n integer;
BEGIN
  WITH changed AS (
    UPDATE public.subscription_trial_claims SET metadata=jsonb_set(jsonb_set(metadata,'{checkout_operation_v1,revision}','"00000000-0000-4000-8000-000000000735"'),'{checkout_operation_v1,dispatch_count}','1')
    WHERE id='00000000-0000-4000-8000-000000000733' AND user_id='00000000-0000-4000-8000-000000000731'
      AND runtime_mode='test' AND livemode=false AND stripe_customer_id='cus_local_trial_cas'
      AND status='checkout_started' AND stripe_subscription_id IS NULL AND stripe_checkout_session_id IS NULL
      AND metadata->'checkout_operation_v1'->>'revision'='00000000-0000-4000-8000-000000000734'
      AND metadata->'checkout_operation_v1'->>'dispatch_count'='0' RETURNING *) SELECT count(*) INTO n FROM changed;
  IF n<>1 THEN RAISE EXCEPTION 'first guarded dispatch did not win'; END IF;
  WITH changed AS (
    UPDATE public.subscription_trial_claims SET metadata='{}'
    WHERE id='00000000-0000-4000-8000-000000000733'
      AND metadata->'checkout_operation_v1'->>'revision'='00000000-0000-4000-8000-000000000734' RETURNING *) SELECT count(*) INTO n FROM changed;
  IF n<>0 THEN RAISE EXCEPTION 'stale revision overwrote envelope'; END IF;
  WITH changed AS (
    DELETE FROM public.subscription_trial_claims WHERE id='00000000-0000-4000-8000-000000000733'
      AND user_id='00000000-0000-4000-8000-000000000732' AND runtime_mode='test'
      AND metadata->'checkout_operation_v1'->>'revision'='00000000-0000-4000-8000-000000000735' RETURNING *) SELECT count(*) INTO n FROM changed;
  IF n<>0 THEN RAISE EXCEPTION 'cross-actor delete'; END IF;
  BEGIN
    INSERT INTO public.subscription_trial_claims(user_id,plan_key,pricing_audience,runtime_mode,livemode)
    VALUES ('00000000-0000-4000-8000-000000000731','pro','participant','test',false);
    RAISE EXCEPTION 'second reserved trial admitted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  UPDATE public.subscription_trial_claims SET stripe_subscription_id='sub_local_trial',status='trialing'
    WHERE id='00000000-0000-4000-8000-000000000733';
  WITH changed AS (
    UPDATE public.subscription_trial_claims SET status='checkout_abandoned'
    WHERE id='00000000-0000-4000-8000-000000000733' AND status='checkout_started'
      AND stripe_subscription_id IS NULL AND stripe_checkout_session_id IS NULL RETURNING *) SELECT count(*) INTO n FROM changed;
  IF n<>0 THEN RAISE EXCEPTION 'consumed trial was abandoned'; END IF;
  IF (SELECT metadata->'checkout_operation_v1'->>'key' FROM public.subscription_trial_claims WHERE id='00000000-0000-4000-8000-000000000733') <> 'local-only'
  THEN RAISE EXCEPTION 'operation lost'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000731',true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.subscription_trial_claims WHERE id='00000000-0000-4000-8000-000000000733')<>1 THEN RAISE EXCEPTION 'owner cannot read'; END IF;
  BEGIN
    UPDATE public.subscription_trial_claims SET metadata='{}' WHERE id='00000000-0000-4000-8000-000000000733';
    RAISE EXCEPTION 'authenticated envelope mutation allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000732',true);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.subscription_trial_claims WHERE id='00000000-0000-4000-8000-000000000733') THEN RAISE EXCEPTION 'other actor reads claim'; END IF;
END $$;
RESET ROLE;
SELECT 'trial JSON revision CAS, admission, and server-only envelope proof passed' AS result;
ROLLBACK;
