-- D2 residual role authority under closed strict/reconciliation gates.
BEGIN;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pgtap') THEN CREATE EXTENSION pgtap; END IF; END $$;
SELECT plan(70);
SELECT is(current_setting('session_replication_role'),'origin','normal triggers remain enabled');
SELECT ok((SELECT NOT strict_enrollment_enabled AND legacy_begin_enabled AND NOT reconciliation_enabled
 FROM private.role_switch_rollout_control WHERE singleton),'rollout gates start false/true/false');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true);
INSERT INTO auth.users(id,email) VALUES
 ('d2150001-0000-4000-8000-000000000001','d2-role-residual-a@example.test'),
 ('d2150001-0000-4000-8000-000000000002','d2-role-residual-b@example.test');
SET LOCAL ROLE service_role;
SELECT is(current_user,'service_role','service RPC block runs as service_role');
SELECT is(auth.uid(),NULL::uuid,'service RPC block has no JWT subject');
SELECT public.complete_onboarding_role_for_user('d2150001-0000-4000-8000-000000000001','buyer','buyer');
SELECT public.complete_onboarding_role_for_user('d2150001-0000-4000-8000-000000000002','buyer','buyer');
CREATE TEMP VIEW d2_role_remaining_state AS SELECT jsonb_build_object(
 'profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.user_id) FROM public.profiles p WHERE p.user_id::text LIKE 'd2150001-%'),
 'public_profiles',(SELECT jsonb_agg(to_jsonb(pp) ORDER BY pp.user_id) FROM public.profiles_public pp WHERE pp.user_id::text LIKE 'd2150001-%'),
 'history',(SELECT jsonb_agg(to_jsonb(h) ORDER BY h.id) FROM public.role_switch_history h WHERE h.user_id::text LIKE 'd2150001-%'),
 'professionals',(SELECT jsonb_agg(to_jsonb(pr) ORDER BY pr.user_id) FROM public.professionals pr WHERE pr.user_id::text LIKE 'd2150001-%'),
 'notifications',(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.id) FROM public.notifications n WHERE n.user_id::text LIKE 'd2150001-%'),
 'conversations',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.conversations c WHERE c.participant_a::text LIKE 'd2150001-%' OR c.participant_b::text LIKE 'd2150001-%')
) AS state;
CREATE TEMP TABLE d2_role_remaining_before AS SELECT state FROM d2_role_remaining_state;

SELECT throws_ok($q$SELECT public.finalize_role_switch_audit_for_user(NULL,'d2150001-0000-4000-8000-000000000001',false,'not_required',NULL,0,0)$q$,
 '22023','audit_identity_required','finalizer requires audit identity');
SELECT is((SELECT state FROM d2_role_remaining_state),(SELECT state FROM d2_role_remaining_before),'finalizer identity denial preserves full state');
SELECT throws_ok($q$SELECT public.finalize_role_switch_audit_for_user('d2150002-0000-4000-8000-000000000001','d2150001-0000-4000-8000-000000000001',false,'bogus',NULL,0,0)$q$,
 '22023','invalid_billing_outcome','finalizer rejects invalid outcome before row access');
SELECT is((SELECT state FROM d2_role_remaining_state),(SELECT state FROM d2_role_remaining_before),'finalizer outcome denial preserves full state');
SELECT throws_ok($q$SELECT public.finalize_role_switch_audit_for_user('d2150002-0000-4000-8000-000000000001','d2150001-0000-4000-8000-000000000001',false,'not_required',NULL,0,1)$q$,
 '22023','invalid_billing_counts','finalizer rejects inconsistent counts');
SELECT is((SELECT state FROM d2_role_remaining_state),(SELECT state FROM d2_role_remaining_before),'finalizer count denial preserves full state');
SELECT throws_ok($q$SELECT public.finalize_role_switch_audit_for_user('d2150002-0000-4000-8000-000000000001','d2150001-0000-4000-8000-000000000001',false,'not_required',NULL,0,0)$q$,
 'P0002','role_switch_audit_not_reconcilable','finalizer rejects absent audit');
SELECT is((SELECT state FROM d2_role_remaining_state),(SELECT state FROM d2_role_remaining_before),'finalizer missing-audit denial preserves full state');

SELECT throws_ok($q$SELECT public.begin_role_switch_for_user(NULL,NULL)$q$,'P0001','role_switch_audit_required','strict begin requires both identities');
SELECT is((SELECT state FROM d2_role_remaining_state),(SELECT state FROM d2_role_remaining_before),'strict begin identity denial preserves full state');
SELECT throws_ok($q$SELECT public.begin_role_switch_for_user('d2150001-0000-4000-8000-000000000099','d2150002-0000-4000-8000-000000000001')$q$,
 'P0001','profile_not_found','strict begin rejects missing profile');
SELECT is((SELECT state FROM d2_role_remaining_state),(SELECT state FROM d2_role_remaining_before),'strict begin missing-profile denial preserves full state');
SELECT throws_ok($q$SELECT public.begin_role_switch_for_user('d2150001-0000-4000-8000-000000000001','d2150002-0000-4000-8000-000000000001')$q$,
 'P0001','role_switch_enrollment_required','strict begin rejects unadmitted actor');
SELECT is((SELECT state FROM d2_role_remaining_state),(SELECT state FROM d2_role_remaining_before),'strict begin enrollment denial preserves full state');

SELECT is((SELECT count(*)::integer FROM public.claim_role_switch_reconciliation_batch(NULL,0,0)),0,'disabled claim returns before worker validation');
SELECT is((SELECT state FROM d2_role_remaining_state),(SELECT state FROM d2_role_remaining_before),'disabled claim preserves full state');
SELECT throws_ok($q$SELECT public.release_role_switch_reconciliation_claims(NULL,ARRAY['d2150002-0000-4000-8000-000000000001']::uuid[])$q$,
 '22023','reconciliation_worker_required','release requires worker identity');
SELECT is((SELECT state FROM d2_role_remaining_state),(SELECT state FROM d2_role_remaining_before),'release identity denial preserves full state');
SELECT throws_ok($q$SELECT public.release_role_switch_reconciliation_claims('d2150002-0000-4000-8000-000000000002',ARRAY[]::uuid[])$q$,
 '22023','invalid_reconciliation_release_batch','release rejects empty batch');
SELECT is((SELECT state FROM d2_role_remaining_state),(SELECT state FROM d2_role_remaining_before),'release batch denial preserves full state');
SELECT is(public.release_role_switch_reconciliation_claims('d2150002-0000-4000-8000-000000000002',ARRAY['d2150002-0000-4000-8000-000000000001']::uuid[]),0,
 'release finds no owned lease under closed gate');
SELECT is((SELECT state FROM d2_role_remaining_state),(SELECT state FROM d2_role_remaining_before),'unmatched release preserves full state');

SELECT throws_ok($q$SELECT public.complete_role_switch_reconciliation_attempt(NULL,'d2150001-0000-4000-8000-000000000001','d2150002-0000-4000-8000-000000000002','unknown',NULL,false,0,0,6)$q$,
 '22023','reconciliation_binding_required','settlement requires complete binding');
SELECT is((SELECT state FROM d2_role_remaining_state),(SELECT state FROM d2_role_remaining_before),'settlement binding denial preserves full state');
SELECT throws_ok($q$SELECT public.complete_role_switch_reconciliation_attempt('d2150002-0000-4000-8000-000000000001','d2150001-0000-4000-8000-000000000001','d2150002-0000-4000-8000-000000000002','failed',NULL,false,0,0,6)$q$,
 '22023','invalid_billing_outcome','settlement rejects disallowed outcome');
SELECT is((SELECT state FROM d2_role_remaining_state),(SELECT state FROM d2_role_remaining_before),'settlement outcome denial preserves full state');
SELECT throws_ok($q$SELECT public.complete_role_switch_reconciliation_attempt('d2150002-0000-4000-8000-000000000001','d2150001-0000-4000-8000-000000000001','d2150002-0000-4000-8000-000000000002','unknown',NULL,false,0,0,0)$q$,
 '22023','invalid_reconciliation_max_attempts','settlement rejects invalid retry limit');
SELECT is((SELECT state FROM d2_role_remaining_state),(SELECT state FROM d2_role_remaining_before),'settlement retry-limit denial preserves full state');
SELECT throws_ok($q$SELECT public.complete_role_switch_reconciliation_attempt('d2150002-0000-4000-8000-000000000001','d2150001-0000-4000-8000-000000000001','d2150002-0000-4000-8000-000000000002','unknown',NULL,false,0,1,6)$q$,
 '22023','invalid_billing_counts','settlement rejects inconsistent counts');
SELECT is((SELECT state FROM d2_role_remaining_state),(SELECT state FROM d2_role_remaining_before),'settlement count denial preserves full state');
SELECT throws_ok($q$SELECT public.complete_role_switch_reconciliation_attempt('d2150002-0000-4000-8000-000000000001','d2150001-0000-4000-8000-000000000001','d2150002-0000-4000-8000-000000000002','unknown',NULL,false,0,0,6)$q$,
 'P0002','role_switch_reconciliation_lease_lost','settlement rejects missing lease');
SELECT is((SELECT state FROM d2_role_remaining_state),(SELECT state FROM d2_role_remaining_before),'settlement lease denial preserves full state');

SELECT throws_ok($q$SELECT public.begin_role_switch_for_user(NULL::uuid)$q$,'P0001','profile_not_found','legacy explicit-user begin rejects null user');
SELECT is((SELECT state FROM d2_role_remaining_state),(SELECT state FROM d2_role_remaining_before),'legacy null-user denial preserves full state');
SELECT throws_ok($q$SELECT public.begin_role_switch_for_user('d2150001-0000-4000-8000-000000000099')$q$,'P0001','profile_not_found','legacy explicit-user begin rejects missing profile');
SELECT is((SELECT state FROM d2_role_remaining_state),(SELECT state FROM d2_role_remaining_before),'legacy missing-profile denial preserves full state');
SELECT throws_ok($q$SELECT public.record_role_switch_audit_for_user(NULL::uuid,'buyer','seller','same-tier',false,false)$q$,
 '28000','user_id_required','legacy explicit-user recorder requires user identity');
SELECT is((SELECT state FROM d2_role_remaining_state),(SELECT state FROM d2_role_remaining_before),'legacy recorder identity denial preserves full state');

SELECT throws_ok($q$SELECT public.begin_role_switch()$q$,'P0001','not_authenticated','caller-context begin requires auth.uid');
SELECT is((SELECT state FROM d2_role_remaining_state),(SELECT state FROM d2_role_remaining_before),'caller-context begin no-sub denial preserves full state');
SELECT throws_ok($q$SELECT public.record_role_switch_audit('buyer','seller','same-tier',false,false)$q$,
 '28000','unauthenticated','caller-context recorder requires auth.uid');
SELECT is((SELECT state FROM d2_role_remaining_state),(SELECT state FROM d2_role_remaining_before),'caller-context recorder no-sub denial preserves full state');
SELECT throws_ok($q$SELECT public.complete_onboarding_role('buyer','buyer',NULL,NULL,NULL)$q$,
 'P0001','not_authenticated','caller-context completion requires auth.uid');
SELECT is((SELECT state FROM d2_role_remaining_state),(SELECT state FROM d2_role_remaining_before),'caller-context completion no-sub denial preserves full state');

SELECT ok(has_function_privilege('service_role','public.begin_role_switch()','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.begin_role_switch()','EXECUTE'),
 'old caller-context begin is currently service-only');
SELECT ok(has_function_privilege('service_role','public.record_role_switch_audit(text,text,text,boolean,boolean)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.record_role_switch_audit(text,text,text,boolean,boolean)','EXECUTE'),
 'old caller-context recorder is currently service-only');
SELECT ok(has_function_privilege('service_role','public.complete_onboarding_role(public.user_role,text,text,text,text)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.complete_onboarding_role(public.user_role,text,text,text,text)','EXECUTE'),
 'old caller-context completion is currently service-only');

INSERT INTO public.conversations(id,participant_a,participant_b)
VALUES('d2150003-0000-4000-8000-000000000001','d2150001-0000-4000-8000-000000000001','d2150001-0000-4000-8000-000000000002');
SELECT is((SELECT count(*)::integer FROM public.conversations WHERE id='d2150003-0000-4000-8000-000000000001'),1,
 'ordinary open conversation fixture exists');
SELECT lives_ok($q$SELECT public.record_role_switch_audit_for_user('d2150001-0000-4000-8000-000000000001','buyer','seller','same-tier',false,false)$q$,
 'legacy explicit-user recorder accepts actual service/no-sub');
SELECT ok((SELECT count(*)=1 FROM public.role_switch_history WHERE user_id='d2150001-0000-4000-8000-000000000001'
 AND from_type='buyer' AND to_type='seller' AND switch_kind='same-tier' AND billing_outcome='legacy'),
 'legacy recorder creates exactly one legacy audit without strict binding');
SELECT lives_ok($q$SELECT public.begin_role_switch_for_user('d2150001-0000-4000-8000-000000000001')$q$,
 'legacy explicit-user begin reaches ordinary cleanup under service/no-sub');
SELECT ok((SELECT role='buyer' AND participant_type IS NULL AND role_switch_in_progress_at IS NOT NULL
 AND role_switch_audit_id IS NULL AND NOT role_switch_audit_required
 FROM public.profiles WHERE user_id='d2150001-0000-4000-8000-000000000001'),
 'legacy begin preserves role, clears participant type, and records unbound sentinel');
SELECT ok((SELECT closed_at IS NOT NULL AND closed_reason='role_switch'
 AND closed_by='d2150001-0000-4000-8000-000000000001'
 FROM public.conversations WHERE id='d2150003-0000-4000-8000-000000000001'),
 'normal cleanup closes the actor conversation with exact reason and actor');
SELECT is((SELECT count(*)::integer FROM public.conversations WHERE id='d2150003-0000-4000-8000-000000000001'),1,
 'cleanup preserves the underlying conversation');
SELECT ok((SELECT count(*)=1 FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000002'
 AND title='Conversation closed' AND type='role_switch' AND link='/messages'),
 'conversation counterparty receives one exact closure notice');
SELECT ok((SELECT count(*)=1 FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000001'
 AND title='Account type switch started' AND type='role_switch' AND link='/onboarding'),
 'switching actor receives one exact start notice');
SELECT is((SELECT count(*)::integer FROM public.role_switch_history WHERE user_id='d2150001-0000-4000-8000-000000000001'),1,
 'legacy begin does not create another audit');
SELECT ok((SELECT role='buyer' AND participant_type='buyer' AND role_switch_in_progress_at IS NULL
 FROM public.profiles WHERE user_id='d2150001-0000-4000-8000-000000000002'),
 'counterparty profile remains unchanged by cleanup');
RESET ROLE;
SELECT is(current_user,'postgres','test returns to owner after actual service calls');
CREATE TEMP TABLE d2_role_remaining_after_legacy AS SELECT state FROM d2_role_remaining_state;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"d2150001-0000-4000-8000-000000000002"}',true);
SELECT set_config('request.jwt.claim.sub','d2150001-0000-4000-8000-000000000002',true),set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT is(current_user,'authenticated','old caller-context browser denial uses actual authenticated role');
SELECT is(auth.uid(),'d2150001-0000-4000-8000-000000000002'::uuid,'browser denial has a real caller subject');
SELECT throws_ok($q$SELECT public.begin_role_switch()$q$,'42501','permission denied for function begin_role_switch',
 'authenticated caller cannot execute old begin');
SELECT throws_ok($q$SELECT public.record_role_switch_audit('buyer','seller','same-tier',false,false)$q$,
 '42501','permission denied for function record_role_switch_audit','authenticated caller cannot execute old recorder');
SELECT throws_ok($q$SELECT public.complete_onboarding_role('buyer','buyer',NULL,NULL,NULL)$q$,
 '42501','permission denied for function complete_onboarding_role','authenticated caller cannot execute old completion');
RESET ROLE;
SELECT is((SELECT state FROM d2_role_remaining_state),(SELECT state FROM d2_role_remaining_after_legacy),
 'all browser denials preserve complete post-legacy state');
SELECT ok((SELECT NOT strict_enrollment_enabled AND legacy_begin_enabled AND NOT reconciliation_enabled
 FROM private.role_switch_rollout_control WHERE singleton),'rollout gates end false/true/false');
SELECT * FROM finish();
ROLLBACK;
