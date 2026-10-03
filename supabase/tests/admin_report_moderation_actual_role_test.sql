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
SELECT plan(41);
SELECT is(current_setting('session_replication_role'),'origin','normal triggers active');
SELECT ok(has_function_privilege('service_role','public.admin_resolve_listing_report_for_user(uuid,uuid)','EXECUTE')
 AND has_function_privilege('service_role','public.admin_suspend_reported_listing_for_user(uuid,uuid,text)','EXECUTE')
 AND has_function_privilege('service_role','public.admin_ban_reported_content_owner_for_user(uuid,uuid,text)','EXECUTE'),
 'actual service role has explicit-admin RPC grants');
SELECT ok(NOT has_function_privilege('authenticated','public.admin_resolve_listing_report_for_user(uuid,uuid)','EXECUTE')
 AND NOT has_function_privilege('anon','public.admin_resolve_listing_report_for_user(uuid,uuid)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.admin_resolve_listing_report(uuid)','EXECUTE'),
 'browser roles lack explicit and legacy moderation RPC grants');

INSERT INTO auth.users(id,email) VALUES
 ('d3200001-0000-4000-8000-000000000001','kr@maiprop.co'),
 ('d3200001-0000-4000-8000-000000000002','d3-mod-reporter@example.test'),
 ('d3200001-0000-4000-8000-000000000003','d3-mod-listing-owner@example.test'),
 ('d3200001-0000-4000-8000-000000000004','d3-mod-firesale-owner@example.test'),
 ('d3200001-0000-4000-8000-000000000005','d3-mod-nonadmin@example.test');
SELECT set_config('maiprop.owner_auth_trigger_active','false',true);
SELECT is((SELECT role::text FROM public.profiles WHERE user_id='d3200001-0000-4000-8000-000000000001'),
 'admin','normal owner auth trigger grants authoritative admin');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT public.complete_onboarding_role_for_user('d3200001-0000-4000-8000-000000000003','seller','seller');
SELECT public.complete_onboarding_role_for_user('d3200001-0000-4000-8000-000000000004','seller','seller');
INSERT INTO public.listings(id,owner_id,title,city,price,sqm,property_type,status)
 VALUES('d3200002-0000-4000-8000-000000000001','d3200001-0000-4000-8000-000000000003',
 'D3 moderation home','Athens',250000,80,'apartment','active');
INSERT INTO public.firesale_requests(id,user_id,address,city,sqm,condition,contact_email,asking_price)
 VALUES('d3200002-0000-4000-8000-000000000002','d3200001-0000-4000-8000-000000000004',
 'D3 moderation deal','Athens',90,'good','d3-mod-firesale-owner@example.test',300000);
RESET ROLE;
INSERT INTO public.listing_reports(id,entity_type,entity_id,reporter_id) VALUES
 ('d3200003-0000-4000-8000-000000000001','listing','d3200002-0000-4000-8000-000000000001','d3200001-0000-4000-8000-000000000002'),
 ('d3200003-0000-4000-8000-000000000002','listing','d3200002-0000-4000-8000-000000000001','d3200001-0000-4000-8000-000000000002'),
 ('d3200003-0000-4000-8000-000000000003','firesale_request','d3200002-0000-4000-8000-000000000002','d3200001-0000-4000-8000-000000000002'),
 ('d3200003-0000-4000-8000-000000000004','listing','d3200002-0000-4000-8000-000000000001','d3200001-0000-4000-8000-000000000002'),
 ('d3200003-0000-4000-8000-000000000005','firesale_request','d3200002-0000-4000-8000-000000000002','d3200001-0000-4000-8000-000000000002'),
 ('d3200003-0000-4000-8000-000000000006','listing','d3200002-0000-4000-8000-000000000099','d3200001-0000-4000-8000-000000000002');

CREATE FUNCTION pg_temp.d3_state() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
  'auth',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(u)),'{}'::jsonb) FROM auth.users u WHERE id::text LIKE 'd3200001-%'),
  'profiles',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(p)),'{}'::jsonb) FROM public.profiles p WHERE user_id::text LIKE 'd3200001-%'),
  'profiles_public',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(p)),'{}'::jsonb) FROM public.profiles_public p WHERE user_id::text LIKE 'd3200001-%'),
  'listings',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(l)),'{}'::jsonb) FROM public.listings l WHERE id::text LIKE 'd3200002-%'),
  'firesale',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(f)),'{}'::jsonb) FROM public.firesale_requests f WHERE id::text LIKE 'd3200002-%'),
  'feed',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(f)),'{}'::jsonb) FROM public.firesale_requests_investor_feed f WHERE id::text LIKE 'd3200002-%'),
  'reports',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(r)),'{}'::jsonb) FROM public.listing_reports r WHERE id::text LIKE 'd3200003-%'),
  'notifications',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(n)),'{}'::jsonb) FROM public.notifications n)
 )
$$;
CREATE FUNCTION pg_temp.d3_put(s jsonb,part text,k text,r jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_set(s,ARRAY[part,k],r,true)
$$;
CREATE FUNCTION pg_temp.d3_notice(s jsonb,recipient uuid,title text,body text,kind text,link text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_set(s,'{notifications}',s->'notifications'||
  coalesce((SELECT jsonb_object_agg(e.key,jsonb_build_object('id',e.key::uuid,'user_id',recipient,
   'title',title,'body',body,'type',kind,'read',false,'created_at',now(),'link',link))
   FROM jsonb_each(pg_temp.d3_state()->'notifications') e
   WHERE NOT (s->'notifications' ? e.key)),'{}'::jsonb),false)
$$;
CREATE TEMP TABLE d3_before(state jsonb);
CREATE TEMP TABLE d3_outcome(label text,sqlstate text,message text);
GRANT INSERT ON d3_outcome TO service_role,authenticated;
CREATE FUNCTION pg_temp.d3_attempt(label text,command text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_state text; v_message text;
BEGIN
 BEGIN EXECUTE command; INSERT INTO d3_outcome VALUES(label,NULL,NULL);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state=RETURNED_SQLSTATE,v_message=MESSAGE_TEXT;
  INSERT INTO d3_outcome VALUES(label,v_state,v_message);
 END;
END $$;

-- Active Edge-equivalent service/no-sub resolve, including exact prior-state preservation.
INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('resolve',
 $$SELECT public.admin_resolve_listing_report_for_user('d3200001-0000-4000-8000-000000000001','d3200003-0000-4000-8000-000000000001')$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='resolve'),NULL::text,'service resolve succeeds');
SELECT is((SELECT status::text FROM public.listing_reports WHERE id='d3200003-0000-4000-8000-000000000001'),
 'resolved','resolve persists report status');
SELECT is((SELECT count(*)::integer FROM public.notifications n WHERE NOT ((SELECT state->'notifications' FROM d3_before) ? n.id::text)),1,
 'resolve inserts one distinct reporter notice');
SELECT is(pg_temp.d3_state(),
 (SELECT pg_temp.d3_notice(pg_temp.d3_put(state,'reports','d3200003-0000-4000-8000-000000000001',
  state->'reports'->'d3200003-0000-4000-8000-000000000001'||'{"status":"resolved"}'::jsonb),
  'd3200001-0000-4000-8000-000000000002','Report reviewed',
  'Your report has been reviewed by our moderation team.','report',
  '/property/d3200002-0000-4000-8000-000000000001') FROM d3_before),
 'resolve exact fixture graph and earlier notice preservation');

TRUNCATE d3_before;
INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('resolve_repeat',
 $$SELECT public.admin_resolve_listing_report_for_user('d3200001-0000-4000-8000-000000000001','d3200003-0000-4000-8000-000000000001')$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='resolve_repeat'),NULL::text,'repeat resolve succeeds under current body');
SELECT is((SELECT count(*)::integer FROM public.notifications n WHERE NOT ((SELECT state->'notifications' FROM d3_before) ? n.id::text)),1,
 'repeat resolve currently inserts another reporter notice');
SELECT is(pg_temp.d3_state(),
 (SELECT pg_temp.d3_notice(state,'d3200001-0000-4000-8000-000000000002',
  'Report reviewed','Your report has been reviewed by our moderation team.','report',
  '/property/d3200002-0000-4000-8000-000000000001') FROM d3_before),
 'repeat resolve changes only notice graph');

-- Every rejection is captured within the statement subtransaction, then compared with the full graph.
TRUNCATE d3_before;
INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('nonadmin_resolve',
 $$SELECT public.admin_resolve_listing_report_for_user('d3200001-0000-4000-8000-000000000005','d3200003-0000-4000-8000-000000000002')$$);
SELECT pg_temp.d3_attempt('missing_resolve',
 $$SELECT public.admin_resolve_listing_report_for_user('d3200001-0000-4000-8000-000000000001','d3200003-0000-4000-8000-000000000099')$$);
SELECT pg_temp.d3_attempt('null_admin_resolve',
 $$SELECT public.admin_resolve_listing_report_for_user(NULL::uuid,'d3200003-0000-4000-8000-000000000002')$$);
SELECT pg_temp.d3_attempt('missing_admin_resolve',
 $$SELECT public.admin_resolve_listing_report_for_user('d3200001-0000-4000-8000-000000000099','d3200003-0000-4000-8000-000000000002')$$);
SELECT pg_temp.d3_attempt('wrong_entity_suspend',
 $$SELECT public.admin_suspend_reported_listing_for_user('d3200001-0000-4000-8000-000000000001','d3200003-0000-4000-8000-000000000003','reason')$$);
SELECT pg_temp.d3_attempt('missing_listing_suspend',
 $$SELECT public.admin_suspend_reported_listing_for_user('d3200001-0000-4000-8000-000000000001','d3200003-0000-4000-8000-000000000006','reason')$$);
SELECT pg_temp.d3_attempt('nonadmin_suspend',
 $$SELECT public.admin_suspend_reported_listing_for_user('d3200001-0000-4000-8000-000000000005','d3200003-0000-4000-8000-000000000002','reason')$$);
SELECT pg_temp.d3_attempt('null_admin_suspend',
 $$SELECT public.admin_suspend_reported_listing_for_user(NULL::uuid,'d3200003-0000-4000-8000-000000000002','reason')$$);
SELECT pg_temp.d3_attempt('missing_admin_suspend',
 $$SELECT public.admin_suspend_reported_listing_for_user('d3200001-0000-4000-8000-000000000099','d3200003-0000-4000-8000-000000000002','reason')$$);
SELECT pg_temp.d3_attempt('missing_report_suspend',
 $$SELECT public.admin_suspend_reported_listing_for_user('d3200001-0000-4000-8000-000000000001','d3200003-0000-4000-8000-000000000099','reason')$$);
RESET ROLE;
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='nonadmin_resolve'),
 '42501:forbidden','nonadmin first denial is authority check');
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='missing_resolve'),
 'P0002:listing_report_not_found','missing report first denial is target lookup');
SELECT is((SELECT count(*)::integer FROM d3_outcome WHERE label IN
 ('null_admin_resolve','missing_admin_resolve','nonadmin_suspend','null_admin_suspend','missing_admin_suspend')
 AND sqlstate='42501' AND message='forbidden'),5,
 'NULL/missing/NULL-role admin IDs deny resolve and suspend');
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='wrong_entity_suspend'),
 '23514:report_entity_is_not_listing','suspend rejects firesale report');
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='missing_listing_suspend'),
 'P0002:listing_not_found','suspend rejects missing listing');
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='missing_report_suspend'),
 'P0002:listing_report_not_found','suspend rejects missing report');
SELECT is(pg_temp.d3_state(),(SELECT state FROM d3_before),
 'resolve/suspend denials preserve complete fixture and notification graph');

-- Suspend a real listing; ban a real firesale owner through the normal profile guard.
TRUNCATE d3_before;
INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('suspend',
 $$SELECT public.admin_suspend_reported_listing_for_user('d3200001-0000-4000-8000-000000000001','d3200003-0000-4000-8000-000000000002','policy violation')$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='suspend'),NULL::text,'service suspend succeeds');
SELECT is(pg_temp.d3_state(),
 (SELECT pg_temp.d3_notice(pg_temp.d3_put(pg_temp.d3_put(state,'reports',
  'd3200003-0000-4000-8000-000000000002',state->'reports'->'d3200003-0000-4000-8000-000000000002'||'{"status":"resolved"}'::jsonb),
  'listings','d3200002-0000-4000-8000-000000000001',state->'listings'->'d3200002-0000-4000-8000-000000000001'||
  jsonb_build_object('status','paused','updated_at',now())),
  'd3200001-0000-4000-8000-000000000003','Listing suspended',
  'Your listing D3 moderation home was paused after a moderation review. policy violation',
  'moderation','/dashboard/listings') FROM d3_before),
 'suspend exact listing/report/owner-notice delta preserves all other rows');

TRUNCATE d3_before;
INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('ban',
 $$SELECT public.admin_ban_reported_content_owner_for_user('d3200001-0000-4000-8000-000000000001','d3200003-0000-4000-8000-000000000003','abusive content')$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='ban'),NULL::text,'service ban succeeds');
SELECT is((SELECT account_status FROM public.profiles WHERE user_id='d3200001-0000-4000-8000-000000000004'),
 'banned','normal profile moderation guard admits authoritative ban');
SELECT is(pg_temp.d3_state(),
 (SELECT pg_temp.d3_notice(pg_temp.d3_put(pg_temp.d3_put(state,'reports',
  'd3200003-0000-4000-8000-000000000003',state->'reports'->'d3200003-0000-4000-8000-000000000003'||'{"status":"resolved"}'::jsonb),
  'profiles','d3200001-0000-4000-8000-000000000004',state->'profiles'->'d3200001-0000-4000-8000-000000000004'||
  jsonb_build_object('account_status','banned','account_moderation_reason','abusive content',
   'account_moderated_at',now(),'account_moderated_by','d3200001-0000-4000-8000-000000000001',
   'investor_mode',false,'updated_at',now())),
  'd3200001-0000-4000-8000-000000000004','Account banned','abusive content',
  'moderation','/dashboard/settings') FROM d3_before),
 'ban exact profile/report/owner-notice delta preserves all other rows');

TRUNCATE d3_before;
INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('nonadmin_ban',
 $$SELECT public.admin_ban_reported_content_owner_for_user('d3200001-0000-4000-8000-000000000005','d3200003-0000-4000-8000-000000000004','x')$$);
SELECT pg_temp.d3_attempt('missing_owner_ban',
 $$SELECT public.admin_ban_reported_content_owner_for_user('d3200001-0000-4000-8000-000000000001','d3200003-0000-4000-8000-000000000006','x')$$);
SELECT pg_temp.d3_attempt('null_admin_ban',
 $$SELECT public.admin_ban_reported_content_owner_for_user(NULL::uuid,'d3200003-0000-4000-8000-000000000004','x')$$);
SELECT pg_temp.d3_attempt('missing_admin_ban',
 $$SELECT public.admin_ban_reported_content_owner_for_user('d3200001-0000-4000-8000-000000000099','d3200003-0000-4000-8000-000000000004','x')$$);
SELECT pg_temp.d3_attempt('missing_report_ban',
 $$SELECT public.admin_ban_reported_content_owner_for_user('d3200001-0000-4000-8000-000000000001','d3200003-0000-4000-8000-000000000099','x')$$);
RESET ROLE;
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='nonadmin_ban'),
 '42501:forbidden','nonadmin ban rejects at authority');
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='missing_owner_ban'),
 'P0002:reported_owner_not_found','ban rejects missing owner');
SELECT is((SELECT count(*)::integer FROM d3_outcome WHERE label IN ('null_admin_ban','missing_admin_ban')
 AND sqlstate='42501' AND message='forbidden'),2,'ban denies NULL and missing admin IDs');
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='missing_report_ban'),
 'P0002:listing_report_not_found','ban denies missing report');
SELECT is(pg_temp.d3_state(),(SELECT state FROM d3_before),
 'ban denials preserve complete graph');

-- Retained compatibility overloads need real subject and service grant; browser execution stays denied.
SELECT set_config('request.jwt.claim.sub','d3200001-0000-4000-8000-000000000001',true),
 set_config('request.jwt.claims','{"role":"service_role","sub":"d3200001-0000-4000-8000-000000000001"}',true);
TRUNCATE d3_before;
INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('legacy_resolve',
 $$SELECT public.admin_resolve_listing_report('d3200003-0000-4000-8000-000000000004')$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='legacy_resolve'),NULL::text,
 'legacy resolve accepts real admin subject');
SELECT ok(pg_temp.d3_state()=
 (SELECT pg_temp.d3_notice(pg_temp.d3_put(state,'reports',
  'd3200003-0000-4000-8000-000000000004',state->'reports'->'d3200003-0000-4000-8000-000000000004'||
  '{"status":"resolved"}'::jsonb),'d3200001-0000-4000-8000-000000000002',
  'Report reviewed','Your report has been reviewed by our moderation team.','report',
  '/property/d3200002-0000-4000-8000-000000000001') FROM d3_before),
 'legacy resolve exact report/reporter notice and prior graph');
TRUNCATE d3_before;
INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('legacy_suspend',
 $$SELECT public.admin_suspend_reported_listing('d3200003-0000-4000-8000-000000000004','legacy reason')$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='legacy_suspend'),NULL::text,
 'legacy suspend accepts real admin subject');
SELECT ok(pg_temp.d3_state()=
 (SELECT pg_temp.d3_notice(state,'d3200001-0000-4000-8000-000000000003',
  'Listing suspended','Your listing D3 moderation home was paused after a moderation review. legacy reason',
  'moderation','/dashboard/listings') FROM d3_before),
 'legacy repeated suspend changes only owner notice, preserving complete graph');
TRUNCATE d3_before;
INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('legacy_ban',
 $$SELECT public.admin_ban_reported_content_owner('d3200003-0000-4000-8000-000000000005','legacy ban')$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='legacy_ban'),NULL::text,
 'legacy ban accepts real admin subject');
SELECT ok(pg_temp.d3_state()=
 (SELECT pg_temp.d3_notice(pg_temp.d3_put(pg_temp.d3_put(state,'reports',
  'd3200003-0000-4000-8000-000000000005',state->'reports'->'d3200003-0000-4000-8000-000000000005'||
  '{"status":"resolved"}'::jsonb),'profiles','d3200001-0000-4000-8000-000000000004',
  state->'profiles'->'d3200001-0000-4000-8000-000000000004'||
  '{"account_moderation_reason":"legacy ban"}'::jsonb),
  'd3200001-0000-4000-8000-000000000004','Account banned','legacy ban',
  'moderation','/dashboard/settings') FROM d3_before),
 'legacy ban exact profile/report/notice graph');
SELECT is((SELECT status::text FROM public.listing_reports WHERE id='d3200003-0000-4000-8000-000000000005'),
 'resolved','legacy ban resolves report');
SELECT is((SELECT account_status FROM public.profiles WHERE user_id='d3200001-0000-4000-8000-000000000004'),
 'banned','legacy ban retains banned owner state');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','',true);
TRUNCATE d3_before;
INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('legacy_resolve_no_subject',
 $$SELECT public.admin_resolve_listing_report('d3200003-0000-4000-8000-000000000004')$$);
SELECT pg_temp.d3_attempt('legacy_suspend_no_subject',
 $$SELECT public.admin_suspend_reported_listing('d3200003-0000-4000-8000-000000000004','x')$$);
SELECT pg_temp.d3_attempt('legacy_ban_no_subject',
 $$SELECT public.admin_ban_reported_content_owner('d3200003-0000-4000-8000-000000000005','x')$$);
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM d3_outcome WHERE label LIKE 'legacy_%_no_subject'
 AND sqlstate='P0001' AND message='forbidden'),3,
 'legacy service calls with no subject deny at authority');
SELECT ok(pg_temp.d3_state()=(SELECT state FROM d3_before),
 'legacy no-subject denials preserve exact complete graph');
SET LOCAL ROLE authenticated;
SELECT pg_temp.d3_attempt('browser_legacy_resolve',
 $$SELECT public.admin_resolve_listing_report('d3200003-0000-4000-8000-000000000004')$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='browser_legacy_resolve'),
 '42501','authenticated legacy call denied at EXECUTE ACL');
SELECT ok(pg_temp.d3_state()=(SELECT state FROM d3_before),
 'browser ACL denial preserves complete graph');
SELECT is(current_setting('session_replication_role'),'origin','normal triggers remain active');
SELECT * FROM finish();
ROLLBACK;
