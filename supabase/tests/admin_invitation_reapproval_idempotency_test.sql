\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database()
    OR current_database() IN ('postgres','template0','template1','maiprop_t12q_20260930_source')
    OR current_user IS DISTINCT FROM 'postgres' OR inet_server_addr() IS NOT NULL
    OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) IS DISTINCT FROM 'postgres'
    OR current_setting('session_replication_role') IS DISTINCT FROM 'origin'
 THEN RAISE EXCEPTION 'Matching postgres-owned disposable socket database with normal triggers required'; END IF;
END $$;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
SET LOCAL search_path=public,extensions;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(28);

INSERT INTO auth.users(id,email) VALUES
 ('d3230001-0000-4000-8000-000000000001','kr@maiprop.co'),
 ('d3230001-0000-4000-8000-000000000002','d323-paid@example.test'),
 ('d3230001-0000-4000-8000-000000000003','d323-pending@example.test');
SELECT set_config('maiprop.owner_auth_trigger_active','false',true);
SELECT is((SELECT role::text FROM public.profiles WHERE user_id='d3230001-0000-4000-8000-000000000001'),
 'admin','normal auth trigger created authoritative admin');
SELECT ok(has_function_privilege('service_role','public.admin_review_invitation_request(uuid,uuid,text,text,text)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.admin_review_invitation_request(uuid,uuid,text,text,text)','EXECUTE'),
 'review RPC remains service only');
INSERT INTO public.invitation_requests(id,email,full_name,user_id) VALUES
 ('d3230002-0000-4000-8000-000000000002','d323-paid@example.test','Paid Applicant','d3230001-0000-4000-8000-000000000002'),
 ('d3230002-0000-4000-8000-000000000003','d323-pending@example.test','Pending Applicant','d3230001-0000-4000-8000-000000000003');

CREATE FUNCTION pg_temp.d323_state() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
  'auth',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(u)||jsonb_build_object('_ctid',u.ctid::text)),'{}'::jsonb) FROM auth.users u WHERE id::text LIKE 'd3230001-%'),
  'profiles',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(p)||jsonb_build_object('_ctid',p.ctid::text)),'{}'::jsonb) FROM public.profiles p WHERE user_id::text LIKE 'd3230001-%'),
  'profiles_public',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(p)),'{}'::jsonb) FROM public.profiles_public p WHERE user_id::text LIKE 'd3230001-%'),
  'requests',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(r)||jsonb_build_object('_ctid',r.ctid::text)),'{}'::jsonb) FROM public.invitation_requests r WHERE id::text LIKE 'd3230002-%'),
  'subscriptions',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(s)||jsonb_build_object('_ctid',s.ctid::text)),'{}'::jsonb) FROM public.investor_subscriptions s WHERE user_id::text LIKE 'd3230001-%'),
  'notifications',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(n)||jsonb_build_object('_ctid',n.ctid::text)),'{}'::jsonb) FROM public.notifications n WHERE user_id::text LIKE 'd3230001-%')
 )
$$;
CREATE TEMP TABLE d323_before(label text PRIMARY KEY,state jsonb,entitled boolean);
CREATE TEMP TABLE d323_result(label text,request_id uuid,status text,tier text,granted_role text,email text,full_name text,subscription_status text);
CREATE TEMP TABLE d323_outcome(label text,sqlstate text,message text);
GRANT INSERT ON d323_result,d323_outcome TO service_role;
CREATE FUNCTION pg_temp.d323_attempt(label text,command text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_state text; v_message text;
BEGIN
 BEGIN EXECUTE command; INSERT INTO d323_outcome VALUES(label,NULL,NULL);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state=RETURNED_SQLSTATE,v_message=MESSAGE_TEXT;
  INSERT INTO d323_outcome VALUES(label,v_state,v_message);
 END;
END $$;

SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.d323_attempt('initial_paid',
 $$INSERT INTO d323_result SELECT 'initial_paid',r.* FROM public.admin_review_invitation_request('d3230001-0000-4000-8000-000000000001','d3230002-0000-4000-8000-000000000002','approved','private',NULL) r$$);
SELECT pg_temp.d323_attempt('initial_pending',
 $$INSERT INTO d323_result SELECT 'initial_pending',r.* FROM public.admin_review_invitation_request('d3230001-0000-4000-8000-000000000001','d3230002-0000-4000-8000-000000000003','approved','private',NULL) r$$);
UPDATE public.investor_subscriptions
 SET status='active',expires_at=now()+interval '30 days',activated_at=now(),
     stripe_customer_id='cus_d323_paid',stripe_session_id='cs_d323_paid',
     runtime_mode=public.current_billing_runtime_mode(),
     livemode=(public.current_billing_runtime_mode()='live')
 WHERE user_id='d3230001-0000-4000-8000-000000000002';
UPDATE public.investor_subscriptions
 SET stripe_customer_id='cus_d323_pending',stripe_session_id='cs_d323_pending',
     runtime_mode=public.current_billing_runtime_mode(),
     livemode=(public.current_billing_runtime_mode()='live')
 WHERE user_id='d3230001-0000-4000-8000-000000000003';
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM d323_outcome WHERE label LIKE 'initial_%' AND sqlstate IS NULL),2,
 'both first approvals use real service-role RPC');
SELECT is((SELECT string_agg(subscription_status,',' ORDER BY label) FROM d323_result WHERE label LIKE 'initial_%'),
 'pending_payment,pending_payment','first approvals report pending payment');
SELECT is((SELECT status FROM public.investor_subscriptions WHERE user_id='d3230001-0000-4000-8000-000000000002'),
 'active','normal payment-state fixture is active');
SELECT is(private.has_investor_subscription_for_user('d3230001-0000-4000-8000-000000000002'),
 true,'paid fixture has current entitlement before repeat');
SELECT is((SELECT role::text FROM public.profiles WHERE user_id='d3230001-0000-4000-8000-000000000002'),
 'investor','normal active subscription trigger assigned investor role');
INSERT INTO d323_before SELECT 'paid',pg_temp.d323_state(),private.has_investor_subscription_for_user('d3230001-0000-4000-8000-000000000002');
SET LOCAL ROLE service_role;
SELECT pg_temp.d323_attempt('paid_repeat',
 $$INSERT INTO d323_result SELECT 'paid_repeat',r.* FROM public.admin_review_invitation_request('d3230001-0000-4000-8000-000000000001','d3230002-0000-4000-8000-000000000002','approved','private',NULL) r$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d323_outcome WHERE label='paid_repeat'),NULL::text,'same-action paid repeat succeeds');
SELECT is((SELECT to_jsonb(r)-'label' FROM d323_result r WHERE label='paid_repeat'),
 jsonb_build_object('request_id','d3230002-0000-4000-8000-000000000002','status','approved',
 'tier','private','granted_role','investor','email','d323-paid@example.test',
 'full_name','Paid Applicant','subscription_status','active'),
 'paid repeat returns established seven columns and actual active status');
SELECT ok(pg_temp.d323_state()=(SELECT state FROM d323_before WHERE label='paid'),
 'paid repeat leaves full graph and row identities unchanged');
SELECT is(private.has_investor_subscription_for_user('d3230001-0000-4000-8000-000000000002'),
 (SELECT entitled FROM d323_before WHERE label='paid'),'paid repeat retains entitlement');

INSERT INTO d323_before SELECT 'pending',pg_temp.d323_state(),private.has_investor_subscription_for_user('d3230001-0000-4000-8000-000000000003');
SET LOCAL ROLE service_role;
SELECT pg_temp.d323_attempt('pending_repeat',
 $$INSERT INTO d323_result SELECT 'pending_repeat',r.* FROM public.admin_review_invitation_request('d3230001-0000-4000-8000-000000000001','d3230002-0000-4000-8000-000000000003','approved','private',NULL) r$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d323_outcome WHERE label='pending_repeat'),NULL::text,'stored-checkout repeat succeeds');
SELECT is((SELECT subscription_status FROM d323_result WHERE label='pending_repeat'),
 'pending_payment','stored-checkout repeat reports actual pending status');
SELECT ok(pg_temp.d323_state()=(SELECT state FROM d323_before WHERE label='pending'),
 'stored-checkout repeat leaves full graph and row identities unchanged');
SELECT is((SELECT stripe_session_id FROM public.investor_subscriptions WHERE user_id='d3230001-0000-4000-8000-000000000003'),
 'cs_d323_pending','stored checkout session remains linked');

INSERT INTO d323_before SELECT 'repeat2',pg_temp.d323_state(),private.has_investor_subscription_for_user('d3230001-0000-4000-8000-000000000002');
SET LOCAL ROLE service_role;
SELECT pg_temp.d323_attempt('paid_repeat2',
 $$SELECT * FROM public.admin_review_invitation_request('d3230001-0000-4000-8000-000000000001','d3230002-0000-4000-8000-000000000002','approved','private',NULL)$$);
RESET ROLE;
SELECT ok((SELECT sqlstate IS NULL FROM d323_outcome WHERE label='paid_repeat2')
 AND pg_temp.d323_state()=(SELECT state FROM d323_before WHERE label='repeat2'),
 'second same-action repeat also performs no write');
SELECT is(current_setting('session_replication_role'),'origin','normal triggers remain active');

SET LOCAL ROLE service_role;
UPDATE public.investor_subscriptions SET status='trial',expires_at=NULL
 WHERE user_id='d3230001-0000-4000-8000-000000000002';
RESET ROLE;
INSERT INTO d323_before SELECT 'trial',pg_temp.d323_state(),private.has_investor_subscription_for_user('d3230001-0000-4000-8000-000000000002');
SET LOCAL ROLE service_role;
SELECT pg_temp.d323_attempt('trial_repeat',
 $$INSERT INTO d323_result SELECT 'trial_repeat',r.* FROM public.admin_review_invitation_request('d3230001-0000-4000-8000-000000000001','d3230002-0000-4000-8000-000000000002','approved','private',NULL) r$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d323_outcome WHERE label='trial_repeat'),NULL::text,
 'no-expiry trial repeat succeeds');
SELECT is((SELECT subscription_status FROM d323_result WHERE label='trial_repeat'),
 'trial','trial repeat reports actual status');
SELECT ok(pg_temp.d323_state()=(SELECT state FROM d323_before WHERE label='trial')
 AND private.has_investor_subscription_for_user('d3230001-0000-4000-8000-000000000002')
 = (SELECT entitled FROM d323_before WHERE label='trial'),
 'trial repeat preserves complete graph, row identity and entitlement');

INSERT INTO d323_before SELECT 'denials',pg_temp.d323_state(),false;
SET LOCAL ROLE service_role;
SELECT pg_temp.d323_attempt('nonadmin',
 $$SELECT * FROM public.admin_review_invitation_request('d3230001-0000-4000-8000-000000000002','d3230002-0000-4000-8000-000000000003','approved','private',NULL)$$);
SELECT pg_temp.d323_attempt('noadmin',
 $$SELECT * FROM public.admin_review_invitation_request(NULL::uuid,'d3230002-0000-4000-8000-000000000003','approved','private',NULL)$$);
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM d323_outcome WHERE label IN ('nonadmin','noadmin')
 AND sqlstate='P0001' AND message='forbidden'),2,'nonadmin and missing admin deny');
SELECT ok(pg_temp.d323_state()=(SELECT state FROM d323_before WHERE label='denials'),
 'denied retries leave complete graph and row identities unchanged');

-- Characterize preexisting recovery behavior; these are not same-action paid retries.
SET LOCAL ROLE service_role;
DELETE FROM public.investor_subscriptions WHERE user_id='d3230001-0000-4000-8000-000000000003';
SELECT pg_temp.d323_attempt('missing_subscription',
 $$INSERT INTO d323_result SELECT 'missing_subscription',r.* FROM public.admin_review_invitation_request('d3230001-0000-4000-8000-000000000001','d3230002-0000-4000-8000-000000000003','approved','private',NULL) r$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d323_outcome WHERE label='missing_subscription'),NULL::text,
 'approved request with missing subscription currently creates a replacement');
SELECT is((SELECT subscription_status FROM d323_result WHERE label='missing_subscription'),
 'pending_payment','missing subscription recovery requires payment');

SET LOCAL ROLE service_role;
UPDATE public.investor_subscriptions SET status='cancelled'
 WHERE user_id='d3230001-0000-4000-8000-000000000003';
SELECT pg_temp.d323_attempt('cancelled_subscription',
 $$INSERT INTO d323_result SELECT 'cancelled_subscription',r.* FROM public.admin_review_invitation_request('d3230001-0000-4000-8000-000000000001','d3230002-0000-4000-8000-000000000003','approved','private',NULL) r$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d323_outcome WHERE label='cancelled_subscription'),NULL::text,
 'cancelled same-tier row currently starts a new payment');
SELECT is((SELECT subscription_status FROM d323_result WHERE label='cancelled_subscription'),
 'pending_payment','cancelled row is not restored to paid access');

SET LOCAL ROLE service_role;
UPDATE public.investor_subscriptions SET status='active',expires_at=now()-interval '1 day'
 WHERE user_id='d3230001-0000-4000-8000-000000000003';
SELECT pg_temp.d323_attempt('expired_subscription',
 $$INSERT INTO d323_result SELECT 'expired_subscription',r.* FROM public.admin_review_invitation_request('d3230001-0000-4000-8000-000000000001','d3230002-0000-4000-8000-000000000003','approved','private',NULL) r$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d323_outcome WHERE label='expired_subscription'),NULL::text,
 'expired same-tier row currently starts a new payment');
SELECT is((SELECT subscription_status FROM d323_result WHERE label='expired_subscription'),
 'pending_payment','expired row is not restored to paid access');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','',true);
SELECT * FROM finish();
ROLLBACK;
