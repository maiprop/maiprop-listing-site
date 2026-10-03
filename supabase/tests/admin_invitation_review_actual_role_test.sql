\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database()
    OR current_database() IN ('postgres','template0','template1','maiprop_t12q_20260930_source')
    OR current_user IS DISTINCT FROM 'postgres' OR inet_server_addr() IS NOT NULL
    OR current_setting('session_replication_role') IS DISTINCT FROM 'origin'
 THEN RAISE EXCEPTION 'Matching postgres-owned disposable socket database with normal triggers required'; END IF;
END $$;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
SET LOCAL search_path=public,extensions;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(28);
SELECT is(current_setting('session_replication_role'),'origin','normal triggers active');
SELECT ok(has_function_privilege('service_role','public.admin_review_invitation_request(uuid,uuid,text,text,text)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.admin_review_invitation_request(uuid,uuid,text,text,text)','EXECUTE')
 AND NOT has_function_privilege('anon','public.admin_review_invitation_request(uuid,uuid,text,text,text)','EXECUTE'),
 'actual service-only review grant');

INSERT INTO auth.users(id,email) VALUES
 ('d3210001-0000-4000-8000-000000000001','kr@maiprop.co'),
 ('d3210001-0000-4000-8000-000000000002','d3-invite-private@example.test'),
 ('d3210001-0000-4000-8000-000000000003','d3-invite-institutional@example.test'),
 ('d3210001-0000-4000-8000-000000000004','d3-invite-developer@example.test'),
 ('d3210001-0000-4000-8000-000000000005','d3-invite-nonadmin@example.test'),
 ('d3210001-0000-4000-8000-000000000006','d3-invite-active@example.test');
SELECT set_config('maiprop.owner_auth_trigger_active','false',true);
SELECT is((SELECT role::text FROM public.profiles WHERE user_id='d3210001-0000-4000-8000-000000000001'),
 'admin','normal owner auth trigger grants authoritative admin');
INSERT INTO public.invitation_requests(id,email,full_name,user_id) VALUES
 ('d3210002-0000-4000-8000-000000000001','d3-invite-private@example.test','Private Applicant','d3210001-0000-4000-8000-000000000002'),
 ('d3210002-0000-4000-8000-000000000002','d3-invite-institutional@example.test','Institutional Applicant','d3210001-0000-4000-8000-000000000003'),
 ('d3210002-0000-4000-8000-000000000003','d3-invite-developer@example.test','Developer Applicant','d3210001-0000-4000-8000-000000000004'),
 ('d3210002-0000-4000-8000-000000000004','unlinked@example.test','Unlinked Applicant',NULL),
 ('d3210002-0000-4000-8000-000000000005','d3-invite-active@example.test','Active Applicant','d3210001-0000-4000-8000-000000000006'),
 ('d3210002-0000-4000-8000-000000000006','missing-profile@example.test','Missing Profile','d3210001-0000-4000-8000-000000000005');
-- A request may refer to a valid auth user whose profile was removed; restore it only by transaction rollback.
DELETE FROM public.profiles WHERE user_id='d3210001-0000-4000-8000-000000000005';

CREATE FUNCTION pg_temp.d3_state() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
  'auth',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(u)),'{}'::jsonb) FROM auth.users u WHERE id::text LIKE 'd3210001-%'),
  'profiles',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(p)),'{}'::jsonb) FROM public.profiles p WHERE user_id::text LIKE 'd3210001-%'),
  'profiles_public',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(p)),'{}'::jsonb) FROM public.profiles_public p WHERE user_id::text LIKE 'd3210001-%'),
  'requests',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(r)),'{}'::jsonb) FROM public.invitation_requests r WHERE id::text LIKE 'd3210002-%'),
  'subscriptions',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(s)),'{}'::jsonb) FROM public.investor_subscriptions s WHERE user_id::text LIKE 'd3210001-%'),
  'notifications',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(n)),'{}'::jsonb) FROM public.notifications n)
 )
$$;
CREATE FUNCTION pg_temp.d3_put(s jsonb,part text,k text,r jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_set(s,ARRAY[part,k],r,true)
$$;
CREATE FUNCTION pg_temp.d3_new_subscription(s jsonb,actor uuid,tier text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT pg_temp.d3_put(s,'subscriptions',n.id::text,
  jsonb_build_object('id',n.id,'user_id',actor,'tier',tier,'status','pending_payment',
   'started_at',now(),'expires_at',NULL,'created_at',now(),'updated_at',now(),
   'stripe_customer_id',NULL,'stripe_session_id',NULL,'activated_at',NULL,
   'runtime_mode','test','livemode',false))
 FROM public.investor_subscriptions n WHERE n.user_id=actor
$$;
CREATE TEMP TABLE d3_before(state jsonb);
CREATE TEMP TABLE d3_outcome(label text,sqlstate text,message text);
CREATE TEMP TABLE d3_return(label text,request_id uuid,status text,tier text,granted_role text,email text,full_name text,subscription_status text);
GRANT INSERT ON d3_outcome,d3_return TO service_role;
CREATE FUNCTION pg_temp.d3_attempt(label text,command text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_state text; v_message text;
BEGIN
 BEGIN EXECUTE command; INSERT INTO d3_outcome VALUES(label,NULL,NULL);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state=RETURNED_SQLSTATE,v_message=MESSAGE_TEXT;
  INSERT INTO d3_outcome VALUES(label,v_state,v_message);
 END;
END $$;

INSERT INTO d3_before SELECT pg_temp.d3_state();
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('reject',
 $$INSERT INTO d3_return SELECT 'reject',r.* FROM public.admin_review_invitation_request('d3210001-0000-4000-8000-000000000001','d3210002-0000-4000-8000-000000000004','rejected',NULL,'  insufficient details  ') r$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='reject'),NULL::text,'service reject succeeds');
SELECT is((SELECT to_jsonb(r)-'label' FROM d3_return r WHERE label='reject'),
 jsonb_build_object('request_id','d3210002-0000-4000-8000-000000000004',
  'status','rejected','tier',NULL,'granted_role',NULL,'email','unlinked@example.test',
  'full_name','Unlinked Applicant','subscription_status',NULL),
 'reject exact return, including no granted role or subscription');
SELECT ok(pg_temp.d3_state()=
 (SELECT pg_temp.d3_put(state,'requests','d3210002-0000-4000-8000-000000000004',
  state->'requests'->'d3210002-0000-4000-8000-000000000004'||
  jsonb_build_object('status','rejected','rejection_reason','insufficient details')) FROM d3_before),
 'reject exact full graph and trimmed reason, no subscription or SQL notice');

TRUNCATE d3_before;
INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('reject_blank',
 $$SELECT * FROM public.admin_review_invitation_request('d3210001-0000-4000-8000-000000000001','d3210002-0000-4000-8000-000000000006','rejected',NULL,'   ')$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='reject_blank'),NULL::text,
 'blank-reason rejection succeeds');
SELECT ok(pg_temp.d3_state()=
 (SELECT pg_temp.d3_put(state,'requests','d3210002-0000-4000-8000-000000000006',
  state->'requests'->'d3210002-0000-4000-8000-000000000006'||'{"status":"rejected"}'::jsonb)
  FROM d3_before),
 'blank rejection reason normalizes to NULL, preserving complete graph');

-- Each tier is an independent real service call; generated subscription IDs are identity only.
TRUNCATE d3_before;
INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('private',
 $$INSERT INTO d3_return SELECT 'private',r.* FROM public.admin_review_invitation_request('d3210001-0000-4000-8000-000000000001','d3210002-0000-4000-8000-000000000001','approved','private',NULL) r$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='private'),NULL::text,'private approval succeeds');
SELECT is((SELECT granted_role||':'||subscription_status FROM d3_return WHERE label='private'),
 'investor:pending_payment','private return is proposed role plus pending payment');
SELECT ok(pg_temp.d3_state()=
 (SELECT pg_temp.d3_new_subscription(pg_temp.d3_put(state,'requests',
  'd3210002-0000-4000-8000-000000000001',
  state->'requests'->'d3210002-0000-4000-8000-000000000001'||'{"status":"approved"}'::jsonb),
  'd3210001-0000-4000-8000-000000000002','private') FROM d3_before),
 'private approval exact graph keeps profile role inactive and no SQL notice');

TRUNCATE d3_before;
INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('institutional',
 $$INSERT INTO d3_return SELECT 'institutional',r.* FROM public.admin_review_invitation_request('d3210001-0000-4000-8000-000000000001','d3210002-0000-4000-8000-000000000002','approved','institutional',NULL) r$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='institutional'),NULL::text,'institutional approval succeeds');
SELECT is((SELECT granted_role||':'||subscription_status FROM d3_return WHERE label='institutional'),
 'institutional:pending_payment','institutional return does not activate paid role');
SELECT ok(pg_temp.d3_state()=
 (SELECT pg_temp.d3_new_subscription(pg_temp.d3_put(state,'requests',
  'd3210002-0000-4000-8000-000000000002',
  state->'requests'->'d3210002-0000-4000-8000-000000000002'||'{"status":"approved"}'::jsonb),
  'd3210001-0000-4000-8000-000000000003','institutional') FROM d3_before),
 'institutional approval exact graph preserves unrelated request and profile rows');

TRUNCATE d3_before;
INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('developer',
 $$INSERT INTO d3_return SELECT 'developer',r.* FROM public.admin_review_invitation_request('d3210001-0000-4000-8000-000000000001','d3210002-0000-4000-8000-000000000003','approved','developer',NULL) r$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='developer'),NULL::text,'developer approval succeeds');
SELECT is((SELECT granted_role||':'||subscription_status FROM d3_return WHERE label='developer'),
 'developer:pending_payment','developer return does not activate paid role');
SELECT ok(pg_temp.d3_state()=
 (SELECT pg_temp.d3_new_subscription(pg_temp.d3_put(state,'requests',
  'd3210002-0000-4000-8000-000000000003',
  state->'requests'->'d3210002-0000-4000-8000-000000000003'||'{"status":"approved"}'::jsonb),
  'd3210001-0000-4000-8000-000000000004','developer') FROM d3_before),
 'developer approval exact graph preserves unrelated subscriptions and notices');

-- Reachable input/target denials must leave the complete graph untouched.
TRUNCATE d3_before;
INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('unlinked',
 $$SELECT * FROM public.admin_review_invitation_request('d3210001-0000-4000-8000-000000000001','d3210002-0000-4000-8000-000000000004','approved','private',NULL)$$);
SELECT pg_temp.d3_attempt('invalid_tier',
 $$SELECT * FROM public.admin_review_invitation_request('d3210001-0000-4000-8000-000000000001','d3210002-0000-4000-8000-000000000005','approved','unknown',NULL)$$);
SELECT pg_temp.d3_attempt('missing_request',
 $$SELECT * FROM public.admin_review_invitation_request('d3210001-0000-4000-8000-000000000001','d3210002-0000-4000-8000-000000000099','approved','private',NULL)$$);
SELECT pg_temp.d3_attempt('invalid_decision',
 $$SELECT * FROM public.admin_review_invitation_request('d3210001-0000-4000-8000-000000000001','d3210002-0000-4000-8000-000000000005','defer','private',NULL)$$);
SELECT pg_temp.d3_attempt('missing_profile',
 $$SELECT * FROM public.admin_review_invitation_request('d3210001-0000-4000-8000-000000000001','d3210002-0000-4000-8000-000000000006','approved','private',NULL)$$);
SELECT pg_temp.d3_attempt('missing_admin',
 $$SELECT * FROM public.admin_review_invitation_request('d3210001-0000-4000-8000-000000000099','d3210002-0000-4000-8000-000000000005','rejected',NULL,'x')$$);
SELECT pg_temp.d3_attempt('null_admin',
 $$SELECT * FROM public.admin_review_invitation_request(NULL::uuid,'d3210002-0000-4000-8000-000000000005','rejected',NULL,'x')$$);
RESET ROLE;
SELECT is((SELECT string_agg(label||'='||sqlstate||':'||message,',' ORDER BY label) FROM d3_outcome WHERE label IN
 ('unlinked','invalid_tier','missing_request','invalid_decision','missing_profile')),
 'invalid_decision=P0001:invalid_decision,invalid_tier=P0001:invalid_tier,missing_profile=P0001:profile_not_found,missing_request=P0001:invitation_request_not_found,unlinked=P0001:linked_user_required',
 'all five first denials match source SQLSTATE and message');
SELECT ok(pg_temp.d3_state()=(SELECT state FROM d3_before),
 'five denied invitation actions preserve complete request/subscription/profile/notice graph');
SELECT is((SELECT count(*)::integer FROM d3_outcome WHERE label IN ('missing_admin','null_admin')
 AND sqlstate='P0001' AND message='forbidden'),2,
 'missing and NULL administrator IDs deny before request lookup');
SELECT ok(pg_temp.d3_state()=(SELECT state FROM d3_before),
 'missing/NULL administrator denials preserve complete graph');

-- A normal pre-onboarding profile has NULL role. Its authority behavior is a separate RED sentinel.
TRUNCATE d3_before;
INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('null_role_admin',
 $$SELECT * FROM public.admin_review_invitation_request('d3210001-0000-4000-8000-000000000002','d3210002-0000-4000-8000-000000000005','rejected',NULL,'x')$$);
RESET ROLE;
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='null_role_admin'),
 'P0001:forbidden','NULL-role caller must not review invitation');
SELECT ok(pg_temp.d3_state()=(SELECT state FROM d3_before),
 'NULL-role denial preserves complete graph');

-- Characterize reapproval of a previously paid/active request without a provider call.
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('active_fixture_review',
 $$SELECT * FROM public.admin_review_invitation_request('d3210001-0000-4000-8000-000000000001','d3210002-0000-4000-8000-000000000005','approved','private',NULL)$$);
UPDATE public.investor_subscriptions
 SET status='active',expires_at=now()+interval '30 days',
     runtime_mode=public.current_billing_runtime_mode(),
     livemode=(public.current_billing_runtime_mode()='live')
 WHERE user_id='d3210001-0000-4000-8000-000000000006';
RESET ROLE;
SELECT is((SELECT role::text||':'||status FROM public.profiles p
 JOIN public.investor_subscriptions s USING(user_id)
 WHERE p.user_id='d3210001-0000-4000-8000-000000000006'),
 'investor:active','normal active subscription trigger made existing profile investor');
TRUNCATE d3_before;
INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('reapprove',
 $$INSERT INTO d3_return SELECT 'reapprove',r.* FROM public.admin_review_invitation_request('d3210001-0000-4000-8000-000000000001','d3210002-0000-4000-8000-000000000005','approved','institutional',NULL) r$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='reapprove'),NULL::text,
 'reapproval currently succeeds');
SELECT ok(pg_temp.d3_state()=
 (SELECT pg_temp.d3_put(state,'subscriptions',s.id::text,
  state->'subscriptions'->s.id::text||jsonb_build_object(
   'tier','institutional','status','pending_payment','started_at',now(),
   'expires_at',NULL,'updated_at',now()))
  FROM d3_before,public.investor_subscriptions s
  WHERE s.user_id='d3210001-0000-4000-8000-000000000006'),
 'reapproval resets only existing subscription to pending payment, preserves old role and notices');
SELECT is(private.has_investor_subscription_for_user('d3210001-0000-4000-8000-000000000006'),
 false,'reapproved pending subscription does not retain paid entitlement');

SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','',true);
SELECT is(current_setting('session_replication_role'),'origin','normal triggers remain active');
SELECT * FROM finish();
ROLLBACK;
