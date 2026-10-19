\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_database() !~ '^maiprop_t13_active_[a-z0-9_]+$'
 OR current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database()
 OR current_user <> 'postgres' OR session_user <> 'postgres'
 OR inet_server_addr() IS NOT NULL OR current_setting('session_replication_role') <> 'origin'
 OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) <> 'postgres'
 OR (SELECT count(*) FROM pg_stat_activity WHERE datname='maiprop_t12q_20260930_source') <> 0
 OR (SELECT count(*) FROM pg_prepared_xacts WHERE database IN (current_database(),'maiprop_t12q_20260930_source')) <> 0
 OR EXISTS (SELECT 1 FROM public.rate_limit_counters WHERE bucket LIKE 'admin-broadcast-notification:a13-%')
 THEN RAISE EXCEPTION 'owned idle local clone and clean limiter fixture required'; END IF;
END $$;

CREATE FUNCTION pg_temp.a13b_graph() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY bucket,window_start),'[]'::jsonb)
 FROM public.rate_limit_counters r
$$;
CREATE FUNCTION pg_temp.a13b_catalog() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
 'function',(SELECT jsonb_build_object('body',encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex'),
  'owner',pg_get_userbyid(proowner),'definer',prosecdef,'config',proconfig,'raw_acl',proacl,
  'effective_acl',(SELECT jsonb_agg(to_jsonb(a) ORDER BY grantee,privilege_type)
   FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) a))
  FROM pg_proc p WHERE oid='public.check_and_increment_rate_limit(text,integer,integer)'::regprocedure),
 'table',(SELECT jsonb_build_object('owner',pg_get_userbyid(relowner),'acl',relacl,'rls',relrowsecurity,
  'force_rls',relforcerowsecurity,'columns',(SELECT jsonb_agg(jsonb_build_object('name',attname,
   'type',format_type(atttypid,atttypmod),'not_null',attnotnull,'generated',attgenerated,
   'default',pg_get_expr(adbin,adrelid)) ORDER BY attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid=c.oid AND attnum>0 AND NOT attisdropped))
  FROM pg_class c WHERE oid='public.rate_limit_counters'::regclass),
 'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',conname,'def',pg_get_constraintdef(oid,true)) ORDER BY conname),'[]'::jsonb)
  FROM pg_constraint WHERE conrelid='public.rate_limit_counters'::regclass),
 'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',polname,'cmd',polcmd,'roles',polroles,
   'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid)) ORDER BY polname),'[]'::jsonb)
  FROM pg_policy WHERE polrelid='public.rate_limit_counters'::regclass),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,
   'def',pg_get_triggerdef(oid,true)) ORDER BY tgname),'[]'::jsonb)
  FROM pg_trigger WHERE tgrelid='public.rate_limit_counters'::regclass AND NOT tgisinternal),
 'cron',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',jobname,'schedule',schedule,'command',command)
  ORDER BY jobid),'[]'::jsonb) FROM cron.job WHERE jobname='rate-limit-counters-cleanup'),
 'privileges',(SELECT jsonb_agg(jsonb_build_object('role',r,'schema',has_schema_privilege(r,'public','USAGE'),
  'execute',has_function_privilege(r,'public.check_and_increment_rate_limit(text,integer,integer)','EXECUTE'),
  'select',has_table_privilege(r,'public.rate_limit_counters','SELECT'),
  'insert',has_table_privilege(r,'public.rate_limit_counters','INSERT'),
  'update',has_table_privilege(r,'public.rate_limit_counters','UPDATE')) ORDER BY r)
  FROM (VALUES('postgres'),('anon'),('authenticated'),('service_role')) roles(r)))
$$;
CREATE TEMP TABLE a13b_pre AS SELECT pg_backend_pid() pid,pg_temp.a13b_graph() graph,
 pg_temp.a13b_catalog() catalog,current_setting('request.jwt.claims',true) claims,
 current_setting('request.jwt.claim.sub',true) sub_claim,current_setting('request.jwt.claim.role',true) role_claim;
SELECT 'A13B_PRE',pid,encode(digest(graph::text,'sha256'),'hex'),
 encode(digest(catalog::text,'sha256'),'hex') FROM a13b_pre;

BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
SELECT plan(17);
SELECT is(current_setting('session_replication_role'),'origin','normal trigger mode');
SELECT is((SELECT catalog->'function'->>'body' FROM a13b_pre),
 'dde54a8eeacde937c2669fd22c67e63649be854fa0293dd401e4f852ad316fee',
 'installed limiter body matches historical unhit source identity');
SELECT ok(has_function_privilege('service_role','public.check_and_increment_rate_limit(text,integer,integer)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.check_and_increment_rate_limit(text,integer,integer)','EXECUTE')
 AND NOT has_function_privilege('anon','public.check_and_increment_rate_limit(text,integer,integer)','EXECUTE')
 AND NOT has_table_privilege('authenticated','public.rate_limit_counters','INSERT')
 AND (SELECT relrowsecurity FROM pg_class WHERE oid='public.rate_limit_counters'::regclass),
 'service-only execution, client table denial and RLS installed');
SELECT ok((SELECT jsonb_array_length(catalog->'cron')=1 AND jsonb_array_length(catalog->'policies')=1
 FROM a13b_pre),'cleanup scheduled and installed counter policy bound');
CREATE TEMP TABLE a13b_result(n int PRIMARY KEY, value jsonb);
GRANT INSERT ON a13b_result TO service_role;
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true),
 set_config('request.jwt.claim.role','service_role',true);
SET LOCAL ROLE service_role;
INSERT INTO a13b_result SELECT n,public.check_and_increment_rate_limit('admin-broadcast-notification:a13-fixture-ip',60,2)
 FROM generate_series(1,3) n ORDER BY n;
INSERT INTO a13b_result SELECT 4,public.check_and_increment_rate_limit('admin-broadcast-notification:a13-other-ip',60,2);
RESET ROLE;
SELECT is((SELECT jsonb_agg(value->'allowed' ORDER BY n) FROM a13b_result WHERE n<=3),
 '[true,true,false]'::jsonb,'sequential allow, allow, deny transition');
SELECT is((SELECT jsonb_agg(value->'count' ORDER BY n) FROM a13b_result WHERE n<=3),
 '[1,2,3]'::jsonb,'counts increment through denial');
SELECT ok((SELECT count(DISTINCT value->>'window_start')=1 AND bool_and((value->>'limit')::int=2)
 AND bool_and((value->>'reset_in_seconds')::int BETWEEN 0 AND 60) FROM a13b_result WHERE n<=3),
 'one aligned window, exact limit and bounded reset');
SELECT is((SELECT (value->>'allowed')||':'||(value->>'count') FROM a13b_result WHERE n=4),
 'true:1','second bucket is independent');
SELECT ok((SELECT count(*)=2 AND sum(count)=4 AND max(count)=3 AND min(count)=1
 AND count(DISTINCT window_start)=1 FROM public.rate_limit_counters
 WHERE bucket LIKE 'admin-broadcast-notification:a13-%'),
 'exact two scoped rows after four calls');
SELECT ok((SELECT pg_temp.a13b_graph()=(graph ||
  (SELECT jsonb_agg(to_jsonb(r) ORDER BY bucket,window_start) FROM public.rate_limit_counters r
   WHERE bucket LIKE 'admin-broadcast-notification:a13-%')) FROM a13b_pre),
 'complete counter graph differs only by fixture rows');
CREATE TEMP TABLE a13b_after AS SELECT pg_temp.a13b_graph() graph;
CREATE TEMP TABLE a13b_denial(sqlstate text,message text);
GRANT INSERT ON a13b_denial TO authenticated;
CREATE FUNCTION pg_temp.a13b_try() RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE s text; m text;
BEGIN
 BEGIN
  PERFORM public.check_and_increment_rate_limit('admin-broadcast-notification:a13-fixture-ip',60,2);
  INSERT INTO a13b_denial VALUES(NULL,NULL);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS s=RETURNED_SQLSTATE,m=MESSAGE_TEXT;
  INSERT INTO a13b_denial VALUES(s,m);
 END;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.a13b_try() TO authenticated;
SELECT set_config('request.jwt.claim.sub','a1300000-0000-4000-8000-000000000001',true),
 set_config('request.jwt.claims','{"role":"authenticated","sub":"a1300000-0000-4000-8000-000000000001"}',true),
 set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.a13b_try();
RESET ROLE;
SELECT is((SELECT sqlstate FROM a13b_denial),'42501','authenticated caller denied by function ACL');
SELECT is((SELECT message FROM a13b_denial),'permission denied for function check_and_increment_rate_limit',
 'denial message names protected RPC');
SELECT is(pg_temp.a13b_graph(),(SELECT graph FROM a13b_after),'client denial leaves complete counter graph unchanged');
SELECT is(pg_temp.a13b_catalog(),(SELECT catalog FROM a13b_pre),'catalog and cleanup definition remain unchanged');
SELECT is((SELECT count(*)::int FROM a13b_result),4,'exactly four service returns');
SELECT is((SELECT count(*)::int FROM a13b_denial),1,'exactly one captured client denial');
SELECT is(current_user,'postgres','actual role reset before finish');
SELECT * FROM finish();
ROLLBACK;
DO $$ DECLARE b a13b_pre%ROWTYPE; BEGIN
 SELECT * INTO b FROM a13b_pre;
 IF pg_backend_pid()<>b.pid THEN RAISE EXCEPTION 'limiter backend mismatch'; END IF;
 IF pg_temp.a13b_graph() IS DISTINCT FROM b.graph THEN RAISE EXCEPTION 'limiter graph rollback mismatch'; END IF;
 IF pg_temp.a13b_catalog() IS DISTINCT FROM b.catalog THEN RAISE EXCEPTION 'limiter catalog drift'; END IF;
 IF current_user<>'postgres' OR current_setting('session_replication_role')<>'origin'
 THEN RAISE EXCEPTION 'limiter role/origin drift'; END IF;
 IF coalesce(current_setting('request.jwt.claims',true),'') <> coalesce(b.claims,'')
 OR coalesce(current_setting('request.jwt.claim.sub',true),'') <> coalesce(b.sub_claim,'')
 OR coalesce(current_setting('request.jwt.claim.role',true),'') <> coalesce(b.role_claim,'')
 THEN RAISE EXCEPTION 'limiter claim rollback mismatch: pre %,%,% post %,%,%',
  b.claims,b.sub_claim,b.role_claim,current_setting('request.jwt.claims',true),
  current_setting('request.jwt.claim.sub',true),current_setting('request.jwt.claim.role',true); END IF;
END $$;
SELECT 'A13B_POST',pg_backend_pid(),encode(digest(pg_temp.a13b_graph()::text,'sha256'),'hex'),
 encode(digest(pg_temp.a13b_catalog()::text,'sha256'),'hex');
DROP TABLE a13b_pre;
DROP FUNCTION pg_temp.a13b_graph();
DROP FUNCTION pg_temp.a13b_catalog();
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace=pg_my_temp_schema())
 OR EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace=pg_my_temp_schema())
 THEN RAISE EXCEPTION 'limiter temporary residue'; END IF;
END $$;
