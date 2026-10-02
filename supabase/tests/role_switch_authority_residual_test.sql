-- D2 role authority: closed rollout, normal triggers, service/no-sub preflight and recorder.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(34);
SELECT is(current_setting('session_replication_role'),'origin','role authority uses normal triggers');
SELECT ok((SELECT NOT strict_enrollment_enabled AND legacy_begin_enabled AND NOT reconciliation_enabled
 FROM private.role_switch_rollout_control WHERE singleton),'all rollout controls retain their installed closed state');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true);
INSERT INTO auth.users(id,email) VALUES
 ('d2140001-0000-4000-8000-000000000001','d2-role-allowed@example.test'),
 ('d2140001-0000-4000-8000-000000000002','d2-role-blocked@example.test'),
 ('d2140001-0000-4000-8000-000000000003','d2-role-admin@example.test');
SET LOCAL ROLE service_role;
SELECT public.complete_onboarding_role_for_user('d2140001-0000-4000-8000-000000000001','buyer','buyer');
RESET ROLE;
SELECT set_config('maiprop.onboarding_rpc_active','false',true);
DELETE FROM public.profiles WHERE user_id='d2140001-0000-4000-8000-000000000003';
INSERT INTO public.profiles(user_id,role) VALUES('d2140001-0000-4000-8000-000000000003','admin');
INSERT INTO public.investor_subscriptions(user_id,tier,status,expires_at,runtime_mode,livemode)
VALUES('d2140001-0000-4000-8000-000000000002','private','active',now()+interval '30 days',
 public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live');
SELECT is((SELECT role::text FROM public.profiles WHERE user_id='d2140001-0000-4000-8000-000000000002'),
 'investor','paid subscription promotes blocker actor through ordinary trigger');
INSERT INTO public.firesale_requests(id,user_id,address,city,sqm,contact_email,status,published_to_investors)
VALUES('d2140002-0000-4000-8000-000000000001','d2140001-0000-4000-8000-000000000001',
 '1 D2 Test Street','Athens',80,'d2-role-allowed@example.test','approved',true);
SELECT set_config('request.jwt.claims','{"role":"service_role","sub":"d2140001-0000-4000-8000-000000000002"}',true);
SELECT set_config('request.jwt.claim.sub','d2140001-0000-4000-8000-000000000002',true);
SET LOCAL ROLE service_role;
SELECT lives_ok($q$SELECT public.submit_firesale_interest('d2140002-0000-4000-8000-000000000001')$q$,
 'investor expresses interest through the admitted service RPC');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role","sub":"d2140001-0000-4000-8000-000000000003"}',true);
SELECT set_config('request.jwt.claim.sub','d2140001-0000-4000-8000-000000000003',true);
UPDATE public.firesale_interest SET status='engaged'
WHERE deal_id='d2140002-0000-4000-8000-000000000001'
 AND investor_id='d2140001-0000-4000-8000-000000000002';
SELECT is((SELECT status FROM public.firesale_interest
 WHERE deal_id='d2140002-0000-4000-8000-000000000001'), 'engaged',
 'admin-managed engaged interest is a genuine preflight blocker');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT set_config('request.jwt.claim.sub','',true);

CREATE TEMP VIEW d2_role_state AS SELECT jsonb_build_object(
 'profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.user_id) FROM public.profiles p WHERE p.user_id::text LIKE 'd2140001-%'),
 'history',(SELECT jsonb_agg(to_jsonb(h) ORDER BY h.id) FROM public.role_switch_history h WHERE h.user_id::text LIKE 'd2140001-%'),
 'professionals',(SELECT jsonb_agg(to_jsonb(pr) ORDER BY pr.user_id) FROM public.professionals pr WHERE pr.user_id::text LIKE 'd2140001-%'),
 'interest',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM public.firesale_interest i WHERE i.investor_id='d2140001-0000-4000-8000-000000000002'),
 'requests',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.firesale_requests r WHERE r.id='d2140002-0000-4000-8000-000000000001')) AS state;
CREATE TEMP TABLE d2_role_before AS SELECT state FROM d2_role_state;
SET LOCAL ROLE service_role;
SELECT is(current_user,'service_role','preflight uses actual service role');
SELECT is(auth.uid(),NULL::uuid,'preflight service role has no subject');
SELECT is(auth.role(),'service_role','preflight service claim retains service role');
SELECT lives_ok($q$SELECT public.validate_role_switch_for_user('d2140001-0000-4000-8000-000000000001')$q$,
 'ordinary unblocked buyer passes preflight');
RESET ROLE;
SELECT is((SELECT state FROM d2_role_state),(SELECT state FROM d2_role_before),
 'allowed preflight leaves profile, history, archive, offer and request rows unchanged');
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.validate_role_switch_for_user(NULL)$q$,'P0001','not_authenticated','preflight rejects null actor');
RESET ROLE;
SELECT is((SELECT state FROM d2_role_state),(SELECT state FROM d2_role_before),'null preflight leaves full state unchanged');
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.validate_role_switch_for_user('d2140001-0000-4000-8000-000000000099')$q$,'P0001','profile_not_found','preflight rejects missing profile');
RESET ROLE;
SELECT is((SELECT state FROM d2_role_state),(SELECT state FROM d2_role_before),'missing-profile preflight leaves full state unchanged');
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.validate_role_switch_for_user('d2140001-0000-4000-8000-000000000002')$q$,
 'P0001','active_firesale_commitment_blocks_role_switch','active firesale commitment blocks role switch');
RESET ROLE;
SELECT is((SELECT state FROM d2_role_state),(SELECT state FROM d2_role_before),'business-blocked preflight leaves full state unchanged');

SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.record_role_switch_audit_for_user(NULL,'d2140001-0000-4000-8000-000000000001','buyer','seller','same-tier')$q$,
 '22023','audit_identity_required','strict recorder rejects missing operation identity before gate');
RESET ROLE;
SELECT is((SELECT state FROM d2_role_state),(SELECT state FROM d2_role_before),'identity denial leaves full state unchanged');
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.record_role_switch_audit_for_user('d2140003-0000-4000-8000-000000000001','d2140001-0000-4000-8000-000000000001',NULL,'seller','same-tier')$q$,
 '22023','invalid_role_switch_source','strict recorder rejects invalid source before gate');
RESET ROLE;
SELECT is((SELECT state FROM d2_role_state),(SELECT state FROM d2_role_before),'source denial leaves full state unchanged');
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.record_role_switch_audit_for_user('d2140003-0000-4000-8000-000000000001','d2140001-0000-4000-8000-000000000001','buyer',NULL,'same-tier')$q$,
 '22023','invalid_role_switch_destination','strict recorder rejects invalid destination before gate');
RESET ROLE;
SELECT is((SELECT state FROM d2_role_state),(SELECT state FROM d2_role_before),'destination denial leaves full state unchanged');
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.record_role_switch_audit_for_user('d2140003-0000-4000-8000-000000000001','d2140001-0000-4000-8000-000000000001','buyer','seller',NULL)$q$,
 '22023','invalid_role_switch_kind','strict recorder rejects invalid kind before gate');
RESET ROLE;
SELECT is((SELECT state FROM d2_role_state),(SELECT state FROM d2_role_before),'kind denial leaves full state unchanged');
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.record_role_switch_audit_for_user('d2140003-0000-4000-8000-000000000001','d2140001-0000-4000-8000-000000000099','buyer','seller','same-tier')$q$,
 'P0001','profile_not_found','strict recorder rejects missing profile before gate');
RESET ROLE;
SELECT is((SELECT state FROM d2_role_state),(SELECT state FROM d2_role_before),'missing-profile recorder denial leaves full state unchanged');
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.record_role_switch_audit_for_user('d2140003-0000-4000-8000-000000000001','d2140001-0000-4000-8000-000000000001','buyer','seller','same-tier')$q$,
 'P0001','role_switch_enrollment_closed','new strict enrollment stays closed');
RESET ROLE;
SELECT is((SELECT state FROM d2_role_state),(SELECT state FROM d2_role_before),'closed enrollment leaves full state unchanged');

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{"role":"anon"}',true),set_config('request.jwt.claim.role','anon',true);
SELECT throws_ok($q$SELECT public.validate_role_switch_for_user('d2140001-0000-4000-8000-000000000001')$q$,NULL::text,NULL::text,'anon cannot call preflight');
SELECT throws_ok($q$SELECT public.record_role_switch_audit_for_user('d2140003-0000-4000-8000-000000000001','d2140001-0000-4000-8000-000000000001','buyer','seller','same-tier')$q$,NULL::text,NULL::text,'anon cannot call strict recorder');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"d2140001-0000-4000-8000-000000000001"}',true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claim.sub','d2140001-0000-4000-8000-000000000001',true);
SELECT throws_ok($q$SELECT public.validate_role_switch_for_user('d2140001-0000-4000-8000-000000000001')$q$,NULL::text,NULL::text,'authenticated cannot call preflight');
SELECT throws_ok($q$SELECT public.record_role_switch_audit_for_user('d2140003-0000-4000-8000-000000000001','d2140001-0000-4000-8000-000000000001','buyer','seller','same-tier')$q$,NULL::text,NULL::text,'authenticated cannot call strict recorder');
RESET ROLE;
SELECT is((SELECT state FROM d2_role_state),(SELECT state FROM d2_role_before),'browser denials leave full role and business state unchanged');
SELECT ok((SELECT NOT strict_enrollment_enabled AND legacy_begin_enabled AND NOT reconciliation_enabled
 FROM private.role_switch_rollout_control WHERE singleton),'role tests leave rollout controls false/true/false');
SELECT * FROM finish();
ROLLBACK;
