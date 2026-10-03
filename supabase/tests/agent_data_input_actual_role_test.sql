\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database()
    OR current_database() IN ('postgres','template0','template1','maiprop_t12q_20260930_source')
    OR (current_database() !~ '^maiprop_t13d3_[0-9]{8}_agent[0-9]{2}$'
        AND current_database() !~ '^maiprop_d0_[a-z0-9_]{6,48}$')
    OR current_user IS DISTINCT FROM 'postgres' OR inet_server_addr() IS NOT NULL
    OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) IS DISTINCT FROM 'postgres'
    OR current_setting('session_replication_role') IS DISTINCT FROM 'origin'
 THEN RAISE EXCEPTION 'Matching postgres-owned disposable socket database with normal triggers required'; END IF;
END $$;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
SET LOCAL search_path=public,extensions;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(135);
SELECT pg_backend_pid() AS fixture_backend_pid,current_database() AS fixture_database,
 current_role AS fixture_role,current_setting('session_replication_role') AS fixture_trigger_mode,
 current_setting('maiprop.test_disposable_database',true) AS fixture_gate;
SELECT is(current_setting('session_replication_role'),'origin','normal triggers active');
SELECT is((SELECT count(*)::integer FROM pg_trigger WHERE tgrelid='public.agent_data_inputs'::regclass
 AND NOT tgisinternal AND tgenabled='O'),4,'all four normal agent input triggers enabled');
SELECT ok(has_function_privilege('service_role','public.submit_agent_data_input(date,text,text,text,numeric,text,text,text,text,text,text,text)','EXECUTE')
 AND has_function_privilege('service_role','public.admin_review_agent_data_input(uuid,text,text,boolean,uuid)','EXECUTE')
 AND has_function_privilege('service_role','public.admin_review_agent_data_input(uuid,text,text)','EXECUTE')
 AND has_function_privilege('service_role','public.agent_data_input_quota(uuid)','EXECUTE')
 AND has_function_privilege('service_role','public.get_agent_data_input_status(uuid)','EXECUTE'),
 'actual service role has every agent RPC grant');
SELECT ok(NOT has_function_privilege('authenticated','public.submit_agent_data_input(date,text,text,text,numeric,text,text,text,text,text,text,text)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.admin_review_agent_data_input(uuid,text,text,boolean,uuid)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.admin_review_agent_data_input(uuid,text,text)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.agent_data_input_quota(uuid)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.get_agent_data_input_status(uuid)','EXECUTE')
 AND NOT has_function_privilege('anon','public.submit_agent_data_input(date,text,text,text,numeric,text,text,text,text,text,text,text)','EXECUTE'),
 'browser RPC execution is denied by effective grants');
SELECT ok((SELECT bool_and(encode(digest(pg_get_functiondef(to_regprocedure(sig)),'sha256'),'hex')=sha)
 FROM (VALUES
 ('public.submit_agent_data_input(date,text,text,text,numeric,text,text,text,text,text,text,text)','38ba38cc1d531600b0218548cd33a644fac7333a0b4d9757c20e6aee501aa3c2'),
 ('public.agent_data_inputs_check_insert()','2ca81595e46111235ae55239432e3ca3f2d8de59aab82886e8e50cbd689d24fd'),
 ('public.admin_review_agent_data_input(uuid,text,text,boolean,uuid)','185b32da8b6286455d087cb786f2d1d6398beef92fc0d073fcde6133804aaa5a'),
 ('public.agent_data_inputs_guard_admin_columns()','b89ca674e81dfa4b7bfe03d44b04e1ed6fe3cdc4d83178ac38be3daf6d32a1c7'),
 ('public.admin_review_agent_data_input(uuid,text,text)','3ecefab4d532e947cd1275547a76352eb033a5a9088a5c508e533edbdb84c817'),
 ('public.agent_data_input_quota(uuid)','1b4d68922405dcdc751d1945827161af3c5d9c61c3db1217c302fc0f00b4397a'),
 ('public.agent_data_inputs_validate_closing_date()','b771d55107388693c89914b811339fd0eb098879085403873c584033f47b663d'),
 ('public.get_agent_data_input_status(uuid)','3d8bc176e23f1af6b4844f18c373555a9a2fcedadbc54502c8c35a26dba92a5c'),
 ('public.tg_agent_data_inputs_updated_at()','b61a5dc7a758638354a61ff403dc0de176606640c7eb12ca01a9cdac58eea7ea'),
 ('public.has_platform_admin(uuid)','31374ac294981f0d938178be1c91778ae53603f94b32c170304fd62b0cecfb12'),
 ('private.has_platform_admin(uuid)','ca2dbbea33761a2bed3ace2a1c20bed17767c220dd4213caa47fe93e4e26c5ce')
 ) expected(sig,sha)),
 'nine agent routine definitions and both accepted admin helpers match bound SHA-256');

-- Auth/profile setup follows the normal owner trigger. Only named users are synthetic.
INSERT INTO auth.users(id,email) VALUES
 ('d3220001-0000-4000-8000-000000000001','kr@maiprop.co'),
 ('d3220001-0000-4000-8000-000000000002','d3-agent-direct@example.test'),
 ('d3220001-0000-4000-8000-000000000003','d3-agent-cap@example.test'),
 ('d3220001-0000-4000-8000-000000000004','d3-agent-rpc@example.test'),
 ('d3220001-0000-4000-8000-000000000005','d3-agent-review@example.test'),
 ('d3220001-0000-4000-8000-000000000006','d3-agent-banned@example.test'),
 ('d3220001-0000-4000-8000-000000000007','d3-buyer@example.test'),
 ('d3220001-0000-4000-8000-000000000008','d3-unonboarded@example.test'),
 ('d3220001-0000-4000-8000-000000000009','d3-outsider@example.test');
SELECT set_config('maiprop.owner_auth_trigger_active','false',true);
SELECT is((SELECT role::text FROM public.profiles WHERE user_id='d3220001-0000-4000-8000-000000000001'),
 'admin','normal owner auth trigger yields authoritative admin');
SELECT ok((SELECT role IS NULL FROM public.profiles WHERE user_id='d3220001-0000-4000-8000-000000000008'),
 'normal pre-onboarding fixture has NULL role');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT public.complete_onboarding_role_for_user(id,'agent','agent') FROM (VALUES
 ('d3220001-0000-4000-8000-000000000002'::uuid),
 ('d3220001-0000-4000-8000-000000000003'::uuid),
 ('d3220001-0000-4000-8000-000000000004'::uuid),
 ('d3220001-0000-4000-8000-000000000005'::uuid),
 ('d3220001-0000-4000-8000-000000000006'::uuid)) u(id);
SELECT public.complete_onboarding_role_for_user('d3220001-0000-4000-8000-000000000007','buyer','buyer');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE user_id::text LIKE 'd3220001-%' AND role='agent'),
 5,'five authoritative agent profiles are normal-onboarded');

CREATE FUNCTION pg_temp.d3_state() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
  'auth',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(u)),'{}'::jsonb) FROM auth.users u WHERE id::text LIKE 'd3220001-%'),
  'profiles',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(p)),'{}'::jsonb) FROM public.profiles p WHERE user_id::text LIKE 'd3220001-%'),
  'profiles_public',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(p)),'{}'::jsonb) FROM public.profiles_public p WHERE user_id::text LIKE 'd3220001-%'),
  'inputs',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(i)),'{}'::jsonb) FROM public.agent_data_inputs i WHERE user_id::text LIKE 'd3220001-%'),
  'bans',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(b)),'{}'::jsonb) FROM public.agent_data_input_bans b WHERE user_id::text LIKE 'd3220001-%'),
  'notifications',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(n)),'{}'::jsonb) FROM public.notifications n)
 )
$$;
CREATE FUNCTION pg_temp.d3_expected_input(p_id uuid,p_user uuid,p_address text,p_city text,p_postal text,
 p_kaek text,p_type text,p_transaction text,p_side text,p_price numeric,p_closing date,
 p_buyer text,p_seller text,p_notes text,p_created timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('id',p_id,'user_id',p_user,'property_address',p_address,'city',p_city,
 'postal_code',p_postal,'kaek',p_kaek,'property_type',p_type,'transaction_type',p_transaction,
 'agent_side',p_side,'sale_price',p_price,'closing_date',p_closing,'buyer_name',p_buyer,
 'seller_name',p_seller,'notes',p_notes,'status','pending','rejection_reason',NULL,
 'reviewed_at',NULL,'reviewed_by',NULL,'discount_applied',false,'discount_applied_at',NULL,
 'discount_invoice_id',NULL,'discount_pct',0.5,'created_at',p_created,'updated_at',now(),
 'applied_to_invoice_at',NULL,'stripe_credit_id',NULL,'stripe_credit_amount_cents',NULL,
 'stripe_credit_currency',NULL,'stripe_credit_expected_amount_cents',NULL,'stripe_credit_operation_key',NULL)
$$;
CREATE FUNCTION pg_temp.d3_added(s jsonb,id uuid,r jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_set(s,'{inputs}',s->'inputs'||jsonb_build_object(id::text,r),false)
$$;
CREATE FUNCTION pg_temp.d3_changed(s jsonb,id uuid,delta jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_set(s,ARRAY['inputs',id::text],s->'inputs'->id::text||delta,false)
$$;
CREATE FUNCTION pg_temp.d3_review_delta(status text,reason text,reviewer uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('status',status,'rejection_reason',reason,'reviewed_at',now(),
 'reviewed_by',reviewer,'updated_at',now())
$$;
CREATE FUNCTION pg_temp.d3_added_ban(s jsonb,subject uuid,reviewer uuid,reason text)
RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_set(s,'{bans}',s->'bans'||jsonb_build_object(subject::text,
 jsonb_build_object('user_id',subject,'banned_at',now(),'banned_by',reviewer,'reason',reason)),false)
$$;
CREATE FUNCTION pg_temp.d3_reader_seed_expected(s jsonb) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT pg_temp.d3_added(pg_temp.d3_added(pg_temp.d3_added(pg_temp.d3_added(s,
 'd3220002-0000-4000-8000-000000000101',
 pg_temp.d3_expected_input('d3220002-0000-4000-8000-000000000101',
 'd3220001-0000-4000-8000-000000000002','D3 Reader Pending 101',NULL,NULL,NULL,
 'house','sale','seller',100000,CURRENT_DATE,NULL,NULL,NULL)),
 'd3220002-0000-4000-8000-000000000102',
 pg_temp.d3_expected_input('d3220002-0000-4000-8000-000000000102',
 'd3220001-0000-4000-8000-000000000002','D3 Reader Pending 102',NULL,NULL,NULL,
 'house','sale','seller',100000,CURRENT_DATE,NULL,NULL,NULL,
 (date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')-INTERVAL '1 day')),
 'd3220002-0000-4000-8000-000000000103',
 pg_temp.d3_expected_input('d3220002-0000-4000-8000-000000000103',
 'd3220001-0000-4000-8000-000000000002','D3 Reader Pending 103',NULL,NULL,NULL,
 'house','sale','seller',100000,CURRENT_DATE,NULL,NULL,NULL)),
 'd3220002-0000-4000-8000-000000000104',
 pg_temp.d3_expected_input('d3220002-0000-4000-8000-000000000104',
 'd3220001-0000-4000-8000-000000000002','D3 Reader Pending 104',NULL,NULL,NULL,
 'house','sale','seller',100000,CURRENT_DATE,NULL,NULL,NULL))
$$;
CREATE TEMP TABLE d3_before(state jsonb);
CREATE TEMP TABLE d3_outcome(label text PRIMARY KEY,sqlstate text,message text,actor_role text,subject uuid);
CREATE TEMP TABLE d3_return(label text,id uuid,row jsonb);
GRANT INSERT ON d3_outcome,d3_return TO service_role,authenticated,anon;
CREATE FUNCTION pg_temp.d3_attempt(label text,command text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_state text; v_message text;
BEGIN
 BEGIN EXECUTE command; INSERT INTO d3_outcome VALUES(label,NULL,NULL,current_role,auth.uid());
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state=RETURNED_SQLSTATE,v_message=MESSAGE_TEXT;
  INSERT INTO d3_outcome VALUES(label,v_state,v_message,current_role,auth.uid());
 END;
END $$;

-- A1: active Edge-equivalent service/no-sub direct INSERT RETURNING.
INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('direct', $q$WITH i AS (
 INSERT INTO public.agent_data_inputs(user_id,property_address,city,postal_code,kaek,property_type,
 transaction_type,agent_side,sale_price,closing_date,buyer_name,seller_name,notes)
 VALUES('d3220001-0000-4000-8000-000000000002','D3 Direct Athens 12','Athens','11742','K-12',
 'apartment','sale','seller',250000,CURRENT_DATE,'Buyer D3','Seller D3','direct submit') RETURNING *)
 INSERT INTO d3_return SELECT 'direct',i.id,to_jsonb(i) FROM i$q$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='direct'),NULL::text,'active direct service INSERT RETURNING succeeds');
SELECT is((SELECT count(*)::integer FROM d3_return WHERE label='direct'),1,'direct INSERT returned one row');
SELECT is((SELECT row FROM d3_return WHERE label='direct'),
 pg_temp.d3_expected_input((SELECT id FROM d3_return WHERE label='direct'),
 'd3220001-0000-4000-8000-000000000002','D3 Direct Athens 12','Athens','11742','K-12',
 'apartment','sale','seller',250000,CURRENT_DATE,'Buyer D3','Seller D3','direct submit'),
 'direct INSERT returns independently expected complete business record');
SELECT ok((SELECT status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL
 AND discount_pct=0.5 AND discount_applied=false AND discount_applied_at IS NULL AND discount_invoice_id IS NULL
 AND user_id='d3220001-0000-4000-8000-000000000002' AND property_address='D3 Direct Athens 12'
 AND city='Athens' AND postal_code='11742' AND kaek='K-12' AND property_type='apartment'
 AND transaction_type='sale' AND agent_side='seller' AND sale_price=250000 AND closing_date=CURRENT_DATE
 AND buyer_name='Buyer D3' AND seller_name='Seller D3' AND notes='direct submit'
 FROM public.agent_data_inputs WHERE id=(SELECT id FROM d3_return WHERE label='direct')),
 'direct input persists exact business fields and pending unreviewed 0.5 percent state');
SELECT is((SELECT to_jsonb(i)-ARRAY['id','created_at','updated_at'] FROM public.agent_data_inputs i
 WHERE id=(SELECT id FROM d3_return WHERE label='direct')),
 jsonb_build_object('user_id','d3220001-0000-4000-8000-000000000002','property_address','D3 Direct Athens 12',
 'city','Athens','postal_code','11742','kaek','K-12','property_type','apartment','transaction_type','sale',
 'agent_side','seller','sale_price',250000,'closing_date',CURRENT_DATE,'buyer_name','Buyer D3',
 'seller_name','Seller D3','notes','direct submit','status','pending','rejection_reason',NULL,
 'reviewed_at',NULL,'reviewed_by',NULL,'discount_applied',false,'discount_applied_at',NULL,
 'discount_invoice_id',NULL,'discount_pct',0.5,'applied_to_invoice_at',NULL,'stripe_credit_id',NULL,
 'stripe_credit_amount_cents',NULL,'stripe_credit_currency',NULL,'stripe_credit_expected_amount_cents',NULL,
 'stripe_credit_operation_key',NULL),
 'direct inserted row has exact full non-generated persisted state');
SELECT is(pg_temp.d3_state(),
 (SELECT pg_temp.d3_added(state,(SELECT id FROM d3_return WHERE label='direct'),
 pg_temp.d3_expected_input((SELECT id FROM d3_return WHERE label='direct'),
 'd3220001-0000-4000-8000-000000000002','D3 Direct Athens 12','Athens','11742','K-12',
 'apartment','sale','seller',250000,CURRENT_DATE,'Buyer D3','Seller D3','direct submit')) FROM d3_before),
 'direct insert independently yields exact full fixture graph');
SELECT is((SELECT count(*)::integer FROM public.agent_data_inputs WHERE user_id::text LIKE 'd3220001-%'),1,
 'direct insert is the only fixture input');

-- A1: wrong role and natural NULL role fail in the insert trigger; date boundary is separate.
TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('buyer_direct',$q$INSERT INTO public.agent_data_inputs(user_id,property_address,property_type,transaction_type,agent_side,sale_price,closing_date)
 VALUES('d3220001-0000-4000-8000-000000000007','D3 Buyer Athens 12','house','sale','buyer',100000,CURRENT_DATE)$q$);
SELECT pg_temp.d3_attempt('null_direct',$q$INSERT INTO public.agent_data_inputs(user_id,property_address,property_type,transaction_type,agent_side,sale_price,closing_date)
 VALUES('d3220001-0000-4000-8000-000000000008','D3 Null Athens 12','house','sale','buyer',100000,CURRENT_DATE)$q$);
SELECT pg_temp.d3_attempt('future',$q$INSERT INTO public.agent_data_inputs(user_id,property_address,property_type,transaction_type,agent_side,sale_price,closing_date)
 VALUES('d3220001-0000-4000-8000-000000000002','D3 Future Athens 12','house','sale','buyer',100000,CURRENT_DATE+1)$q$);
SELECT pg_temp.d3_attempt('old',$q$INSERT INTO public.agent_data_inputs(user_id,property_address,property_type,transaction_type,agent_side,sale_price,closing_date)
 VALUES('d3220001-0000-4000-8000-000000000002','D3 Old Athens 12','house','sale','buyer',100000,CURRENT_DATE-INTERVAL '5 years 1 day')$q$);
RESET ROLE;
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='buyer_direct'),
 'P0001:agent_role_required','buyer first denial is insert role trigger');
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='null_direct'),
 'P0001:agent_role_required','natural NULL role first denial is insert role trigger');
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='future'),
 '23514:closing_date cannot be in the future','future first denial is date trigger');
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='old'),
 '23514:closing_date cannot be more than 5 years in the past','old first denial is date trigger');
SELECT is(pg_temp.d3_state(),(SELECT state FROM d3_before),
 'all role/date denials preserve complete fixture graph');

-- Browser direct INSERT is a separate actual-role boundary, not a trigger hit.
TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SELECT set_config('request.jwt.claim.sub','d3220001-0000-4000-8000-000000000002',true),
 set_config('request.jwt.claims','{"role":"authenticated","sub":"d3220001-0000-4000-8000-000000000002"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.d3_attempt('browser_direct',$q$INSERT INTO public.agent_data_inputs(user_id,property_address,property_type,transaction_type,agent_side,sale_price,closing_date)
 VALUES('d3220001-0000-4000-8000-000000000002','D3 Browser Athens 12','house','sale','seller',100000,CURRENT_DATE)$q$);
SELECT pg_temp.d3_attempt('browser_rpc',$q$SELECT public.submit_agent_data_input(CURRENT_DATE,'D3 Browser Athens 12','Athens','sale',100000,
 NULL,'house',NULL,NULL,NULL,NULL,'seller')$q$);
SELECT pg_temp.d3_attempt('browser_status',$q$SELECT * FROM public.get_agent_data_input_status('d3220001-0000-4000-8000-000000000002')$q$);
RESET ROLE;
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='browser_direct'),
 '42501:new row violates row-level security policy for table "agent_data_inputs"',
 'authenticated direct INSERT first denied at false RLS policy');
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='browser_rpc'),
 '42501:permission denied for function submit_agent_data_input',
 'authenticated retained RPC first denied at EXECUTE grant');
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='browser_status'),
 '42501:permission denied for function get_agent_data_input_status',
 'authenticated status RPC first denied at EXECUTE grant');
SELECT is(pg_temp.d3_state(),(SELECT state FROM d3_before),
 'browser denials preserve complete fixture graph');
TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"anon"}',true);
SET LOCAL ROLE anon;
SELECT pg_temp.d3_attempt('anon_direct',$q$INSERT INTO public.agent_data_inputs(user_id,property_address,property_type,transaction_type,agent_side,sale_price,closing_date)
 VALUES('d3220001-0000-4000-8000-000000000002','D3 Anon Athens 12','house','sale','seller',100000,CURRENT_DATE)$q$);
SELECT pg_temp.d3_attempt('anon_rpc',$q$SELECT public.submit_agent_data_input(CURRENT_DATE,'D3 Anon Athens 12','Athens','sale',100000,
 NULL,'house',NULL,NULL,NULL,NULL,'seller')$q$);
RESET ROLE;
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='anon_direct'),
 'P0001:agent_role_required',
 'anonymous direct INSERT first denied at normal role trigger');
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='anon_rpc'),
 '42501:permission denied for function submit_agent_data_input',
 'anonymous retained RPC first denied at EXECUTE grant');
SELECT is(pg_temp.d3_state(),(SELECT state FROM d3_before),
 'anonymous denials preserve complete fixture graph');

-- Service/no-sub banned agent is rejected through normal insert trigger.
INSERT INTO public.agent_data_input_bans(user_id,banned_by,reason) VALUES
 ('d3220001-0000-4000-8000-000000000006','d3220001-0000-4000-8000-000000000001','fixture ban');
TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('banned_direct',$q$INSERT INTO public.agent_data_inputs(user_id,property_address,property_type,transaction_type,agent_side,sale_price,closing_date)
 VALUES('d3220001-0000-4000-8000-000000000006','D3 Banned Athens 12','house','sale','seller',100000,CURRENT_DATE)$q$);
RESET ROLE;
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='banned_direct'),
 'P0001:agent_data_input_lifetime_banned','banned agent first denied at insert trigger');
SELECT is(pg_temp.d3_state(),(SELECT state FROM d3_before),
 'banned agent denial preserves complete fixture graph');

-- A1 service-boundary forced admin columns, never presented as browser authority.
TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('forced',$q$WITH i AS (INSERT INTO public.agent_data_inputs(user_id,property_address,property_type,
 transaction_type,agent_side,sale_price,closing_date,status,rejection_reason,reviewed_by,reviewed_at,
 discount_pct,discount_applied,discount_applied_at,discount_invoice_id)
 VALUES('d3220001-0000-4000-8000-000000000002','D3 Forced Athens 12','house','rental','buyer',100000,CURRENT_DATE,
 'verified','bad','d3220001-0000-4000-8000-000000000001',now(),9,true,now(),'fake-invoice') RETURNING *)
 INSERT INTO d3_return SELECT 'forced',i.id,to_jsonb(i) FROM i$q$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='forced'),NULL::text,'service forced-column insert reaches trigger');
SELECT ok((SELECT status='pending' AND rejection_reason IS NULL AND reviewed_by IS NULL AND reviewed_at IS NULL
 AND discount_pct=0.5 AND discount_applied=false AND discount_applied_at IS NULL AND discount_invoice_id IS NULL
 FROM public.agent_data_inputs WHERE id=(SELECT id FROM d3_return WHERE label='forced')),
 'normal insert trigger resets every named moderation and discount column');
SELECT is((SELECT row FROM d3_return WHERE label='forced'),
 pg_temp.d3_expected_input((SELECT id FROM d3_return WHERE label='forced'),
 'd3220001-0000-4000-8000-000000000002','D3 Forced Athens 12',NULL,NULL,NULL,
 'house','rental','buyer',100000,CURRENT_DATE,NULL,NULL,NULL),
 'forced service INSERT returns independently expected complete record');
SELECT is(pg_temp.d3_state(),
 (SELECT pg_temp.d3_added(state,(SELECT id FROM d3_return WHERE label='forced'),
 pg_temp.d3_expected_input((SELECT id FROM d3_return WHERE label='forced'),
 'd3220001-0000-4000-8000-000000000002','D3 Forced Athens 12',NULL,NULL,NULL,
 'house','rental','buyer',100000,CURRENT_DATE,NULL,NULL,NULL)) FROM d3_before),
 'forced-column service insert independently yields exact full fixture graph');

-- A1 UTC cap: the 20th succeeds, 21st denies. This is sequential, not A5 race proof.
SET LOCAL ROLE service_role;
INSERT INTO public.agent_data_inputs(user_id,property_address,property_type,transaction_type,agent_side,sale_price,closing_date,created_at)
 VALUES('d3220001-0000-4000-8000-000000000003','D3 Prior Month Athens','house','sale','seller',100000,CURRENT_DATE,
 (date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')-INTERVAL '1 day');
INSERT INTO public.agent_data_inputs(user_id,property_address,property_type,transaction_type,agent_side,sale_price,closing_date)
 SELECT 'd3220001-0000-4000-8000-000000000003','D3 Cap Athens '||n,'house','sale','seller',100000,CURRENT_DATE
 FROM generate_series(1,19) n;
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.agent_data_inputs WHERE user_id='d3220001-0000-4000-8000-000000000003'
 AND created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),19,
 'nineteen current-month cap rows inserted through normal trigger');
SELECT is((SELECT count(*)::integer FROM public.agent_data_inputs WHERE user_id='d3220001-0000-4000-8000-000000000003'
 AND created_at<date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),1,
 'one historical row is outside UTC-month count');
TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('twentieth',$q$INSERT INTO public.agent_data_inputs(user_id,property_address,property_type,transaction_type,agent_side,sale_price,closing_date)
 VALUES('d3220001-0000-4000-8000-000000000003','D3 Cap Athens 20','house','sale','seller',100000,CURRENT_DATE)$q$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='twentieth'),NULL::text,'twentieth sequential input succeeds');
SELECT is((SELECT count(*)::integer FROM public.agent_data_inputs WHERE user_id='d3220001-0000-4000-8000-000000000003'
 AND created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),20,
 'twentieth current-month row persisted');
SELECT is(pg_temp.d3_state(),
 (SELECT pg_temp.d3_added(state,
  (SELECT id FROM public.agent_data_inputs WHERE user_id='d3220001-0000-4000-8000-000000000003'
   AND property_address='D3 Cap Athens 20'),
  pg_temp.d3_expected_input(
   (SELECT id FROM public.agent_data_inputs WHERE user_id='d3220001-0000-4000-8000-000000000003'
    AND property_address='D3 Cap Athens 20'),
   'd3220001-0000-4000-8000-000000000003','D3 Cap Athens 20',NULL,NULL,NULL,
   'house','sale','seller',100000,CURRENT_DATE,NULL,NULL,NULL)) FROM d3_before),
 'twentieth admission changes only its independently specified input');
TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('twentyfirst',$q$INSERT INTO public.agent_data_inputs(user_id,property_address,property_type,transaction_type,agent_side,sale_price,closing_date)
 VALUES('d3220001-0000-4000-8000-000000000003','D3 Cap Athens 21','house','sale','seller',100000,CURRENT_DATE)$q$);
RESET ROLE;
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='twentyfirst'),
 'P0001:agent_data_input_monthly_limit_reached','21st sequential input denied by cap trigger');
SELECT is(pg_temp.d3_state(),(SELECT state FROM d3_before),
 'cap denial preserves complete fixture graph');

-- A2 retained twelve-argument RPC: subject-bearing service path, separate from Edge.
TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SELECT set_config('request.jwt.claim.sub','d3220001-0000-4000-8000-000000000004',true),
 set_config('request.jwt.claims','{"role":"service_role","sub":"d3220001-0000-4000-8000-000000000004"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('legacy',$q$INSERT INTO d3_return(label,id)
 SELECT 'legacy',public.submit_agent_data_input(CURRENT_DATE,'D3 Legacy Athens 12','Athens','rent',120000,
 '11742','apartment','K-RPC','Buyer RPC','Seller RPC','legacy submit','buyer')$q$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='legacy'),NULL::text,'retained subject RPC succeeds');
SELECT ok((SELECT user_id='d3220001-0000-4000-8000-000000000004' AND city='Athens' AND transaction_type='rental'
 AND agent_side='buyer' AND sale_price=120000 AND discount_pct=0.5 AND status='pending'
 FROM public.agent_data_inputs WHERE id=(SELECT id FROM d3_return WHERE label='legacy')),
 'retained RPC normalizes rent and preserves subject-owned row');
SELECT is(pg_temp.d3_state(),
 (SELECT pg_temp.d3_added(state,(SELECT id FROM d3_return WHERE label='legacy'),
 pg_temp.d3_expected_input((SELECT id FROM d3_return WHERE label='legacy'),
 'd3220001-0000-4000-8000-000000000004','D3 Legacy Athens 12','Athens','11742','K-RPC',
 'apartment','rental','buyer',120000,CURRENT_DATE,'Buyer RPC','Seller RPC','legacy submit')) FROM d3_before),
 'retained RPC returned ID identifies exact independently expected full graph');
TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SELECT set_config('request.jwt.claim.sub','d3220001-0000-4000-8000-000000000004',true),
 set_config('request.jwt.claims','{"role":"service_role","sub":"d3220001-0000-4000-8000-000000000004"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('legacy_both',$q$INSERT INTO d3_return(label,id)
 SELECT 'legacy_both',public.submit_agent_data_input(CURRENT_DATE,'D3 Both Athens 12','Athens','sale',130000,
 NULL,'house',NULL,NULL,NULL,'both-side submit','both')$q$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='legacy_both'),NULL::text,
 'retained RPC accepts agent-side both under legitimate subject');
SELECT is((SELECT count(*)::integer FROM d3_return WHERE label='legacy_both' AND id IS NOT NULL),1,
 'retained both-side RPC returns one persisted ID');
SELECT is(pg_temp.d3_state(),
 (SELECT pg_temp.d3_added(state,(SELECT id FROM d3_return WHERE label='legacy_both'),
 pg_temp.d3_expected_input((SELECT id FROM d3_return WHERE label='legacy_both'),
 'd3220001-0000-4000-8000-000000000004','D3 Both Athens 12','Athens',NULL,NULL,
 'house','sale','both',130000,CURRENT_DATE,NULL,NULL,'both-side submit')) FROM d3_before),
 'retained both-side RPC yields exact independently expected full graph');
TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('legacy_no_subject',$q$SELECT public.submit_agent_data_input(CURRENT_DATE,'D3 Legacy Athens 12','Athens','sale',120000,
 NULL,'apartment',NULL,NULL,NULL,NULL,'both')$q$);
RESET ROLE;
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='legacy_no_subject'),
 '42501:Not authenticated','legacy RPC requires subject even as service');
SELECT is(pg_temp.d3_state(),(SELECT state FROM d3_before),
 'legacy no-subject denial preserves full graph');

-- The retained RPC checks a named nonagent and natural NULL-role user before its INSERT.
TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SELECT set_config('request.jwt.claim.sub','d3220001-0000-4000-8000-000000000007',true),
 set_config('request.jwt.claims','{"role":"service_role","sub":"d3220001-0000-4000-8000-000000000007"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('legacy_buyer',$q$SELECT public.submit_agent_data_input(CURRENT_DATE,'D3 Buyer Athens 12','Athens','sale',120000,
 NULL,'house',NULL,NULL,NULL,NULL,'seller')$q$);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','d3220001-0000-4000-8000-000000000008',true),
 set_config('request.jwt.claims','{"role":"service_role","sub":"d3220001-0000-4000-8000-000000000008"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('legacy_nullrole',$q$SELECT public.submit_agent_data_input(CURRENT_DATE,'D3 Null Athens 12','Athens','sale',120000,
 NULL,'house',NULL,NULL,NULL,NULL,'seller')$q$);
RESET ROLE;
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='legacy_buyer'),
 '42501:Only agents can submit data inputs','buyer first denied at retained RPC role check');
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='legacy_nullrole'),
 '42501:Only agents can submit data inputs','natural NULL role first denied at retained RPC role check');
SELECT is(pg_temp.d3_state(),(SELECT state FROM d3_before),
 'legacy nonagent denials preserve complete fixture graph');

-- These denials occur inside the retained subject RPC; zero passes its own check but fails the table CHECK.
TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SELECT set_config('request.jwt.claim.sub','d3220001-0000-4000-8000-000000000006',true),
 set_config('request.jwt.claims','{"role":"service_role","sub":"d3220001-0000-4000-8000-000000000006"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('legacy_banned',$q$SELECT public.submit_agent_data_input(CURRENT_DATE,'D3 Banned Athens 12','Athens','sale',120000,
 NULL,'house',NULL,NULL,NULL,NULL,'seller')$q$);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','d3220001-0000-4000-8000-000000000003',true),
 set_config('request.jwt.claims','{"role":"service_role","sub":"d3220001-0000-4000-8000-000000000003"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('legacy_cap',$q$SELECT public.submit_agent_data_input(CURRENT_DATE,'D3 Cap Athens RPC','Athens','sale',120000,
 NULL,'house',NULL,NULL,NULL,NULL,'seller')$q$);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','d3220001-0000-4000-8000-000000000004',true),
 set_config('request.jwt.claims','{"role":"service_role","sub":"d3220001-0000-4000-8000-000000000004"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('legacy_zero',$q$SELECT public.submit_agent_data_input(CURRENT_DATE,'D3 Zero Athens 12','Athens','sale',0,
 NULL,'house',NULL,NULL,NULL,NULL,'seller')$q$);
RESET ROLE;
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='legacy_banned'),
 '42501:Data input submissions are permanently disabled for this account',
 'retained RPC first rejects banned subject');
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='legacy_cap'),
 '23514:Monthly data input limit (20) reached',
 'retained RPC rejects current-month cap with its own count');
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='legacy_zero'),
 '23514:new row for relation "agent_data_inputs" violates check constraint "agent_data_inputs_sale_price_check"',
 'retained RPC zero price reaches and fails positive table CHECK');
SELECT is(pg_temp.d3_state(),(SELECT state FROM d3_before),
 'retained banned/cap/zero denials preserve exact full graph');

TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SELECT set_config('request.jwt.claim.sub','d3220001-0000-4000-8000-000000000004',true),
 set_config('request.jwt.claims','{"role":"service_role","sub":"d3220001-0000-4000-8000-000000000004"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('legacy_bad_type',$q$SELECT public.submit_agent_data_input(CURRENT_DATE,'D3 Legacy Athens 12','Athens','lease',120000,
 NULL,'house',NULL,NULL,NULL,NULL,'seller')$q$);
SELECT pg_temp.d3_attempt('legacy_bad_side',$q$SELECT public.submit_agent_data_input(CURRENT_DATE,'D3 Legacy Athens 12','Athens','sale',120000,
 NULL,'house',NULL,NULL,NULL,NULL,'neither')$q$);
RESET ROLE;
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='legacy_bad_type'),
 '22023:transaction_type must be sale or rent','retained RPC rejects invalid transaction vocabulary');
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='legacy_bad_side'),
 '22023:agent_side must be buyer, seller, or both','retained RPC rejects invalid side');
SELECT is(pg_temp.d3_state(),(SELECT state FROM d3_before),
 'legacy argument denials preserve full graph');

-- A3 normal five-argument review and three-argument compatibility review.
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
INSERT INTO public.agent_data_inputs(id,user_id,property_address,property_type,transaction_type,agent_side,sale_price,closing_date)
 VALUES('d3220002-0000-4000-8000-000000000001','d3220001-0000-4000-8000-000000000005',
 'D3 Review Athens 12','house','sale','seller',120000,CURRENT_DATE);
RESET ROLE;
TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('verify5',$q$INSERT INTO d3_return(label,id,row)
 SELECT 'verify5',r.id,to_jsonb(r) FROM public.admin_review_agent_data_input(
 'd3220002-0000-4000-8000-000000000001','verified',NULL,false,'d3220001-0000-4000-8000-000000000001') r$q$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='verify5'),NULL::text,'five-argument service/no-sub review succeeds');
SELECT is((SELECT row FROM d3_return WHERE label='verify5'),
 (SELECT state->'inputs'->'d3220002-0000-4000-8000-000000000001'||
 pg_temp.d3_review_delta('verified',NULL,'d3220001-0000-4000-8000-000000000001') FROM d3_before),
 'five-argument review returns independently expected full composite');
SELECT ok((SELECT status='verified' AND reviewed_by='d3220001-0000-4000-8000-000000000001'
 AND reviewed_at=now() AND updated_at=now() AND rejection_reason IS NULL AND discount_applied=false
 AND applied_to_invoice_at IS NULL AND stripe_credit_id IS NULL
 FROM public.agent_data_inputs WHERE id='d3220002-0000-4000-8000-000000000001'),
 'normal review sets exact review state without applying provider credit');
SELECT is(pg_temp.d3_state(),
 (SELECT jsonb_set(state,'{inputs,d3220002-0000-4000-8000-000000000001}',
 state->'inputs'->'d3220002-0000-4000-8000-000000000001'||
 jsonb_build_object('status','verified','reviewed_by','d3220001-0000-4000-8000-000000000001',
 'reviewed_at',now(),'updated_at',now()),false) FROM d3_before),
 'five-argument verify produces exact full fixture graph delta');
SELECT is(pg_temp.d3_state()-'inputs',(SELECT state-'inputs' FROM d3_before),
 'five-argument review preserves unrelated full graph');
TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('flag5',$q$INSERT INTO d3_return(label,id,row)
 SELECT 'flag5',r.id,to_jsonb(r) FROM public.admin_review_agent_data_input(
 'd3220002-0000-4000-8000-000000000001','flagged','false claim',true,
 'd3220001-0000-4000-8000-000000000001') r$q$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='flag5'),NULL::text,'flagged lifetime-ban review succeeds');
SELECT ok((SELECT status='flagged' AND rejection_reason='false claim' AND reviewed_by='d3220001-0000-4000-8000-000000000001'
 FROM public.agent_data_inputs WHERE id='d3220002-0000-4000-8000-000000000001')
 AND (SELECT count(*)=1 FROM public.agent_data_input_bans WHERE user_id='d3220001-0000-4000-8000-000000000005'
 AND banned_by='d3220001-0000-4000-8000-000000000001' AND reason='false claim'),
 'review persists flagged reason and exactly one ban');
SELECT is(pg_temp.d3_state(),
 (SELECT pg_temp.d3_added_ban(
  pg_temp.d3_changed(state,'d3220002-0000-4000-8000-000000000001',
   pg_temp.d3_review_delta('flagged','false claim','d3220001-0000-4000-8000-000000000001')),
  'd3220001-0000-4000-8000-000000000005','d3220001-0000-4000-8000-000000000001','false claim')
 FROM d3_before),
 'flagged review changes exactly one input and creates exact ban row');
SELECT is((SELECT row FROM d3_return WHERE label='flag5'),
 (SELECT state->'inputs'->'d3220002-0000-4000-8000-000000000001'||
  pg_temp.d3_review_delta('flagged','false claim','d3220001-0000-4000-8000-000000000001') FROM d3_before),
 'flagged review returns independently expected full composite');
TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('repeatban5',$q$INSERT INTO d3_return(label,id,row)
 SELECT 'repeatban5',r.id,to_jsonb(r) FROM public.admin_review_agent_data_input(
 'd3220002-0000-4000-8000-000000000001','rejected','new reason',true,
 'd3220001-0000-4000-8000-000000000001') r$q$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='repeatban5'),NULL::text,'repeat lifetime-ban review succeeds');
SELECT ok((SELECT count(*)=1 AND min(reason)='false claim' FROM public.agent_data_input_bans
 WHERE user_id='d3220001-0000-4000-8000-000000000005'),
 'repeat review does not rewrite existing ban');
SELECT is(pg_temp.d3_state(),
 (SELECT pg_temp.d3_changed(state,'d3220002-0000-4000-8000-000000000001',
  pg_temp.d3_review_delta('rejected','new reason','d3220001-0000-4000-8000-000000000001')) FROM d3_before),
 'repeat ban review changes exact input row and preserves prior ban/full graph');
SELECT is((SELECT row FROM d3_return WHERE label='repeatban5'),
 (SELECT state->'inputs'->'d3220002-0000-4000-8000-000000000001'||
  pg_temp.d3_review_delta('rejected','new reason','d3220001-0000-4000-8000-000000000001') FROM d3_before),
 'repeat ban review returns independently expected rejected composite');
TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('pending5',$q$INSERT INTO d3_return(label,id,row)
 SELECT 'pending5',r.id,to_jsonb(r) FROM public.admin_review_agent_data_input(
 'd3220002-0000-4000-8000-000000000001','pending','ignored',false,
 'd3220001-0000-4000-8000-000000000001') r$q$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='pending5'),NULL::text,
 'five-argument pending reset succeeds');
SELECT is(pg_temp.d3_state(),
 (SELECT pg_temp.d3_changed(state,'d3220002-0000-4000-8000-000000000001',
  pg_temp.d3_review_delta('pending',NULL,'d3220001-0000-4000-8000-000000000001')) FROM d3_before),
 'pending reset clears reason and changes only its reviewed input');
SELECT is((SELECT row FROM d3_return WHERE label='pending5'),
 (SELECT state->'inputs'->'d3220002-0000-4000-8000-000000000001'||
  pg_temp.d3_review_delta('pending',NULL,'d3220001-0000-4000-8000-000000000001') FROM d3_before),
 'pending reset returns independently expected full composite');
TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('missingreviewer',$q$SELECT * FROM public.admin_review_agent_data_input(
 'd3220002-0000-4000-8000-000000000001','verified',NULL,false,NULL)$q$);
SELECT pg_temp.d3_attempt('baddecision',$q$SELECT * FROM public.admin_review_agent_data_input(
 'd3220002-0000-4000-8000-000000000001','verify',NULL,false,
 'd3220001-0000-4000-8000-000000000001')$q$);
SELECT pg_temp.d3_attempt('missingrow',$q$SELECT * FROM public.admin_review_agent_data_input(
 'd3220002-0000-4000-8000-000000000099','verified',NULL,false,
 'd3220001-0000-4000-8000-000000000001')$q$);
RESET ROLE;
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='missingreviewer'),'P0001:not_authenticated',
 'five-argument no-sub path requires reviewer');
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='baddecision'),'P0001:invalid_decision',
 'five-argument decision vocabulary rejects three-argument action');
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='missingrow'),'P0001:not_found',
 'missing review target denied');
SELECT is(pg_temp.d3_state(),(SELECT state FROM d3_before),
 'review denials preserve complete input/ban graph');

SELECT set_config('request.jwt.claim.sub','d3220001-0000-4000-8000-000000000001',true),
 set_config('request.jwt.claims','{"role":"service_role","sub":"d3220001-0000-4000-8000-000000000001"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('verify3',$q$INSERT INTO d3_return(label,id,row)
 SELECT 'verify3',r.id,to_jsonb(r) FROM public.admin_review_agent_data_input(
 p_id=>'d3220002-0000-4000-8000-000000000001'::uuid,p_action=>'verify'::text,p_reason=>NULL::text) r$q$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='verify3'),NULL::text,'three-argument admin-subject compatibility review succeeds');
SELECT ok((SELECT status='verified' AND rejection_reason IS NULL AND reviewed_by='d3220001-0000-4000-8000-000000000001'
 FROM public.agent_data_inputs WHERE id='d3220002-0000-4000-8000-000000000001'),
 'three-argument verify maps action and clears reason');
SELECT is(pg_temp.d3_state(),
 (SELECT pg_temp.d3_changed(state,'d3220002-0000-4000-8000-000000000001',
  pg_temp.d3_review_delta('verified',NULL,'d3220001-0000-4000-8000-000000000001')) FROM d3_before),
 'three-argument verify changes exactly its input/full graph');
SELECT is((SELECT row FROM d3_return WHERE label='verify3'),
 (SELECT state->'inputs'->'d3220002-0000-4000-8000-000000000001'||
  pg_temp.d3_review_delta('verified',NULL,'d3220001-0000-4000-8000-000000000001') FROM d3_before),
 'three-argument verify returns independently expected full composite');
TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SELECT set_config('request.jwt.claim.sub','d3220001-0000-4000-8000-000000000002',true),
 set_config('request.jwt.claims','{"role":"authenticated","sub":"d3220001-0000-4000-8000-000000000002"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.d3_attempt('browser_own_select',$q$INSERT INTO d3_return(label,id,row)
 SELECT 'browser_own_select',i.id,to_jsonb(i) FROM public.agent_data_inputs i
 WHERE i.user_id=auth.uid() AND i.property_address='D3 Direct Athens 12'$q$);
SELECT pg_temp.d3_attempt('browser_own_admin_update',$q$WITH u AS (
 UPDATE public.agent_data_inputs SET status='flagged',rejection_reason='browser attempt'
 WHERE user_id=auth.uid() AND property_address='D3 Direct Athens 12' RETURNING *)
 INSERT INTO d3_return SELECT 'browser_own_admin_update',u.id,to_jsonb(u) FROM u$q$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='browser_own_select'),NULL::text,
 'authenticated owning agent SELECT completes without SQL error');
SELECT is((SELECT count(*)::integer FROM d3_return WHERE label='browser_own_select'),1,
 'own input is exactly one SELECT-visible row under actual authenticated actor');
SELECT is((SELECT id FROM d3_return WHERE label='browser_own_select'),
 (SELECT id FROM d3_return WHERE label='direct'),
 'SELECT-visible row is the exact previously inserted direct input');
SELECT is((SELECT row FROM d3_return WHERE label='browser_own_select'),
 (SELECT state->'inputs'->id::text FROM d3_before,d3_return WHERE label='direct'),
 'own SELECT sees the complete unchanged target record');
SELECT ok((SELECT s.actor_role='authenticated' AND u.actor_role=s.actor_role
 AND s.subject='d3220001-0000-4000-8000-000000000002' AND u.subject=s.subject
 FROM d3_outcome s,d3_outcome u
 WHERE s.label='browser_own_select' AND u.label='browser_own_admin_update'),
 'own SELECT and UPDATE use the same actual authenticated agent subject');
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='browser_own_admin_update'),NULL::text,
 'authenticated owning nonadmin direct UPDATE is row-filtered without SQL error');
SELECT is((SELECT count(*)::integer FROM d3_return WHERE label='browser_own_admin_update'),0,
 'own visible input admin-column UPDATE returns zero rows');
SELECT is(pg_temp.d3_state(),(SELECT state FROM d3_before),
 'own visible input admin-column UPDATE leaves complete input/ban/credit graph unchanged');
TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SELECT set_config('request.jwt.claim.sub','d3220001-0000-4000-8000-000000000007',true),
 set_config('request.jwt.claims','{"role":"service_role","sub":"d3220001-0000-4000-8000-000000000007"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('nonadmin3',$q$SELECT * FROM public.admin_review_agent_data_input(
 p_id=>'d3220002-0000-4000-8000-000000000001'::uuid,p_action=>'reject'::text,p_reason=>'bad'::text)$q$);
RESET ROLE;
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='nonadmin3'),
 '42501:Only platform admins can review data inputs','three-argument nonadmin subject denied');
SELECT is(pg_temp.d3_state(),(SELECT state FROM d3_before),
 'three-argument nonadmin denial preserves full graph');

-- A4 mixed reader fixture: normal INSERT/review triggers, with one stored credited
-- verified row. The credit row is local service-state preparation, not a provider call.
TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('reader_seed',$q$INSERT INTO public.agent_data_inputs
 (id,user_id,property_address,property_type,transaction_type,agent_side,sale_price,closing_date,created_at)
 VALUES
 ('d3220002-0000-4000-8000-000000000101','d3220001-0000-4000-8000-000000000002',
 'D3 Reader Pending 101','house','sale','seller',100000,CURRENT_DATE,now()),
 ('d3220002-0000-4000-8000-000000000102','d3220001-0000-4000-8000-000000000002',
 'D3 Reader Pending 102','house','sale','seller',100000,CURRENT_DATE,
 (date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')-INTERVAL '1 day'),
 ('d3220002-0000-4000-8000-000000000103','d3220001-0000-4000-8000-000000000002',
 'D3 Reader Pending 103','house','sale','seller',100000,CURRENT_DATE,now()),
 ('d3220002-0000-4000-8000-000000000104','d3220001-0000-4000-8000-000000000002',
 'D3 Reader Pending 104','house','sale','seller',100000,CURRENT_DATE,now())$q$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='reader_seed'),NULL::text,
 'mixed reader seed inserts four normal-trigger rows');
SELECT is(pg_temp.d3_state(),(SELECT pg_temp.d3_reader_seed_expected(state) FROM d3_before),
 'mixed reader seed yields exact four-row full graph delta');

TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('reader_verified101',$q$SELECT * FROM public.admin_review_agent_data_input(
 'd3220002-0000-4000-8000-000000000101','verified',NULL,false,
 'd3220001-0000-4000-8000-000000000001')$q$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='reader_verified101'),NULL::text,
 'first mixed reader verification succeeds');
SELECT is(pg_temp.d3_state(),(SELECT pg_temp.d3_changed(state,'d3220002-0000-4000-8000-000000000101',
 pg_temp.d3_review_delta('verified',NULL,'d3220001-0000-4000-8000-000000000001')) FROM d3_before),
 'first mixed reader verification changes exact full graph');

TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('reader_verified102',$q$SELECT * FROM public.admin_review_agent_data_input(
 'd3220002-0000-4000-8000-000000000102','verified',NULL,false,
 'd3220001-0000-4000-8000-000000000001')$q$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='reader_verified102'),NULL::text,
 'prior-month reader verification succeeds');
SELECT is(pg_temp.d3_state(),(SELECT pg_temp.d3_changed(state,'d3220002-0000-4000-8000-000000000102',
 pg_temp.d3_review_delta('verified',NULL,'d3220001-0000-4000-8000-000000000001')) FROM d3_before),
 'prior-month reader verification changes exact full graph');

TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('reader_rejected103',$q$SELECT * FROM public.admin_review_agent_data_input(
 'd3220002-0000-4000-8000-000000000103','rejected','reader reject',false,
 'd3220001-0000-4000-8000-000000000001')$q$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='reader_rejected103'),NULL::text,
 'mixed reader rejection succeeds');
SELECT is(pg_temp.d3_state(),(SELECT pg_temp.d3_changed(state,'d3220002-0000-4000-8000-000000000103',
 pg_temp.d3_review_delta('rejected','reader reject','d3220001-0000-4000-8000-000000000001')) FROM d3_before),
 'mixed reader rejection changes exact full graph');

TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('reader_flagged104',$q$SELECT * FROM public.admin_review_agent_data_input(
 'd3220002-0000-4000-8000-000000000104','flagged','reader flag',false,
 'd3220001-0000-4000-8000-000000000001')$q$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='reader_flagged104'),NULL::text,
 'mixed reader flag without ban succeeds');
SELECT is(pg_temp.d3_state(),(SELECT pg_temp.d3_changed(state,'d3220002-0000-4000-8000-000000000104',
 pg_temp.d3_review_delta('flagged','reader flag','d3220001-0000-4000-8000-000000000001')) FROM d3_before),
 'mixed reader flag changes exact full graph without a ban');

TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('reader_credit102',$q$UPDATE public.agent_data_inputs SET
 discount_applied=true,discount_applied_at=now(),discount_invoice_id='d3-fixture-invoice',
 applied_to_invoice_at=now(),stripe_credit_id='d3-fixture-credit',
 stripe_credit_amount_cents=500,stripe_credit_currency='eur',
 stripe_credit_expected_amount_cents=500,stripe_credit_operation_key='d3-fixture-operation'
 WHERE id='d3220002-0000-4000-8000-000000000102'$q$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='reader_credit102'),NULL::text,
 'local credited verified control stored through normal UPDATE triggers');
SELECT is(pg_temp.d3_state(),(SELECT pg_temp.d3_changed(state,'d3220002-0000-4000-8000-000000000102',
 jsonb_build_object('discount_applied',true,'discount_applied_at',now(),
 'discount_invoice_id','d3-fixture-invoice','applied_to_invoice_at',now(),
 'stripe_credit_id','d3-fixture-credit','stripe_credit_amount_cents',500,
 'stripe_credit_currency','eur','stripe_credit_expected_amount_cents',500,
 'stripe_credit_operation_key','d3-fixture-operation','updated_at',now())) FROM d3_before),
 'stored credited control changes only its exact credit fields and update time');

-- A4 status and quota readers use separate subject contracts and do not mutate.
TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT is((SELECT monthly_count FROM public.get_agent_data_input_status('d3220001-0000-4000-8000-000000000005')),1,
 'status current-month count includes reviewed input');
SELECT is((SELECT monthly_count FROM public.get_agent_data_input_status('d3220001-0000-4000-8000-000000000003')),20,
 'status excludes prior-month cap control from monthly count');
SELECT is((SELECT total_pending FROM public.get_agent_data_input_status('d3220001-0000-4000-8000-000000000003')),21,
 'status all-time pending includes prior-month control');
SELECT is((SELECT total_pending FROM public.get_agent_data_input_status('d3220001-0000-4000-8000-000000000002')),2,
 'status counts the two pending direct submissions independently');
SELECT is((SELECT total_verified FROM public.get_agent_data_input_status('d3220001-0000-4000-8000-000000000005')),1,
 'status all-time verified count');
SELECT is((SELECT pending_discount_pct FROM public.get_agent_data_input_status('d3220001-0000-4000-8000-000000000005')),0.5::numeric,
 'status pending discount reflects unapplied verified input');
SELECT is((SELECT lifetime_banned FROM public.get_agent_data_input_status('d3220001-0000-4000-8000-000000000005')),true,
 'status reports lifetime ban');
SELECT is((SELECT count(*)::integer FROM public.get_agent_data_input_status('d3220001-0000-4000-8000-000000000002')),1,
 'mixed status returns exactly one complete record');
SELECT is((SELECT to_jsonb(s) FROM public.get_agent_data_input_status('d3220001-0000-4000-8000-000000000002') s),
 jsonb_build_object('monthly_count',5,'monthly_limit',20,'discount_pct_per_input',0.5,
 'pending_discount_pct',0.5,'pending_discount_count',1,'total_pending',2,'total_verified',2,
 'total_rejected',2,'lifetime_banned',false,'ban_reason',NULL,'banned_at',NULL),
 'mixed status excludes credited verified input yet counts both reviewed outcomes and prior month');
SELECT is((SELECT to_jsonb(s) FROM public.get_agent_data_input_status('d3220001-0000-4000-8000-000000000005') s),
 jsonb_build_object('monthly_count',1,'monthly_limit',20,'discount_pct_per_input',0.5,
 'pending_discount_pct',0.5,'pending_discount_count',1,'total_pending',0,'total_verified',1,
 'total_rejected',0,'lifetime_banned',true,'ban_reason','false claim','banned_at',now()),
 'banned agent status returns exact eleven-column record including ban metadata');
SELECT pg_temp.d3_attempt('status_no_target',$q$SELECT * FROM public.get_agent_data_input_status(NULL::uuid)$q$);
SELECT pg_temp.d3_attempt('quota_no_subject',$q$SELECT * FROM public.agent_data_input_quota('d3220001-0000-4000-8000-000000000005')$q$);
RESET ROLE;
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='status_no_target'),'P0001:not_authenticated',
 'status no-sub requires explicit target');
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='quota_no_subject'),
 '42501:Not authenticated','quota no-sub denies even with explicit target');
SELECT is(pg_temp.d3_state(),(SELECT state FROM d3_before),
 'service reader successes and denials preserve full graph');
SELECT set_config('request.jwt.claim.sub','d3220001-0000-4000-8000-000000000002',true),
 set_config('request.jwt.claims','{"role":"service_role","sub":"d3220001-0000-4000-8000-000000000002"}',true);
SET LOCAL ROLE service_role;
SELECT is((SELECT count(*)::integer FROM public.agent_data_input_quota('d3220001-0000-4000-8000-000000000002')),1,
 'mixed quota returns exactly one complete record');
SELECT is((SELECT to_jsonb(q) FROM public.agent_data_input_quota('d3220001-0000-4000-8000-000000000002') q),
 jsonb_build_object('used',5,'monthly_limit',20,'remaining',15,'is_banned',false),
 'mixed quota exact four-column record excludes prior month');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','d3220001-0000-4000-8000-000000000005',true),
 set_config('request.jwt.claims','{"role":"service_role","sub":"d3220001-0000-4000-8000-000000000005"}',true);
SET LOCAL ROLE service_role;
SELECT is((SELECT used FROM public.agent_data_input_quota('d3220001-0000-4000-8000-000000000005')),1,
 'quota self usage');
SELECT is((SELECT remaining FROM public.agent_data_input_quota('d3220001-0000-4000-8000-000000000005')),19,
 'quota self remaining');
SELECT is((SELECT is_banned FROM public.agent_data_input_quota('d3220001-0000-4000-8000-000000000005')),true,
 'quota self ban state');
SELECT is((SELECT to_jsonb(q) FROM public.agent_data_input_quota('d3220001-0000-4000-8000-000000000005') q),
 jsonb_build_object('used',1,'monthly_limit',20,'remaining',19,'is_banned',true),
 'banned agent quota returns exact four-column record');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','d3220001-0000-4000-8000-000000000001',true),
 set_config('request.jwt.claims','{"role":"service_role","sub":"d3220001-0000-4000-8000-000000000001"}',true);
SET LOCAL ROLE service_role;
SELECT is((SELECT used FROM public.agent_data_input_quota('d3220001-0000-4000-8000-000000000003')),20,
 'admin may inspect another agent cap');
SELECT is((SELECT to_jsonb(q) FROM public.agent_data_input_quota('d3220001-0000-4000-8000-000000000003') q),
 jsonb_build_object('used',20,'monthly_limit',20,'remaining',0,'is_banned',false),
 'admin cross-user quota returns exact four-column cap record');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','d3220001-0000-4000-8000-000000000009',true),
 set_config('request.jwt.claims','{"role":"service_role","sub":"d3220001-0000-4000-8000-000000000009"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('quota_outsider',$q$SELECT * FROM public.agent_data_input_quota('d3220001-0000-4000-8000-000000000003')$q$);
RESET ROLE;
SELECT is((SELECT sqlstate||':'||message FROM d3_outcome WHERE label='quota_outsider'),
 '42501:Not authorised to inspect another user''s quota','quota outsider denied');
SELECT is(pg_temp.d3_state(),(SELECT state FROM d3_before),
 'all status/quota reads preserve complete fixture graph');

-- The three-argument action vocabulary includes reject and reject_and_ban.
TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SELECT set_config('request.jwt.claim.sub','d3220001-0000-4000-8000-000000000001',true),
 set_config('request.jwt.claims','{"role":"service_role","sub":"d3220001-0000-4000-8000-000000000001"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('reject3',$q$INSERT INTO d3_return(label,id,row)
 SELECT 'reject3',r.id,to_jsonb(r) FROM public.admin_review_agent_data_input(
 p_id=>'d3220002-0000-4000-8000-000000000001'::uuid,p_action=>'reject'::text,
 p_reason=>'ordinary reject'::text) r$q$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='reject3'),NULL::text,
 'three-argument reject succeeds for admin subject');
SELECT is(pg_temp.d3_state(),
 (SELECT pg_temp.d3_changed(state,'d3220002-0000-4000-8000-000000000001',
  pg_temp.d3_review_delta('rejected','ordinary reject','d3220001-0000-4000-8000-000000000001')) FROM d3_before),
 'three-argument reject changes only its reviewed input');
SELECT is((SELECT row FROM d3_return WHERE label='reject3'),
 (SELECT state->'inputs'->'d3220002-0000-4000-8000-000000000001'||
  pg_temp.d3_review_delta('rejected','ordinary reject','d3220001-0000-4000-8000-000000000001') FROM d3_before),
 'three-argument reject returns independently expected full composite');
TRUNCATE d3_before; INSERT INTO d3_before SELECT pg_temp.d3_state();
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('rejectban3',$q$INSERT INTO d3_return(label,id,row)
 SELECT 'rejectban3',r.id,to_jsonb(r) FROM public.admin_review_agent_data_input(
 p_id=>'d3220002-0000-4000-8000-000000000001'::uuid,p_action=>'reject_and_ban'::text,
 p_reason=>'legacy review'::text) r$q$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='rejectban3'),NULL::text,
 'three-argument reject_and_ban succeeds for admin subject');
SELECT ok((SELECT status='rejected' AND rejection_reason='legacy review'
 AND reviewed_by='d3220001-0000-4000-8000-000000000001' AND reviewed_at=now()
 FROM public.agent_data_inputs WHERE id='d3220002-0000-4000-8000-000000000001'),
 'legacy action maps to rejected row and normal review timestamps');
SELECT ok((SELECT count(*)=1 AND min(reason)='false claim' FROM public.agent_data_input_bans
 WHERE user_id='d3220001-0000-4000-8000-000000000005'),
 'legacy repeated ban preserves existing ban reason');
SELECT is(pg_temp.d3_state(),
 (SELECT pg_temp.d3_changed(state,'d3220002-0000-4000-8000-000000000001',
  pg_temp.d3_review_delta('rejected','legacy review','d3220001-0000-4000-8000-000000000001')) FROM d3_before),
 'legacy reject-and-ban changes exact reviewed input and preserves entire prior ban/full graph');
SELECT is((SELECT row FROM d3_return WHERE label='rejectban3'),
 (SELECT state->'inputs'->'d3220002-0000-4000-8000-000000000001'||
  pg_temp.d3_review_delta('rejected','legacy review','d3220001-0000-4000-8000-000000000001') FROM d3_before),
 'legacy reject-and-ban returns independently expected full composite');

-- Keep exact first-denial data in raw output before rollback removes the temp recorder.
SELECT label,actor_role,subject,sqlstate,message,
 CASE
  WHEN label IN ('buyer_direct','null_direct','banned_direct','twentyfirst','anon_direct') THEN 'normal insert role/ban/cap trigger'
  WHEN label IN ('future','old') THEN 'normal closing-date trigger'
  WHEN label='browser_direct' THEN 'authenticated INSERT RLS check'
  WHEN label IN ('browser_rpc','browser_status','anon_rpc') THEN 'function EXECUTE grant'
  WHEN label IN ('legacy_no_subject','legacy_buyer','legacy_nullrole','legacy_banned','legacy_cap',
                 'legacy_bad_type','legacy_bad_side') THEN 'retained submission RPC guard'
  WHEN label='legacy_zero' THEN 'table positive-price CHECK after retained RPC validation'
  WHEN label IN ('missingreviewer','baddecision','missingrow') THEN 'five-argument review RPC guard'
  WHEN label='nonadmin3' THEN 'three-argument review RPC admin guard'
  WHEN label='status_no_target' THEN 'status RPC actor guard'
  WHEN label IN ('quota_no_subject','quota_outsider') THEN 'quota RPC actor guard'
 END AS first_denial_layer
FROM d3_outcome WHERE sqlstate IS NOT NULL ORDER BY label;
SELECT o.label,o.actor_role,o.subject,o.sqlstate,
 (SELECT actor_role FROM d3_outcome WHERE label='browser_own_select') AS select_actor_role,
 (SELECT subject FROM d3_outcome WHERE label='browser_own_select') AS select_subject,
 (SELECT id FROM d3_return WHERE label='browser_own_select') AS visible_id,
 (SELECT count(*)::integer FROM d3_return WHERE label='browser_own_select') AS visible_rows,
 (SELECT count(*)::integer FROM d3_return WHERE label='browser_own_admin_update') AS returned_rows,
 'authenticated own-row UPDATE admin RLS row filter; no trigger hit established' AS first_boundary
FROM d3_outcome o WHERE label='browser_own_admin_update';

SELECT * FROM finish();
ROLLBACK;
