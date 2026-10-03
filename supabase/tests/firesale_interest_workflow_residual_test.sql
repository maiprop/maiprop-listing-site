\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_setting('maiprop.test_disposable_database', true) IS DISTINCT FROM current_database()
     OR inet_server_addr() IS NOT NULL
     OR current_database() IN ('postgres','template0','template1','maiprop_t12q_20260930_source') THEN
    RAISE EXCEPTION 'Explicit matching disposable socket database required';
  END IF;
END $$;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';
SET LOCAL search_path = public, extensions;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(55);
SELECT is(current_setting('session_replication_role'), 'origin', 'normal triggers remain active');

INSERT INTO auth.users(id,email) VALUES
 ('d3170001-0000-4000-8000-000000000001','d3-interest-seller@example.test'),
 ('d3170001-0000-4000-8000-000000000002','d3-interest-investor@example.test'),
 ('d3170001-0000-4000-8000-000000000004','d3-interest-unpaid@example.test'),
 ('d3170001-0000-4000-8000-000000000003','kr@maiprop.co');
SELECT set_config('maiprop.owner_auth_trigger_active','false',true);
SELECT is((SELECT role::text FROM public.profiles WHERE user_id='d3170001-0000-4000-8000-000000000003'),
 'admin','normal owner auth trigger constructed authoritative admin');
SELECT set_config('request.jwt.claim.sub','',true),
       set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT public.complete_onboarding_role_for_user('d3170001-0000-4000-8000-000000000001','seller','seller');
SELECT public.complete_onboarding_role_for_user('d3170001-0000-4000-8000-000000000002','buyer','buyer');
SELECT public.complete_onboarding_role_for_user('d3170001-0000-4000-8000-000000000004','buyer','buyer');
INSERT INTO public.investor_subscriptions(user_id,tier,status,expires_at,runtime_mode,livemode)
VALUES ('d3170001-0000-4000-8000-000000000002','private','pending_payment',now()+interval '30 days',
 public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live');
UPDATE public.investor_subscriptions SET status='active'
WHERE user_id='d3170001-0000-4000-8000-000000000002';
RESET ROLE;
SELECT is(private.has_investor_subscription_for_user('d3170001-0000-4000-8000-000000000002'),true,
 'investor has a genuine current runtime-matched entitlement');

CREATE FUNCTION pg_temp.d3_state() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
  'auth',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(u)),'{}'::jsonb) FROM auth.users u WHERE id::text LIKE 'd3170001-%'),
  'profiles',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(p)),'{}'::jsonb) FROM public.profiles p WHERE user_id::text LIKE 'd3170001-%'),
  'profiles_public',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(p)),'{}'::jsonb) FROM public.profiles_public p WHERE user_id::text LIKE 'd3170001-%'),
  'subscriptions',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(s)),'{}'::jsonb) FROM public.investor_subscriptions s WHERE user_id::text LIKE 'd3170001-%'),
  'requests',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(r)),'{}'::jsonb) FROM public.firesale_requests r WHERE id::text LIKE 'd3170002-%'),
  'feed',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(f)),'{}'::jsonb) FROM public.firesale_requests_investor_feed f WHERE id::text LIKE 'd3170002-%'),
  'interest',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(i)),'{}'::jsonb) FROM public.firesale_interest i WHERE deal_id::text LIKE 'd3170002-%'),
  'audit',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(a)),'{}'::jsonb) FROM public.firesale_interest_audit_log a WHERE deal_id::text LIKE 'd3170002-%'),
  'notifications',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(n)),'{}'::jsonb) FROM public.notifications n)
 )
$$;
CREATE FUNCTION pg_temp.d3_put(s jsonb,k text,row_id text,r jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_set(s,ARRAY[k,row_id],r,true)
$$;
CREATE FUNCTION pg_temp.d3_remove(s jsonb,k text,row_id text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_set(s,ARRAY[k],(s->k)-row_id,false)
$$;
CREATE FUNCTION pg_temp.d3_delta(after_state jsonb,before_state jsonb,k text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb)
 FROM jsonb_each(after_state->k) e WHERE NOT (before_state->k ? e.key)
$$;
CREATE TEMP TABLE d3_before(state jsonb);
INSERT INTO d3_before SELECT pg_temp.d3_state();

SELECT set_config('maiprop.audit_action','saved_action',true),
       set_config('maiprop.audit_actor','d3170001-0000-4000-8000-000000000003',true);
SET LOCAL ROLE service_role;
SELECT public.release_expired_firesale_reservations(NULL);
RESET ROLE;
SELECT is(current_setting('maiprop.audit_action',true),'saved_action',
 'no-op expiry restores caller audit action');
SELECT is(current_setting('maiprop.audit_actor',true),'d3170001-0000-4000-8000-000000000003',
 'no-op expiry restores caller audit actor');
SELECT is(pg_temp.d3_state(),(SELECT state FROM d3_before),
 'no-op expiry preserves complete fixture and prior notification state');
SELECT set_config('maiprop.audit_action','',true),set_config('maiprop.audit_actor','',true);

SET LOCAL ROLE service_role;
INSERT INTO public.firesale_requests(id,user_id,address,city,sqm,condition,contact_email,asking_price)
VALUES('d3170002-0000-4000-8000-000000000001','d3170001-0000-4000-8000-000000000001',
 'D3 local property','Athens',75,'good','d3-interest-seller@example.test',350000);
RESET ROLE;
UPDATE d3_before SET state=pg_temp.d3_state();
CREATE TEMP TABLE d3_pub_before AS SELECT state FROM d3_before;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
CREATE TEMP TABLE d3_publication_return AS SELECT * FROM public.admin_set_firesale_investor_publication_for_user(
 'd3170001-0000-4000-8000-000000000003','d3170002-0000-4000-8000-000000000001',true);
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM d3_publication_return),1,'publication returns exactly one row');
SELECT is((SELECT to_jsonb(p) FROM d3_publication_return p),
 jsonb_build_object('deal_id','d3170002-0000-4000-8000-000000000001','status','reviewed','published_to_investors',true),
 'publication returns exact id, status and published flag');
SELECT is((SELECT count(*)::integer FROM public.notifications n
 WHERE NOT ((SELECT state->'notifications' FROM d3_pub_before) ? n.id::text)),2,
 'first publication adds one seller and one investor notice');
SELECT is((SELECT jsonb_agg(to_jsonb(n)-'id' ORDER BY n.title) FROM public.notifications n
 WHERE NOT ((SELECT state->'notifications' FROM d3_pub_before) ? n.id::text)),
 jsonb_build_array(
  jsonb_build_object('user_id','d3170001-0000-4000-8000-000000000002','title','New Quick Sale deal available',
   'body','A new Quick Sale opportunity at D3 local property, Athens is now available in your investor dashboard.',
   'type','investor_alert','read',false,'link','/investor-dashboard','created_at',now()),
  jsonb_build_object('user_id','d3170001-0000-4000-8000-000000000001','title','Quick Sale request reviewed',
   'body','Your Quick Sale request for D3 local property, Athens has been reviewed by the mAI Prop team.',
   'type','quick_sale','read',false,'link','/dashboard','created_at',now())),
 'publication adds exact notices, preserving earlier subscription notice');
WITH pre AS (SELECT state FROM d3_pub_before),
 req AS (SELECT (state->'requests'->'d3170002-0000-4000-8000-000000000001') ||
  jsonb_build_object('status','reviewed','published_to_investors',true,'updated_at',now()) AS row FROM pre),
 expected AS (SELECT pg_temp.d3_put(
  pg_temp.d3_put(
   jsonb_set(pre.state,'{notifications}',
    (pre.state->'notifications') || pg_temp.d3_delta(pg_temp.d3_state(),pre.state,'notifications')),
   'requests','d3170002-0000-4000-8000-000000000001',req.row),
  'feed','d3170002-0000-4000-8000-000000000001',
  jsonb_build_object(
   'id',req.row->'id','created_at',req.row->'created_at','address',req.row->'address',
   'city',req.row->'city','property_type',req.row->'property_type','sqm',req.row->'sqm',
   'bedrooms',req.row->'bedrooms','condition',req.row->'condition','ai_estimate',req.row->'ai_estimate',
   'asking_price',req.row->'asking_price','status',req.row->'status')) AS state FROM pre,req)
SELECT is(pg_temp.d3_state(),(SELECT state FROM expected),
 'publication exact full-state delta retains all other rows and earlier notices');
CREATE TEMP TABLE d3_pub_repeat_before AS SELECT pg_temp.d3_state() AS state;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
CREATE TEMP TABLE d3_pub_repeat_return AS SELECT * FROM public.admin_set_firesale_investor_publication_for_user(
 'd3170001-0000-4000-8000-000000000003','d3170002-0000-4000-8000-000000000001',true);
RESET ROLE;
SELECT is((SELECT to_jsonb(p) FROM d3_pub_repeat_return p),
 jsonb_build_object('deal_id','d3170002-0000-4000-8000-000000000001','status','reviewed','published_to_investors',true),
 'repeat publication returns exact same public state');
SELECT is(pg_temp.d3_state(),(SELECT state FROM d3_pub_repeat_before),
 'repeat publication preserves full rows and all previous notice IDs');
SELECT set_config('request.jwt.claim.sub','',true);
UPDATE d3_before SET state=pg_temp.d3_state();
CREATE TEMP TABLE d3_interest_before AS SELECT state FROM d3_before;
SET LOCAL ROLE service_role;
CREATE TEMP TABLE d3_interest_return AS
 WITH called AS MATERIALIZED (
  SELECT public.submit_firesale_interest_for_user(
   'd3170001-0000-4000-8000-000000000002','d3170002-0000-4000-8000-000000000001','first',NULL,NULL) AS r
 ) SELECT (r).* FROM called;
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM d3_interest_return),1,'interest submission returns exactly one row');
SELECT is((SELECT to_jsonb(r) FROM d3_interest_return r),
 (SELECT to_jsonb(i) FROM public.firesale_interest i WHERE i.id=(SELECT id FROM d3_interest_return)),
 'returned interest ID and complete row equal the persisted row');
SELECT is((SELECT to_jsonb(r) FROM d3_interest_return r),
 (SELECT jsonb_build_object(
  'id',r.id,'deal_id','d3170002-0000-4000-8000-000000000001',
  'investor_id','d3170001-0000-4000-8000-000000000002',
  'proof_of_funds_url',NULL,'proof_amount',NULL,'message','first','status','interested',
  'created_at',now(),'updated_at',now(),'proof_of_funds_verified_at',NULL,
  'proof_of_funds_verified_by',NULL,'reservation_expires_at',NULL,'reserved_at',NULL,
  'reserved_by',NULL,'admin_note',NULL,'last_status_changed_at',now())
  FROM d3_interest_return r),
 'first interest returns exact defaults and generated ID');
SELECT is((SELECT count(*)::integer FROM public.firesale_interest_audit_log a
 WHERE NOT ((SELECT state->'audit' FROM d3_interest_before) ? a.id::text)
 AND a.deal_id='d3170002-0000-4000-8000-000000000001'),1,
 'first interest inserts exactly one audit row');
SELECT is((SELECT to_jsonb(a)-'id' FROM public.firesale_interest_audit_log a
 WHERE a.deal_id='d3170002-0000-4000-8000-000000000001'),
 jsonb_build_object('interest_id',(SELECT id FROM d3_interest_return),
  'deal_id','d3170002-0000-4000-8000-000000000001',
  'actor_id','d3170001-0000-4000-8000-000000000002',
  'action','interest_created','from_status',NULL,'to_status','interested',
  'metadata',jsonb_build_object('proof_amount',NULL,'reservation_expires_at',NULL),
  'created_at',now()),
 'first interest audit has exact actor, action, status and metadata');
WITH pre AS (SELECT state FROM d3_interest_before),
 expected AS (SELECT jsonb_set(
  pg_temp.d3_put(pre.state,'interest',(SELECT id::text FROM d3_interest_return),
   (SELECT to_jsonb(r) FROM d3_interest_return r)),
  '{audit}',(pre.state->'audit') || pg_temp.d3_delta(pg_temp.d3_state(),pre.state,'audit')) AS state FROM pre)
SELECT is(pg_temp.d3_state(),(SELECT state FROM expected),
 'interest creation exact full-state delta retains prior notices, feed and other rows');
SELECT is((SELECT action FROM public.firesale_interest_audit_log
 WHERE deal_id='d3170002-0000-4000-8000-000000000001'),
 'interest_created','ordinary interest INSERT receives its derived audit action');

CREATE TEMP TABLE d3_retry_before AS SELECT pg_temp.d3_state() AS state;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
CREATE TEMP TABLE d3_retry_return AS
 WITH called AS MATERIALIZED (
  SELECT public.submit_firesale_interest_for_user(
   'd3170001-0000-4000-8000-000000000002','d3170002-0000-4000-8000-000000000001',
   'second',250000,
   'd3170001-0000-4000-8000-000000000002/firesale/d3170002-0000-4000-8000-000000000001/proof.pdf') AS r
 ) SELECT (r).* FROM called;
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM d3_retry_return),1,'retry returns exactly one row');
SELECT is((SELECT id FROM d3_retry_return),(SELECT id FROM d3_interest_return),
 'retry reuses original interest ID');
SELECT is((SELECT to_jsonb(r) FROM d3_retry_return r),
 (SELECT (state->'interest'->(SELECT id::text FROM d3_interest_return)) ||
  jsonb_build_object('message','second','proof_amount',250000,
   'proof_of_funds_url','d3170001-0000-4000-8000-000000000002/firesale/d3170002-0000-4000-8000-000000000001/proof.pdf',
   'status','prioritized','updated_at',now(),'last_status_changed_at',now())
  FROM d3_retry_before),
 'retry returns complete expected interest row with preserved defaults');
SELECT is((SELECT to_jsonb(i) FROM public.firesale_interest i WHERE id=(SELECT id FROM d3_retry_return)),
 (SELECT to_jsonb(r) FROM d3_retry_return r),'retry returned row equals persisted row');
SELECT is((SELECT count(*)::integer FROM public.firesale_interest_audit_log a
 WHERE a.deal_id='d3170002-0000-4000-8000-000000000001'
 AND NOT ((SELECT state->'audit' FROM d3_retry_before) ? a.id::text)),1,
 'retry adds exactly one audit row');
SELECT is((SELECT to_jsonb(a)-'id' FROM public.firesale_interest_audit_log a
 WHERE a.deal_id='d3170002-0000-4000-8000-000000000001'
 AND NOT ((SELECT state->'audit' FROM d3_retry_before) ? a.id::text)),
 jsonb_build_object('interest_id',(SELECT id FROM d3_interest_return),
  'deal_id','d3170002-0000-4000-8000-000000000001',
  'actor_id','d3170001-0000-4000-8000-000000000002',
  'action','status_changed','from_status','interested','to_status','prioritized',
  'metadata',jsonb_build_object('proof_amount_before',NULL,'proof_amount_after',250000,
   'reservation_expires_at_before',NULL,'reservation_expires_at_after',NULL),
  'created_at',now()),
 'retry audit derives status_changed and exact prior/new metadata');
WITH pre AS (SELECT state FROM d3_retry_before),
 expected AS (SELECT jsonb_set(
  pg_temp.d3_put(pre.state,'interest',(SELECT id::text FROM d3_interest_return),
   (SELECT to_jsonb(r) FROM d3_retry_return r)),
  '{audit}',(pre.state->'audit') || pg_temp.d3_delta(pg_temp.d3_state(),pre.state,'audit')) AS state FROM pre)
SELECT is(pg_temp.d3_state(),(SELECT state FROM expected),
 'retry exact full-state delta preserves earlier audit, notices and all other rows');

CREATE TEMP TABLE d3_reserve_before AS SELECT pg_temp.d3_state() AS state;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
CREATE TEMP TABLE d3_reserve_return AS
 WITH called AS MATERIALIZED (
  SELECT public.admin_update_firesale_interest_workflow_for_user(
   'd3170001-0000-4000-8000-000000000003',(SELECT id FROM d3_interest_return),
   'reserved',2,true,'checked',NULL) AS r
 ) SELECT (r).* FROM called;
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM d3_reserve_return),1,'admin reservation returns one row');
SELECT is((SELECT id FROM d3_reserve_return),(SELECT id FROM d3_interest_return),
 'admin reservation returns original interest ID');
SELECT is((SELECT to_jsonb(r) FROM d3_reserve_return r),
 (SELECT (state->'interest'->(SELECT id::text FROM d3_interest_return)) ||
  jsonb_build_object('status','reserved','reservation_expires_at',now()+interval '2 hours',
   'reserved_at',now(),'reserved_by','d3170001-0000-4000-8000-000000000003',
   'proof_of_funds_verified_at',now(),
   'proof_of_funds_verified_by','d3170001-0000-4000-8000-000000000003',
   'admin_note','checked','updated_at',now(),'last_status_changed_at',now())
  FROM d3_reserve_before),
 'reservation returns complete expected status, hold and verification fields');
SELECT is((SELECT to_jsonb(i) FROM public.firesale_interest i WHERE id=(SELECT id FROM d3_interest_return)),
 (SELECT to_jsonb(r) FROM d3_reserve_return r),'reservation return equals persisted row');
SELECT is((SELECT count(*)::integer FROM public.firesale_interest_audit_log a
 WHERE a.deal_id='d3170002-0000-4000-8000-000000000001'
 AND NOT ((SELECT state->'audit' FROM d3_reserve_before) ? a.id::text)),1,
 'reservation adds exactly one audit row');
SELECT is((SELECT to_jsonb(a)-'id' FROM public.firesale_interest_audit_log a
 WHERE a.deal_id='d3170002-0000-4000-8000-000000000001'
 AND NOT ((SELECT state->'audit' FROM d3_reserve_before) ? a.id::text)),
 jsonb_build_object('interest_id',(SELECT id FROM d3_interest_return),
  'deal_id','d3170002-0000-4000-8000-000000000001',
  'actor_id','d3170001-0000-4000-8000-000000000003',
  'action','reservation_assigned','from_status','prioritized','to_status','reserved',
  'metadata',jsonb_build_object('proof_amount_before',250000,'proof_amount_after',250000,
   'reservation_expires_at_before',NULL,'reservation_expires_at_after',now()+interval '2 hours'),
  'created_at',now()),
 'reservation audit derives correct action, actor and full metadata');
WITH pre AS (SELECT state FROM d3_reserve_before),
 expected AS (SELECT jsonb_set(
  pg_temp.d3_put(pre.state,'interest',(SELECT id::text FROM d3_interest_return),
   (SELECT to_jsonb(r) FROM d3_reserve_return r)),
  '{audit}',(pre.state->'audit') || pg_temp.d3_delta(pg_temp.d3_state(),pre.state,'audit')) AS state FROM pre)
SELECT is(pg_temp.d3_state(),(SELECT state FROM expected),
 'reservation exact full-state delta preserves prior notices and other rows');

CREATE TEMP TABLE d3_pipeline_before AS SELECT pg_temp.d3_state() AS state;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
CREATE TEMP TABLE d3_pipeline_return AS SELECT * FROM public.admin_update_firesale_pipeline_deal_for_user(
 'd3170001-0000-4000-8000-000000000003','d3170002-0000-4000-8000-000000000001',
 'offer_sent',NULL,300000,NULL,NULL);
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM d3_pipeline_return),1,'pipeline returns one row');
SELECT is((SELECT to_jsonb(p) FROM d3_pipeline_return p),
 jsonb_build_object('deal_id','d3170002-0000-4000-8000-000000000001','status','offer_sent','notified',2),
 'pipeline returns exact deal ID, status and inserted notification count');
SELECT is((SELECT count(*)::integer FROM public.notifications n
 WHERE NOT ((SELECT state->'notifications' FROM d3_pipeline_before) ? n.id::text)),2,
 'offer_sent inserts exactly one seller and one investor notice');
SELECT is((SELECT jsonb_agg(to_jsonb(n)-'id' ORDER BY n.title) FROM public.notifications n
 WHERE NOT ((SELECT state->'notifications' FROM d3_pipeline_before) ? n.id::text)),
 jsonb_build_array(
  jsonb_build_object('user_id','d3170001-0000-4000-8000-000000000001',
   'title','Quick Sale offer sent',
   'body','An offer has been prepared for your Quick Sale request at D3 local property, Athens.',
   'type','quick_sale','read',false,'link','/dashboard','created_at',now()),
  jsonb_build_object('user_id','d3170001-0000-4000-8000-000000000002',
   'title','Quick Sale offer update',
   'body','An offer has been sent for D3 local property, Athens. We will update your queue status as the seller responds.',
   'type','investor_alert','read',false,'link','/investor-dashboard','created_at',now())),
 'pipeline adds exact seller and investor notices');
WITH pre AS (SELECT state FROM d3_pipeline_before),
 req AS (SELECT (state->'requests'->'d3170002-0000-4000-8000-000000000001') ||
  jsonb_build_object('status','offer_sent','offer_price',300000,'updated_at',now()) AS row FROM pre),
 expected AS (SELECT pg_temp.d3_put(
  pg_temp.d3_put(
   jsonb_set(pre.state,'{notifications}',
    (pre.state->'notifications') || pg_temp.d3_delta(pg_temp.d3_state(),pre.state,'notifications')),
   'requests','d3170002-0000-4000-8000-000000000001',req.row),
  'feed','d3170002-0000-4000-8000-000000000001',
   (pre.state->'feed'->'d3170002-0000-4000-8000-000000000001') ||
    jsonb_build_object('status','offer_sent')) AS state FROM pre,req)
SELECT is(pg_temp.d3_state(),(SELECT state FROM expected),
 'pipeline exact full-state delta preserves estimate, asking, all interest/audit and earlier notices');
CREATE TEMP TABLE d3_pipeline_repeat_before AS SELECT pg_temp.d3_state() AS state;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
CREATE TEMP TABLE d3_pipeline_repeat_return AS SELECT * FROM public.admin_update_firesale_pipeline_deal_for_user(
 'd3170001-0000-4000-8000-000000000003','d3170002-0000-4000-8000-000000000001',
 'offer_sent',NULL,NULL,NULL,NULL);
RESET ROLE;
SELECT is((SELECT to_jsonb(p) FROM d3_pipeline_repeat_return p),
 jsonb_build_object('deal_id','d3170002-0000-4000-8000-000000000001','status','offer_sent','notified',0),
 'repeat pipeline returns zero new notices');
SELECT is(pg_temp.d3_state(),(SELECT state FROM d3_pipeline_repeat_before),
 'repeat pipeline preserves all prior rows and notification IDs');

CREATE TEMP TABLE d3_unpub_before AS SELECT pg_temp.d3_state() AS state;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
CREATE TEMP TABLE d3_unpub_return AS SELECT * FROM public.admin_set_firesale_investor_publication_for_user(
 'd3170001-0000-4000-8000-000000000003','d3170002-0000-4000-8000-000000000001',false);
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM d3_unpub_return),1,'unpublication returns one row');
SELECT is((SELECT to_jsonb(p) FROM d3_unpub_return p),
 jsonb_build_object('deal_id','d3170002-0000-4000-8000-000000000001','status','offer_sent','published_to_investors',false),
 'unpublication returns exact ID and retains offer_sent status');
WITH pre AS (SELECT state FROM d3_unpub_before),
 expected AS (SELECT pg_temp.d3_remove(
  pg_temp.d3_put(pre.state,'requests','d3170002-0000-4000-8000-000000000001',
   (pre.state->'requests'->'d3170002-0000-4000-8000-000000000001') ||
    jsonb_build_object('published_to_investors',false,'updated_at',now())),
  'feed','d3170002-0000-4000-8000-000000000001') AS state FROM pre)
SELECT is(pg_temp.d3_state(),(SELECT state FROM expected),
 'unpublication removes feed only and preserves prior notices, audit and interest');

CREATE TEMP TABLE d3_denial_before AS SELECT pg_temp.d3_state() AS state;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.submit_firesale_interest_for_user(
 'd3170001-0000-4000-8000-000000000002','d3170002-0000-4000-8000-000000000001','unpublished',NULL,NULL)$q$,
 'P0001','firesale_deal_not_available','unpublished deal rejects otherwise paid investor');
RESET ROLE;
SELECT is(pg_temp.d3_state(),(SELECT state FROM d3_denial_before),
 'unpublished denial preserves full rows, audit and all notices');
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.submit_firesale_interest_for_user(
 'd3170001-0000-4000-8000-000000000004','d3170002-0000-4000-8000-000000000001','unpaid',NULL,NULL)$q$,
 'P0001','investor_access_required','unpaid buyer is denied before deal availability');
RESET ROLE;
SELECT is(pg_temp.d3_state(),(SELECT state FROM d3_denial_before),
 'unpaid denial preserves complete prestate');
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.admin_update_firesale_interest_workflow_for_user(
 'd3170001-0000-4000-8000-000000000004',
 (SELECT id FROM d3_interest_return),'passed',NULL,false,NULL,NULL)$q$,
 'P0001','admin_only','nonadmin cannot change interest workflow');
RESET ROLE;
SELECT is(pg_temp.d3_state(),(SELECT state FROM d3_denial_before),
 'nonadmin workflow denial retains all state');
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT * FROM public.admin_update_firesale_pipeline_deal_for_user(
 'd3170001-0000-4000-8000-000000000004','d3170002-0000-4000-8000-000000000001',
 'closed',NULL,NULL,NULL,NULL)$q$,
 'P0001','forbidden','nonadmin cannot change pipeline');
RESET ROLE;
SELECT is(pg_temp.d3_state(),(SELECT state FROM d3_denial_before),
 'nonadmin pipeline denial retains all state');
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT * FROM public.admin_set_firesale_investor_publication_for_user(
 'd3170001-0000-4000-8000-000000000004','d3170002-0000-4000-8000-000000000001',true)$q$,
 'P0001','forbidden','nonadmin cannot republish');
RESET ROLE;
SELECT is(pg_temp.d3_state(),(SELECT state FROM d3_denial_before),
 'nonadmin publication denial retains all state');
SELECT is(current_setting('session_replication_role'),'origin','normal triggers remain active through every case');
SELECT * FROM finish();
ROLLBACK;
