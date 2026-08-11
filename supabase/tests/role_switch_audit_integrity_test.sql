BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(26);

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id)
VALUES
  ('93000000-0000-4000-8000-000000000001'),
  ('93000000-0000-4000-8000-000000000002'),
  ('93000000-0000-4000-8000-000000000003'),
  ('93000000-0000-4000-8000-000000000004'),
  ('93000000-0000-4000-8000-000000000005'),
  ('93000000-0000-4000-8000-000000000006'),
  ('93000000-0000-4000-8000-000000000007');
INSERT INTO public.profiles (user_id, role, participant_type)
VALUES
  ('93000000-0000-4000-8000-000000000001', 'buyer', 'buyer'),
  ('93000000-0000-4000-8000-000000000002', 'buyer', NULL),
  ('93000000-0000-4000-8000-000000000003', 'buyer', 'buyer');
SET LOCAL session_replication_role = origin;

SELECT throws_ok(
  $$SELECT public.complete_onboarding_role_for_user(
    '93000000-0000-4000-8000-000000000001', 'seller', 'seller'
  )$$,
  'P0001',
  'role_switch_audit_required',
  'an established profile cannot bypass begin/audit with the direct completion RPC'
);

SELECT lives_ok(
  $$SELECT public.complete_onboarding_role_for_user(
    '93000000-0000-4000-8000-000000000001', 'buyer', 'buyer'
  )$$,
  'same-role completion stays idempotent for an established profile'
);

SELECT lives_ok(
  $$SELECT public.complete_onboarding_role_for_user(
    '93000000-0000-4000-8000-000000000002', 'seller', 'seller'
  )$$,
  'a genuinely uninitialized profile can complete first onboarding without an audit'
);

INSERT INTO public.role_switch_history (
  id, user_id, from_type, to_type, switch_kind, had_active_sub,
  sub_cancelled, billing_outcome, billing_reconciliation_required,
  billing_finalized_at
) VALUES (
  '94000000-0000-4000-8000-000000000003',
  '93000000-0000-4000-8000-000000000003',
  'buyer', 'seller', 'same-tier', false, false, 'not_required', false, now()
);
UPDATE public.profiles
SET
  role_switch_in_progress_at = now(),
  role_switch_audit_id = '94000000-0000-4000-8000-000000000003'
WHERE user_id = '93000000-0000-4000-8000-000000000003';

SELECT lives_ok(
  $$SELECT public.complete_onboarding_role_for_user(
    '93000000-0000-4000-8000-000000000003', 'seller', 'seller'
  )$$,
  'a finalized audit bound to the exact destination authorizes completion'
);

SELECT is(
  (SELECT role::text FROM public.profiles WHERE user_id = '93000000-0000-4000-8000-000000000003'),
  'seller',
  'the bound audit completes only its recorded destination'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.claim_role_switch_reconciliation_batch(uuid,integer,integer)',
    'EXECUTE'
  ),
  'anon cannot claim reconciliation leases'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.claim_role_switch_reconciliation_batch(uuid,integer,integer)',
    'EXECUTE'
  ),
  'authenticated users cannot claim reconciliation leases'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.claim_role_switch_reconciliation_batch(uuid,integer,integer)',
    'EXECUTE'
  ),
  'service_role can claim reconciliation leases'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.release_role_switch_reconciliation_claims(uuid,uuid[])',
    'EXECUTE'
  ),
  'anon cannot release reconciliation leases'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.release_role_switch_reconciliation_claims(uuid,uuid[])',
    'EXECUTE'
  ),
  'authenticated users cannot release reconciliation leases'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.release_role_switch_reconciliation_claims(uuid,uuid[])',
    'EXECUTE'
  ),
  'service_role can release reconciliation leases'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.complete_role_switch_reconciliation_attempt(uuid,uuid,uuid,text,text,boolean,integer,integer,integer)',
    'EXECUTE'
  ),
  'anon cannot complete reconciliation leases'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.complete_role_switch_reconciliation_attempt(uuid,uuid,uuid,text,text,boolean,integer,integer,integer)',
    'EXECUTE'
  ),
  'authenticated users cannot complete reconciliation leases'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.complete_role_switch_reconciliation_attempt(uuid,uuid,uuid,text,text,boolean,integer,integer,integer)',
    'EXECUTE'
  ),
  'service_role can complete reconciliation leases'
);

SELECT is(
  (SELECT count(*) FROM cron.job WHERE jobname = 'reconcile-role-switch-billing'),
  1::bigint,
  'exactly one reconciliation cron job is installed'
);
SELECT is(
  (SELECT schedule FROM cron.job WHERE jobname = 'reconcile-role-switch-billing'),
  '*/5 * * * *',
  'reconciliation cron runs every five minutes'
);
SELECT is(
  (SELECT command FROM cron.job WHERE jobname = 'reconcile-role-switch-billing'),
  'SELECT private.invoke_role_switch_billing_reconciliation();',
  'reconciliation cron invokes the private boundary'
);

INSERT INTO public.role_switch_history (
  id,
  user_id,
  from_type,
  to_type,
  switch_kind,
  had_active_sub,
  sub_cancelled,
  billing_outcome,
  billing_reconciliation_required,
  billing_reconciliation_attempt_count,
  billing_reconciliation_next_attempt_at,
  billing_reconciliation_lock_token,
  billing_reconciliation_locked_at
) VALUES
  (
    '95000000-0000-4000-8000-000000000004',
    '93000000-0000-4000-8000-000000000004',
    'buyer', NULL, 'same-tier', NULL, false, 'unknown', true, 0,
    now() - interval '1 minute', NULL, NULL
  ),
  (
    '95000000-0000-4000-8000-000000000005',
    '93000000-0000-4000-8000-000000000005',
    'buyer', NULL, 'same-tier', NULL, false, 'unknown', true, 0,
    now() - interval '1 minute',
    '97000000-0000-4000-8000-000000000005', now()
  ),
  (
    '95000000-0000-4000-8000-000000000006',
    '93000000-0000-4000-8000-000000000006',
    'buyer', NULL, 'same-tier', NULL, false, 'unknown', true, 1,
    now() - interval '1 minute',
    '97000000-0000-4000-8000-000000000006', now() - interval '16 minutes'
  ),
  (
    '95000000-0000-4000-8000-000000000007',
    '93000000-0000-4000-8000-000000000007',
    'buyer', NULL, 'same-tier', NULL, false, 'unknown', true, 6,
    now() - interval '1 minute', NULL, NULL
  );

SELECT results_eq(
  $$
    SELECT audit_id, user_id, lock_token, attempt_count
    FROM public.claim_role_switch_reconciliation_batch(
      '96000000-0000-4000-8000-000000000001', 10, 6
    )
    ORDER BY audit_id
  $$,
  $$
    VALUES
      (
        '95000000-0000-4000-8000-000000000004'::uuid,
        '93000000-0000-4000-8000-000000000004'::uuid,
        '96000000-0000-4000-8000-000000000001'::uuid,
        1
      ),
      (
        '95000000-0000-4000-8000-000000000006'::uuid,
        '93000000-0000-4000-8000-000000000006'::uuid,
        '96000000-0000-4000-8000-000000000001'::uuid,
        2
      )
  $$,
  'claiming takes due rows and stale locks while preserving exact lease bindings'
);

SELECT results_eq(
  $$
    SELECT id, billing_reconciliation_attempt_count
    FROM public.role_switch_history
    WHERE id IN (
      '95000000-0000-4000-8000-000000000004',
      '95000000-0000-4000-8000-000000000006'
    )
    ORDER BY id
  $$,
  $$
    VALUES
      ('95000000-0000-4000-8000-000000000004'::uuid, 0),
      ('95000000-0000-4000-8000-000000000006'::uuid, 1)
  $$,
  'claiming leases rows without consuming provider attempt budget'
);

SELECT lives_ok(
  $$SELECT public.release_role_switch_reconciliation_claims(
    '96000000-0000-4000-8000-000000000001',
    ARRAY['95000000-0000-4000-8000-000000000006'::uuid]
  )$$,
  'the exact worker can release deferred reconciliation leases'
);

SELECT ok(
  (
    SELECT billing_reconciliation_lock_token IS NULL
      AND billing_reconciliation_locked_at IS NULL
      AND billing_reconciliation_attempt_count = 1
    FROM public.role_switch_history
    WHERE id = '95000000-0000-4000-8000-000000000006'
  ),
  'releasing a deferred lease preserves its provider attempt budget'
);

SELECT is(
  (SELECT billing_reconciliation_attempt_count
   FROM public.role_switch_history
   WHERE id = '95000000-0000-4000-8000-000000000005'),
  0,
  'a fresh lock is not reclaimed'
);
SELECT is(
  (SELECT billing_reconciliation_attempt_count
   FROM public.role_switch_history
   WHERE id = '95000000-0000-4000-8000-000000000007'),
  6,
  'a row at the retry ceiling is not claimed again'
);

SELECT throws_ok(
  $$SELECT public.complete_role_switch_reconciliation_attempt(
    '95000000-0000-4000-8000-000000000004',
    '93000000-0000-4000-8000-000000000004',
    '96000000-0000-4000-8000-000000000002',
    'unknown', 'deadline', NULL, NULL, NULL, 1
  )$$,
  'P0002',
  'role_switch_reconciliation_lease_lost',
  'completion rejects a mismatched lease token'
);

SELECT lives_ok(
  $$SELECT public.complete_role_switch_reconciliation_attempt(
    '95000000-0000-4000-8000-000000000004',
    '93000000-0000-4000-8000-000000000004',
    '96000000-0000-4000-8000-000000000001',
    'unknown', 'deadline', NULL, NULL, NULL, 1
  )$$,
  'the exact lease can finalize an exhausted retry'
);

SELECT ok(
  (
    SELECT billing_outcome = 'failed'
      AND billing_reconciliation_required = false
      AND billing_reconciliation_attempt_count = 1
      AND billing_reconciliation_exhausted_at IS NOT NULL
      AND billing_reconciliation_lock_token IS NULL
      AND billing_reconciliation_locked_at IS NULL
    FROM public.role_switch_history
    WHERE id = '95000000-0000-4000-8000-000000000004'
  ),
  'retry exhaustion is durable and releases the exact lease'
);

SELECT * FROM finish();
ROLLBACK;
