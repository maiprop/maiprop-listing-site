\pset pager off
SELECT current_database() AS database, current_setting('server_version') AS postgres_version;
SELECT p.oid::regprocedure AS signature,
       pg_get_userbyid(p.proowner) AS owner,
       p.proacl AS acl,
       p.prosecdef AS security_definer,
       p.proconfig AS function_settings,
       md5(pg_get_functiondef(p.oid)) AS definition_md5,
       has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute
FROM pg_proc p
WHERE p.oid IN (
  'public.check_open_house_rsvp_monthly_limit()'::regprocedure,
  'public.create_open_house_registration_for_user(uuid,uuid,integer,text,text,text,text,text,boolean,boolean,boolean)'::regprocedure,
  'public.create_open_house_registration(uuid,integer,text,text,text,text,text,boolean,boolean,boolean)'::regprocedure
)
ORDER BY p.oid::regprocedure::text;
SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS binding,
       t.tgfoid::regprocedure AS function_signature
FROM pg_trigger t
WHERE t.tgrelid='public.open_house_registrations'::regclass
  AND NOT t.tgisinternal
  AND (t.tgfoid='public.check_open_house_rsvp_monthly_limit()'::regprocedure
       OR t.tgname ILIKE '%open_house%')
ORDER BY t.tgname;
SELECT has_table_privilege('service_role','public.open_house_registrations','INSERT') AS service_insert,
       has_table_privilege('service_role','public.open_house_registrations','SELECT') AS service_select;
