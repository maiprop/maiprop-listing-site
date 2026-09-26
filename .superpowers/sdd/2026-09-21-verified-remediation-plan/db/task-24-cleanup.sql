SELECT current_database(),version(),inet_server_addr() IS NULL AS socket;
SELECT p.oid::regprocedure,p.provolatile,p.prosecdef,p.proconfig,p.proacl,pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid IN ('public.reserve_ai_quota_for_user(uuid,text)'::regprocedure,'public.get_ai_call_monthly_limit(uuid,text)'::regprocedure);
SELECT 'users',count(*) FROM auth.users WHERE id::text LIKE 'd1240001-%' OR id::text LIKE 'd1241001-%'
UNION ALL SELECT 'profiles',count(*) FROM public.profiles WHERE user_id::text LIKE 'd1240001-%' OR user_id::text LIKE 'd1241001-%'
UNION ALL SELECT 'profiles_public',count(*) FROM public.profiles_public WHERE user_id::text LIKE 'd1240001-%' OR user_id::text LIKE 'd1241001-%'
UNION ALL SELECT 'addon_purchases',count(*) FROM public.addon_purchases WHERE user_id::text LIKE 'd1240001-%' OR user_id::text LIKE 'd1241001-%'
UNION ALL SELECT 'usage_ai_calls',count(*) FROM public.usage_ai_calls WHERE user_id::text LIKE 'd1240001-%' OR user_id::text LIKE 'd1241001-%'
UNION ALL SELECT 'notifications',count(*) FROM public.notifications WHERE user_id::text LIKE 'd1240001-%' OR user_id::text LIKE 'd1241001-%'
UNION ALL SELECT 'investor_subscriptions',count(*) FROM public.investor_subscriptions WHERE user_id::text LIKE 'd1240001-%' OR user_id::text LIKE 'd1241001-%';
SELECT count(*) AS remote_task24_connections FROM pg_stat_activity WHERE datname=current_database() AND application_name IN ('task24_ai_a','task24_ai_b');
