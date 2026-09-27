import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { lintMigration } from '../../../scripts/check-migration-idempotency.mjs';

const root = '/mnt/c/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/';
const dir = '.superpowers/sdd/2026-09-21-verified-remediation-plan/';
const out = `${dir}db/task-13-local-prerequisites-`;
const dbs = {
  storage: 'maiprop_t13_prereq_storage_20260927',
  enquiry: 'maiprop_t13_prereq_enquiry_20260927',
  viewing: 'maiprop_t13_prereq_viewing_20260927',
  managed: 'maiprop_t13_prereq_managed_20260927',
};
const storagePath = 'supabase/migrations/20260927005313_restore_project_storage_capabilities_disabled.sql';
const enquiryPath = 'supabase/migrations/20260923193844_durable_new_build_enquiry_replay.sql';
const viewingPath = 'supabase/migrations/20260924130000_restore_viewing_create_visibility.sql';
const managedPath = 'supabase/migrations/20260927003528_restore_managed_listing_readers.sql';
const storage = readFileSync(storagePath, 'utf8');
const enquiry = readFileSync(enquiryPath, 'utf8');
const viewing = readFileSync(viewingPath, 'utf8');
const managed = readFileSync(managedPath, 'utf8');
const sha = text => createHash('sha256').update(text).digest('hex');
const manifest = { base: '334cdef83cd05f202f37f9d448034b6332e0e669', sources: Object.fromEntries([[storagePath,storage],[enquiryPath,enquiry],[viewingPath,viewing],[managedPath,managed],['supabase/tests/viewing_create_followup_test.sql',readFileSync('supabase/tests/viewing_create_followup_test.sql','utf8')]].map(([p,s])=>[p,sha(s)])), runs: [] };
const quote = s => `'${s.replaceAll("'", "''")}'`;
function invoke(args) {
  const r = spawnSync('wsl.exe',['-d','Ubuntu','-u','postgres','--',...args],{encoding:'utf8',maxBuffer:40e6});
  if(r.error) throw r.error;
  return r;
}
function run(db,label,sql,expected=0,{tap='none'}={}) {
  assert(/^maiprop_t13_prereq_[a-z_]+_20260927$/.test(db));
  const file=`${out}${label}.sql`;
  writeFileSync(file,sql);
  const r=invoke(['psql','-X','-At','-v','ON_ERROR_STOP=1','-h','/var/run/postgresql','-p','5432','-d',db,'-f',root+file]);
  for(const [ext,data] of Object.entries({stdout:r.stdout,stderr:r.stderr,exit:String(r.status)}))writeFileSync(`${out}${label}.${ext}`,data??'');
  const notOk=(r.stdout.match(/^not ok \d+/gm)||[]).length;
  const ok=(r.stdout.match(/^ok \d+/gm)||[]).length;
  manifest.runs.push({db,label,exit:r.status,ok,notOk,stdout:`${out}${label}.stdout`,stderr:`${out}${label}.stderr`});
  assert.equal(r.status,expected,`${label}: ${r.stderr?.slice(-1000)}`);
  if(tap==='pass')assert.equal(notOk,0,label);
  if(tap==='two-fail')assert.equal(notOk,2,label);
  return r;
}
function checked(db,label,sql,expected=0,options={}) {
  const guard=`DO $$ BEGIN IF current_database()<>${quote(db)} OR inet_server_addr() IS NOT NULL OR current_database() IN ('postgres','template0','template1','maiprop_replay_current_20260921') THEN RAISE EXCEPTION 'Task13 disposable socket guard'; END IF; END $$;\n`;
  return run(db,label,guard+sql,expected,options);
}
function snapshot(db,label,sql){return JSON.parse(checked(db,label,sql).stdout.trim().split('\n').at(-1));}
function assertRejected(db,label,sql,error){const r=checked(db,label,sql,3);assert(r.stderr.includes(error),`${label}: ${r.stderr}`);}
function createDb(name){
  assert(/^maiprop_t13_prereq_enquiry_(owner|preserve|submit|trigger)_20260927$/.test(name));
  const inventory=invoke(['psql','-X','-At','-h','/var/run/postgresql','-p','5432','-d','postgres','-c',`SELECT count(*) FROM pg_database WHERE datname=${quote(name)}`]);
  assert.equal(inventory.status,0);assert.equal(inventory.stdout.trim(),'0',`database exists: ${name}`);
  const r=invoke(['createdb','-h','/var/run/postgresql','-p','5432','-T','maiprop_replay_current_20260921',name]);
  assert.equal(r.status,0,r.stderr);
  manifest.runs.push({label:'created-'+name,exit:r.status});
}
const gateSnapshot=`SELECT jsonb_build_object(
  'control',(SELECT jsonb_build_object('owner',pg_get_userbyid(relowner),'acl',relacl,'rls',relrowsecurity,'force_rls',relforcerowsecurity) FROM pg_class WHERE oid='private.storage_cleanup_rollout_control'::regclass),
  'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'acl',a.attacl) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='private.storage_cleanup_rollout_control'::regclass AND a.attnum>0 AND NOT a.attisdropped),
  'constraints',(SELECT jsonb_agg(jsonb_build_object('name',conname,'valid',convalidated,'definition',pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='private.storage_cleanup_rollout_control'::regclass),
  'rows',(SELECT jsonb_agg(to_jsonb(t) ORDER BY singleton) FROM private.storage_cleanup_rollout_control t),
  'routines',(SELECT jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('private','public') AND (p.proname LIKE 'storage_cleanup%' OR p.proname LIKE 'register_project_upload%' OR p.proname LIKE 'create_project_media%')),
  'storage_policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='storage' AND tablename='objects')
);`;
const enquirySnapshot=`SELECT jsonb_build_object(
  'columns',(SELECT jsonb_agg(jsonb_build_object('name',attname,'type',format_type(atttypid,atttypmod),'not_null',attnotnull) ORDER BY attnum) FROM pg_attribute WHERE attrelid='public.new_building_leads'::regclass AND attnum>0 AND NOT attisdropped),
  'constraints',(SELECT jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.new_building_leads'::regclass),
  'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='new_building_leads'),
  'rows',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.new_building_leads t),
  'routines',(SELECT jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='private' AND p.proname IN ('current_user_owns_listing','preserve_new_build_enquiry_submission')) OR (n.nspname='public' AND p.proname='submit_new_build_enquiry')),
  'trigger',(SELECT jsonb_agg(jsonb_build_object('name',tgname,'definition',pg_get_triggerdef(oid),'function',tgfoid::regprocedure::text,'enabled',tgenabled) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.new_building_leads'::regclass AND tgname='new_building_leads_preserve_submission_identity')
);`;
const managedSnapshot=`SELECT jsonb_build_object(
  'indexes',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready,'live',i.indislive,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl) ORDER BY c.relname) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid='public.listings'::regclass AND (c.relname LIKE 'idx_listings_%management_cursor%' OR c.relname LIKE 'task13_saved_%')),
  'routines',(SELECT jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl) ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'get_manageable_listing_catalogue%'),
  'catalogue',(SELECT jsonb_build_object('definition',pg_get_viewdef(c.oid),'owner',pg_get_userbyid(c.relowner),'acl',c.relacl) FROM pg_class c WHERE c.oid=to_regclass('public.listing_management_catalogue')),
  'listing_policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='listings')
);`;

function storageProof(){
  const db=dbs.storage;
  checked(db,'storage-first',storage);
  checked(db,'storage-repeat-false',storage);
  assert.equal(checked(db,'storage-false-value','SELECT cleanup_enabled FROM private.storage_cleanup_rollout_control;').stdout.trim().split('\n').at(-1),'f');
  checked(db,'storage-operator-true','UPDATE private.storage_cleanup_rollout_control SET cleanup_enabled=true;');
  checked(db,'storage-repeat-true',storage);
  assert.equal(checked(db,'storage-true-value','SELECT cleanup_enabled FROM private.storage_cleanup_rollout_control;').stdout.trim().split('\n').at(-1),'t');
  checked(db,'storage-operator-reset','UPDATE private.storage_cleanup_rollout_control SET cleanup_enabled=false;');
  for(const [label,column,change,restore,red] of [
    ['singleton-wrong','singleton','SET DEFAULT false','SET DEFAULT true',true],
    ['cleanup-wrong','cleanup_enabled','SET DEFAULT true','SET DEFAULT false',true],
    ['singleton-missing','singleton','DROP DEFAULT','SET DEFAULT true',false],
    ['cleanup-missing','cleanup_enabled','DROP DEFAULT','SET DEFAULT false',false],
  ]){
    checked(db,`storage-${label}-setup`,`ALTER TABLE private.storage_cleanup_rollout_control ALTER COLUMN ${column} ${change};`);
    if(red)checked(db,`storage-${label}-red`,oldStorage);
    const before=snapshot(db,`storage-${label}-before`,gateSnapshot);
    assertRejected(db,`storage-${label}-reject`,storage,'storage_capability_rollout_control_conflict');
    const after=snapshot(db,`storage-${label}-after`,gateSnapshot);
    assert.deepEqual(after,before,label);
    checked(db,`storage-${label}-restore`,`ALTER TABLE private.storage_cleanup_rollout_control ALTER COLUMN ${column} ${restore};`);
  }
  assert.equal(checked(db,'storage-final-gate','SELECT cleanup_enabled FROM private.storage_cleanup_rollout_control;').stdout.trim().split('\n').at(-1),'f');
}

function enquiryStart(){
  assert.deepEqual(lintMigration(enquiryPath.split('/').at(-1),enquiry),[]);
  const db=dbs.enquiry;
  const before=snapshot(db,'enquiry-source-before',enquirySnapshot);
  checked(db,'enquiry-source-apply',enquiry);
  const after=snapshot(db,'enquiry-source-after',enquirySnapshot);
  assert(after.routines?.length===3 && after.trigger?.length===1);
  assert(after.routines.every(r=>r.owner==='postgres'));
  assert(after.columns.length>before.columns.length);
  assertRejected(db,'enquiry-source-repeat',enquiry,'unexpected_existing_current_user_owns_listing');
  assert.deepEqual(snapshot(db,'enquiry-source-repeat-after',enquirySnapshot),after);
  checked(db,'enquiry-source-policy-test',`SET maiprop.test_disposable_database=${quote(db)};\n\\i supabase/tests/new_build_enquiry_source_policy_test.sql`,0,{tap:'pass'});
}
function enquiryContinue(){
  const db=dbs.enquiry;
  // The durable replay suite includes the later Task23 service-role grant.
  checked(db,'enquiry-task23-prerequisite',readFileSync('supabase/migrations/20260926224929_repair_open_house_listing_boundary.sql','utf8'));
  checked(db,'enquiry-source-replay-test',`SET maiprop.test_disposable_database=${quote(db)};\n\\i supabase/tests/new_build_enquiry_replay_test.sql`,0,{tap:'pass'});
  for(const [kind,setup,error] of [
    ['owner',`CREATE FUNCTION private.current_user_owns_listing(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT false';`,'unexpected_existing_current_user_owns_listing'],
    ['preserve',`CREATE FUNCTION private.preserve_new_build_enquiry_submission() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NEW; END';`,'unexpected_existing_preserve_new_build_enquiry_submission'],
    ['submit',`CREATE FUNCTION public.submit_new_build_enquiry(uuid,uuid,uuid,text,text,text,text) RETURNS boolean LANGUAGE sql AS 'SELECT false';`,'unexpected_existing_submit_new_build_enquiry'],
    ['trigger',readFileSync('supabase/tests/new_build_enquiry_migration_rollback_setup.sql','utf8'),'unexpected_existing_new_building_leads_preserve_submission_identity'],
  ]){
    const name=`maiprop_t13_prereq_enquiry_${kind}_20260927`;
    createDb(name);
    checked(name,`enquiry-${kind}-setup`,setup);
    const prior=snapshot(name,`enquiry-${kind}-before`,enquirySnapshot);
    assertRejected(name,`enquiry-${kind}-reject`,enquiry,error);
    assert.deepEqual(snapshot(name,`enquiry-${kind}-after`,enquirySnapshot),prior,kind);
  }
}

function viewingProof(){
  const db=dbs.viewing;
  checked(db,'viewing-migration',viewing);
  const normal=readFileSync('supabase/tests/viewing_create_followup_test.sql','utf8');
  const needle="AND listing_id='d6250002-0000-4000-8000-000000000005' RETURNING id,status)";
  assert(normal.includes(needle));
  const red=normal.replace(needle,"AND listing_id='d6250002-0000-4000-8000-000000000005' AND false RETURNING id,status)");
  assert.notEqual(red,normal);
  const redRun=checked(db,'viewing-update-zero-red',`SET maiprop.test_disposable_database=${quote(db)};\n${red}`,0,{tap:'two-fail'});
  assert(redRun.stdout.includes('not ok  ' ) || redRun.stdout.includes('not ok '));
  assert(redRun.stdout.includes('requester cancels exactly one target viewing'));
  assert(redRun.stdout.includes('requester observes persisted cancellation'));
  checked(db,'viewing-normal',`SET maiprop.test_disposable_database=${quote(db)};\n\\i supabase/tests/viewing_create_followup_test.sql`,0,{tap:'pass'});
  const cleanup=`DO $$ BEGIN IF EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'd6250001-%') OR EXISTS(SELECT 1 FROM public.profiles WHERE user_id::text LIKE 'd6250001-%') OR EXISTS(SELECT 1 FROM public.listings WHERE id::text LIKE 'd6250002-%') OR EXISTS(SELECT 1 FROM public.viewings WHERE listing_id::text LIKE 'd6250002-%') OR EXISTS(SELECT 1 FROM public.leads WHERE listing_id::text LIKE 'd6250002-%') OR EXISTS(SELECT 1 FROM public.notifications WHERE user_id::text LIKE 'd6250001-%') OR EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE 'd6250004-%') OR EXISTS(SELECT 1 FROM public.organization_memberships WHERE user_id::text LIKE 'd6250001-%') THEN RAISE EXCEPTION 'Synthetic residue'; END IF; IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace=pg_my_temp_schema()) OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace=pg_my_temp_schema()) THEN RAISE EXCEPTION 'Temporary residue'; END IF; END $$; SELECT 'zero synthetic and temporary residue';`;
  const composed=checked(db,'viewing-composed',`SET maiprop.test_disposable_database=${quote(db)}; SELECT pg_backend_pid() AS before_suite;\n\\i supabase/tests/viewing_create_followup_test.sql\n${cleanup}\nSELECT pg_backend_pid() AS between_suites;\n\\i supabase/tests/viewing_create_policy_test.sql\n${cleanup}\nSELECT pg_backend_pid() AS after_suites;`,0,{tap:'pass'});
  const pids=[...composed.stdout.matchAll(/^([0-9]+)$/gm)].map(m=>m[1]);
  assert(pids.length>=3 && pids[0]===pids.at(-1),'same backend');
}
function capturedProof(){
  const db='maiprop_t13_prereq_enquiry_captured_20260927';
  checked(db,'enquiry-captured-setup',readFileSync('supabase/tests/new_build_enquiry_captured_upgrade_setup.sql','utf8'));
  const before=snapshot(db,'enquiry-captured-before',enquirySnapshot);
  checked(db,'enquiry-captured-apply',enquiry);
  const after=snapshot(db,'enquiry-captured-after',enquirySnapshot);
  assert(after.routines?.length===3 && after.trigger?.length===1);
  assert(after.columns.length>before.columns.length);
  assertRejected(db,'enquiry-captured-repeat',enquiry,'unexpected_existing_current_user_owns_listing');
  assert.deepEqual(snapshot(db,'enquiry-captured-repeat-after',enquirySnapshot),after);
  checked(db,'enquiry-captured-policy-variant',`SET maiprop.test_disposable_database=${quote(db)};\n\\i supabase/tests/new_build_enquiry_captured_policy_variant.sql`,0,{tap:'pass'});
  checked(db,'enquiry-captured-task23-prerequisite',readFileSync('supabase/migrations/20260926224929_repair_open_house_listing_boundary.sql','utf8'));
  checked(db,'enquiry-captured-replay-test',`SET maiprop.test_disposable_database=${quote(db)};\n\\i supabase/tests/new_build_enquiry_replay_test.sql`,0,{tap:'pass'});
  const triggerDb='maiprop_t13_prereq_enquiry_trigger_20260927';
  checked(triggerDb,'enquiry-trigger-rollback-variant',`SET maiprop.test_disposable_database=${quote(triggerDb)};\n\\i supabase/tests/new_build_enquiry_migration_rollback_variant.sql`,0,{tap:'pass'});
}
function lintProof(){
  const oldEnquiry=spawnSync('git',['show','334cdef83cd05f202f37f9d448034b6332e0e669:'+enquiryPath],{encoding:'utf8',maxBuffer:10e6});
  assert.equal(oldEnquiry.status,0,oldEnquiry.stderr);
  const result={baseTask18:lintMigration(enquiryPath.split('/').at(-1),oldEnquiry.stdout),currentTask18:lintMigration(enquiryPath.split('/').at(-1),enquiry),currentTask7b:lintMigration(storagePath.split('/').at(-1),storage),currentTask7a:lintMigration(managedPath.split('/').at(-1),managed)};
  assert.equal(result.baseTask18.length,2);
  assert.deepEqual(result.currentTask18,[]);
  assert.deepEqual(result.currentTask7b,[]);
  assert.deepEqual(result.currentTask7a,[]);
  writeFileSync(`${out}focused-lint.json`,JSON.stringify(result,null,2));
}
function managedProof(){
  const db=dbs.managed;
  checked(db,'managed-first',managed);
  const after=snapshot(db,'managed-first-snapshot',managedSnapshot);
  assert.equal(after.indexes.filter(i=>!i.name.startsWith('task13_saved_')).length,2);
  checked(db,'managed-repeat',managed);
  assert.deepEqual(snapshot(db,'managed-repeat-snapshot',managedSnapshot),after);
  for(const [kind,index,wrong] of [
    ['personal','idx_listings_personal_management_cursor','CREATE INDEX idx_listings_personal_management_cursor ON public.listings (id);'],
    ['org','idx_listings_org_management_cursor','CREATE INDEX idx_listings_org_management_cursor ON public.listings (id);'],
  ]){
    checked(db,`managed-${kind}-setup`,`ALTER INDEX public.${index} RENAME TO task13_saved_${kind}; ${wrong}`);
    const before=snapshot(db,`managed-${kind}-before`,managedSnapshot);
    assertRejected(db,`managed-${kind}-reject`,managed,`managed_listing_index_definition_mismatch: ${index}`);
    assert.deepEqual(snapshot(db,`managed-${kind}-after`,managedSnapshot),before);
    checked(db,`managed-${kind}-restore`,`DROP INDEX public.${index}; ALTER INDEX public.task13_saved_${kind} RENAME TO ${index};`);
  }
  assert.deepEqual(snapshot(db,'managed-final-snapshot',managedSnapshot),after);
}
function compositionProof(){
  const db=dbs.viewing;
  const clean=`DO $$ BEGIN
    IF current_user<>'postgres' OR COALESCE(current_setting('request.jwt.claim.sub',true),'')<>'' OR COALESCE(current_setting('request.jwt.claims',true),'') NOT IN ('','{}') THEN RAISE EXCEPTION 'Role or JWT residue'; END IF;
    IF EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'd6250001-%') OR EXISTS(SELECT 1 FROM public.profiles WHERE user_id::text LIKE 'd6250001-%') OR EXISTS(SELECT 1 FROM public.listings WHERE id::text LIKE 'd6250002-%') OR EXISTS(SELECT 1 FROM public.viewings WHERE listing_id::text LIKE 'd6250002-%') OR EXISTS(SELECT 1 FROM public.leads WHERE listing_id::text LIKE 'd6250002-%') OR EXISTS(SELECT 1 FROM public.notifications WHERE user_id::text LIKE 'd6250001-%') OR EXISTS(SELECT 1 FROM public.organizations WHERE id::text LIKE 'd6250004-%') OR EXISTS(SELECT 1 FROM public.organization_memberships WHERE user_id::text LIKE 'd6250001-%') THEN RAISE EXCEPTION 'Synthetic residue'; END IF;
    IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace=pg_my_temp_schema()) OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace=pg_my_temp_schema()) THEN RAISE EXCEPTION 'Temporary residue'; END IF;
  END $$; SELECT 'zero role JWT synthetic and temporary residue';`;
  const r=checked(db,'viewing-composed-final',`SET maiprop.test_disposable_database=${quote(db)}; SELECT 'pid_before='||pg_backend_pid();\n\\i supabase/tests/viewing_create_followup_test.sql\n${clean}\nSELECT 'pid_between='||pg_backend_pid();\n\\i supabase/tests/viewing_create_policy_test.sql\n${clean}\nSELECT 'pid_after='||pg_backend_pid();`,0,{tap:'pass'});
  const values=[...r.stdout.matchAll(/pid_(?:before|between|after)=([0-9]+)/g)].map(m=>m[1]);
  assert.equal(values.length,3);assert(values.every(x=>x===values[0]));
  assert.equal((r.stdout.match(/zero role JWT synthetic and temporary residue/g)||[]).length,2);
  assert.equal((r.stdout.match(/^ok \d+/gm)||[]).length,89);
}
function cleanupProof(){
  const owned=[...Object.values(dbs),'maiprop_t13_prereq_enquiry_owner_20260927','maiprop_t13_prereq_enquiry_preserve_20260927','maiprop_t13_prereq_enquiry_submit_20260927','maiprop_t13_prereq_enquiry_trigger_20260927','maiprop_t13_prereq_enquiry_captured_20260927'].sort();
  const inventorySql="SELECT datname,pg_get_userbyid(datdba),(SELECT count(*) FROM pg_stat_activity a WHERE a.datname=d.datname),(SELECT count(*) FROM pg_prepared_xacts x WHERE x.database=d.datname) FROM pg_database d WHERE datname LIKE 'maiprop_t13_prereq_%' OR datname='maiprop_replay_current_20260921' ORDER BY datname";
  const query=()=>invoke(['psql','-X','-At','-v','ON_ERROR_STOP=1','-h','/var/run/postgresql','-p','5432','-d','postgres','-c',inventorySql]);
  const before=query();assert.equal(before.status,0,before.stderr);
  writeFileSync(`${out}cleanup-before.txt`,before.stdout);
  const rows=before.stdout.trim().split('\n').map(line=>line.trim().split('|'));
  assert(rows.some(r=>r[0]==='maiprop_replay_current_20260921' && r[1]==='postgres' && r[2]==='0' && r[3]==='0'));
  assert.deepEqual(rows.filter(r=>r[0].startsWith('maiprop_t13_prereq_')).map(r=>r[0]).sort(),owned);
  for(const row of rows)assert(row[1]==='postgres' && row[2]==='0' && row[3]==='0',row.join('|'));
  for(const name of owned){
    const r=invoke(['dropdb','-h','/var/run/postgresql','-p','5432',name]);
    assert.equal(r.status,0,`${name}: ${r.stderr}`);
  }
  const after=query();assert.equal(after.status,0,after.stderr);
  writeFileSync(`${out}cleanup-after.txt`,after.stdout);
  assert.equal(after.stdout.trim(),'maiprop_replay_current_20260921|postgres|0|0');
}

const old=spawnSync('git',['show','334cdef83cd05f202f37f9d448034b6332e0e669:'+storagePath],{encoding:'utf8',maxBuffer:10e6});
assert.equal(old.status,0,old.stderr);
const oldStorage=old.stdout;
manifest.sources['base:'+storagePath]=sha(oldStorage);
assert(!oldStorage.includes("pg_get_expr(d.adbin,d.adrelid)='true')"));
try {
  if(process.argv[2]==='resume'){
    enquiryContinue(); console.log('enquiry proof passed');
    viewingProof(); console.log('viewing proof passed');
  } else if(process.argv[2]==='captured'){
    capturedProof(); console.log('captured enquiry proof passed');
  } else if(process.argv[2]==='lint'){
    lintProof(); console.log('focused candidate lint proof passed');
  } else if(process.argv[2]==='composition'){
    compositionProof(); console.log('final same-backend composition passed');
  } else if(process.argv[2]==='managed'){
    managedProof(); console.log('managed indexes proof passed');
  } else if(process.argv[2]==='cleanup'){
    cleanupProof(); console.log('all nine owned databases removed; immutable template remains');
  } else {
    storageProof(); console.log('storage proof passed');
    enquiryStart(); console.log('enquiry initial proof passed');
    enquiryContinue(); console.log('enquiry proof passed');
    viewingProof(); console.log('viewing proof passed');
  }
} finally {
  manifest.runs=readdirSync(`${dir}db`).filter(f=>f.startsWith('task-13-local-prerequisites-') && f.endsWith('.exit')).sort().map(f=>{
    const label=f.slice('task-13-local-prerequisites-'.length,-'.exit'.length);
    const stdout=readFileSync(`${dir}db/${f.slice(0,-5)}.stdout`,'utf8');
    return {label,exit:Number(readFileSync(`${dir}db/${f}`,'utf8')),ok:(stdout.match(/^ok \d+/gm)||[]).length,notOk:(stdout.match(/^not ok \d+/gm)||[]).length,stdout:`${dir}db/${f.slice(0,-5)}.stdout`,stderr:`${dir}db/${f.slice(0,-5)}.stderr`};
  });
  writeFileSync(`${out}manifest.json`,JSON.stringify(manifest,null,2));
}
