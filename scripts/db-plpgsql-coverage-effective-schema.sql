-- Stable final object inventory for local migration lineage. This view lives
-- outside public/private and is created only after migration trace is disabled.
-- Canonical definitions exclude mutable pg_class statistics and row counts.
CREATE VIEW remediation_ddl_trace.final_inventory AS
WITH raw AS (
  SELECT 'pg_namespace'::text catalog_class, n.oid catalog_oid,
    quote_ident(n.nspname) object_identity, 'schema'::text object_kind,
    jsonb_build_object('acl',COALESCE((SELECT jsonb_agg(format('%s:%s:%s',a.grantee::regrole,a.privilege_type,a.is_grantable) ORDER BY a.grantee,a.privilege_type)
      FROM aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a),'[]'::jsonb)) definition
  FROM pg_namespace n WHERE n.nspname IN ('public','private','auth','storage','realtime','vault','net','cron','pgmq')

  UNION ALL
  SELECT 'pg_proc',p.oid,format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),
    CASE p.prokind WHEN 'p' THEN 'procedure' ELSE 'function' END,
    jsonb_build_object('ddl',pg_get_functiondef(p.oid),'acl',COALESCE((SELECT jsonb_agg(format('%s:%s:%s',a.grantee::regrole,a.privilege_type,a.is_grantable) ORDER BY a.grantee,a.privilege_type)
      FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a),'[]'::jsonb))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','private','auth','storage','realtime','vault','net','cron','pgmq')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')

  UNION ALL
  SELECT 'pg_class',c.oid,format('%I.%I',n.nspname,c.relname),
    CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'partitioned_table' WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized_view' WHEN 'S' THEN 'sequence' ELSE 'foreign_table' END,
    jsonb_build_object('relkind',c.relkind,'relpersistence',c.relpersistence,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
      'columns',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
        'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,
        'default',pg_get_expr(ad.adbin,ad.adrelid),'acl',a.attacl::text) ORDER BY a.attnum)
        FROM pg_attribute a LEFT JOIN pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum
        WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
      'view',CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,true) END,
      'sequence',CASE WHEN c.relkind='S' THEN (SELECT jsonb_build_object('type',format_type(s.seqtypid,NULL),'start',s.seqstart,'increment',s.seqincrement,'min',s.seqmin,'max',s.seqmax,'cache',s.seqcache,'cycle',s.seqcycle) FROM pg_sequence s WHERE s.seqrelid=c.oid) END,
      'acl',COALESCE((SELECT jsonb_agg(format('%s:%s:%s',a.grantee::regrole,a.privilege_type,a.is_grantable) ORDER BY a.grantee,a.privilege_type)
        FROM aclexplode(COALESCE(c.relacl,acldefault((CASE WHEN c.relkind='S' THEN 'S' ELSE 'r' END)::"char",c.relowner))) a),'[]'::jsonb))
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','private','auth','storage','realtime','vault','net','cron','pgmq')
    AND c.relkind IN ('r','p','v','m','S','f')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')

  UNION ALL
  SELECT 'pg_class',i.indexrelid,format('%I.%I',n.nspname,ic.relname),'index',
    jsonb_build_object('ddl',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready)
  FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_namespace n ON n.oid=ic.relnamespace
  WHERE n.nspname IN ('public','private','auth','storage','realtime','vault','net','cron','pgmq')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=i.indexrelid AND d.deptype='e')

  UNION ALL
  SELECT 'pg_constraint',c.oid,format('%I.%I.%I',n.nspname,t.relname,c.conname),'constraint',
    jsonb_build_object('ddl',pg_get_constraintdef(c.oid,true),'validated',c.convalidated,'deferrable',c.condeferrable,'deferred',c.condeferred)
  FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname IN ('public','private','auth','storage','realtime','vault','net','cron','pgmq')

  UNION ALL
  SELECT 'pg_trigger',t.oid,format('%I.%I.%I',n.nspname,c.relname,t.tgname),'trigger',
    jsonb_build_object('ddl',pg_get_triggerdef(t.oid,true),'enabled',t.tgenabled)
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','private','auth','storage','realtime','vault','net','cron','pgmq') AND NOT t.tgisinternal

  UNION ALL
  SELECT 'pg_policy',p.oid,format('%I.%I.%I',n.nspname,c.relname,p.polname),'policy',
    jsonb_build_object('command',p.polcmd,'permissive',p.polpermissive,
      'roles',COALESCE((SELECT jsonb_agg(r.rolname ORDER BY r.rolname) FROM pg_roles r WHERE r.oid=ANY(p.polroles)),'[]'::jsonb),
      'using',pg_get_expr(p.polqual,p.polrelid),'with_check',pg_get_expr(p.polwithcheck,p.polrelid))
  FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','private','auth','storage','realtime','vault','net','cron','pgmq')

  UNION ALL
  SELECT 'pg_type',t.oid,format('%I.%I',n.nspname,t.typname),'type',
    jsonb_build_object('kind',t.typtype,'base',format_type(t.typbasetype,t.typtypmod),
      'not_null',t.typnotnull,'default',t.typdefault,
      'enum',COALESCE((SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid),'[]'::jsonb))
  FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname IN ('public','private','auth','storage','realtime','vault','net','cron','pgmq') AND t.typtype IN ('e','d')

  UNION ALL
  SELECT 'pg_default_acl',d.oid,format('%s:%s:%s',d.defaclrole::regrole,n.nspname,d.defaclobjtype),'default_acl',
    jsonb_build_object('acl',COALESCE((SELECT jsonb_agg(format('%s:%s:%s',a.grantee::regrole,a.privilege_type,a.is_grantable) ORDER BY a.grantee,a.privilege_type)
      FROM aclexplode(d.defaclacl) a),'[]'::jsonb))
  FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
  WHERE n.nspname IN ('public','private','auth','storage','realtime','vault','net','cron','pgmq')
)
SELECT catalog_class,catalog_oid,object_identity,object_kind,definition::text AS canonical_definition,
  encode(digest(definition::text,'sha256'),'hex') AS definition_sha256
FROM raw;
