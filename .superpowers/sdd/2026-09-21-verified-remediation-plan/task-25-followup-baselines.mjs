import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sql,dir,migration,metadata} from './task-25-followup-local.mjs';
const before=JSON.parse(readFileSync(`${dir}/db/task-25-followup-before.stdout`,'utf8'));
const after=JSON.parse(readFileSync(`${dir}/db/task-25-followup-after.stdout`,'utf8'));
const quote=s=>'"'+s.replaceAll('"','""')+'"';
const policy=p=>`CREATE POLICY ${quote(p.policyname)} ON public.${quote(p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map(quote).join(',')}${p.qual?` USING (${p.qual})`:''}${p.with_check?` WITH CHECK (${p.with_check})`:''};`;
const old=before.policies.find(p=>p.policyname==='viewings_insert');
const reset=`DROP POLICY viewings_insert ON public.viewings; DROP FUNCTION IF EXISTS private.can_request_viewing_for_listing(uuid,uuid); ${policy(old)}`;
const snap=`SELECT json_build_object('policies',(SELECT json_agg(p ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public' AND tablename IN ('listings','viewings')),'schemas',(SELECT json_agg(json_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl) ORDER BY nspname) FROM pg_namespace WHERE nspname IN ('public','private')),'helper',(SELECT json_build_object('owner',pg_get_userbyid(proowner),'acl',proacl,'config',proconfig,'definition',pg_get_functiondef(oid)) FROM pg_proc WHERE oid=to_regprocedure('private.can_request_viewing_for_listing(uuid,uuid)')),'tables',(SELECT json_agg(json_build_object('table',c.relname,'acl',c.relacl,'columns',(SELECT json_agg(json_build_object('name',attname,'acl',attacl) ORDER BY attnum) FROM pg_attribute WHERE attrelid=c.oid AND attnum>0 AND NOT attisdropped)) ORDER BY c.relname) FROM pg_class c WHERE c.oid IN ('public.listings'::regclass,'public.viewings'::regclass)));`;
function compare(b,a){
 assert.deepEqual(a.tables,b.tables);assert.deepEqual(a.triggers,b.triggers);
 assert.deepEqual(a.policies.filter(p=>p.policyname!=='viewings_insert'),b.policies.filter(p=>p.policyname!=='viewings_insert'));
 for(const r of b.routines) assert.deepEqual(a.routines.find(x=>x.signature===r.signature),r);
}
compare(before,after);
const sha=s=>createHash('sha256').update(s).digest('hex');
const norm=s=>s.replace(/\r\n/g,'\n').trim();
const sources=readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).map(file=>({file,text:readFileSync('supabase/migrations/'+file,'utf8')}));
const binding=after.routines.map(r=>{const matches=sources.filter(s=>norm(s.text).includes(norm(r.body)));if(r.schema!=='auth')assert(matches.length,r.signature);return {signature:r.signature,effective_sha256:sha(r.body),sources:matches.map(s=>({file:s.file,raw_sha256:sha(s.text)}))};});
writeFileSync(`${dir}/db/task-25-followup-source-binding.json`,JSON.stringify(binding,null,2));
sql(reset,'restore-before-drift');
for(const [name,mutate,restore,error] of [
 ['null',`DROP POLICY viewings_insert ON public.viewings; CREATE POLICY viewings_insert ON public.viewings FOR INSERT TO authenticated;`,`DROP POLICY viewings_insert ON public.viewings; ${policy(old)}`,'unsupported_viewings_insert_policy'],
 ['overlap',`CREATE POLICY task25_overlap ON public.viewings FOR ALL TO authenticated USING(true) WITH CHECK(true);`,`DROP POLICY task25_overlap ON public.viewings;`,'unsupported_viewings_complete_policy_set'],
 ['role',`ALTER POLICY viewings_insert ON public.viewings TO anon;`,`ALTER POLICY viewings_insert ON public.viewings TO authenticated;`,'unsupported_viewings_insert_policy'],
 ['command',`DROP POLICY viewings_insert ON public.viewings; CREATE POLICY viewings_insert ON public.viewings FOR UPDATE TO authenticated USING(true);`,`DROP POLICY viewings_insert ON public.viewings; ${policy(old)}`,'unsupported_viewings_insert_policy_overlap'],
 ['collision',`CREATE FUNCTION private.can_request_viewing_for_listing(uuid,uuid) RETURNS boolean LANGUAGE sql AS 'SELECT false';`,`DROP FUNCTION private.can_request_viewing_for_listing(uuid,uuid);`,'unexpected_existing_can_request_viewing_for_listing'],
 ['listing',`ALTER POLICY listings_select_authenticated ON public.listings USING(true);`,`ALTER POLICY listings_select_authenticated ON public.listings USING (${before.policies.find(p=>p.policyname==='listings_select_authenticated').qual});`,'unsupported_listings_authenticated_select_policy']
]){
 sql(mutate,'drift-'+name+'-setup');const b=JSON.parse(sql(snap,'drift-'+name+'-before'));
 sql(migration,'drift-'+name+'-reject',3);
 assert(readFileSync(`${dir}/db/task-25-followup-drift-${name}-reject.stderr`,'utf8').includes(error));
 const a=JSON.parse(sql(snap,'drift-'+name+'-after'));assert.deepEqual(a,b,'atomic drift '+name);
 sql(restore,'drift-'+name+'-restore');
}
// Only these two captured tables/policies/ACLs are reproduced. PostgreSQL16
// cannot represent the PostgreSQL17 MAINTAIN bit (m); omit it explicitly.
let fixture='BEGIN;\n';
const codes={a:'INSERT',r:'SELECT',w:'UPDATE',d:'DELETE',D:'TRUNCATE',x:'REFERENCES',t:'TRIGGER'};
for(const [file,name] of [['live-a6-mutation-tables','viewings'],['live-a6-tables','listings']]){
 const record=JSON.parse(readFileSync(`${dir}/${file}.json`,'utf8')).rows.find(r=>r.name===name);assert(record);
 for(const p of before.policies.filter(p=>p.tablename===name))fixture+=`DROP POLICY ${quote(p.policyname)} ON public.${name};\n`;
 for(const p of record.policies)fixture+=policy(p)+'\n';
 fixture+=`REVOKE ALL ON public.${name} FROM PUBLIC,anon,authenticated,service_role;\n`;
 for(const item of record.acl.slice(1,-1).split(',')){
  const [grantee,rights]=item.split('=');const privileges=[...rights.split('/')[0]].filter(c=>c!=='m').map(c=>{assert(codes[c]);return codes[c];});
  if(privileges.length)fixture+=`GRANT ${privileges.join(',')} ON public.${name} TO ${quote(grantee)};\n`;
 }
 for(const c of record.columns)assert.equal(c.acl,null,'captured column ACL is null');
}
fixture+='COMMIT;';sql(fixture,'captured-fixture');
const capturedBefore=JSON.parse(sql(snap,'captured-before'));
sql(migration,'captured-apply');
const capturedAfter=JSON.parse(sql(snap,'captured-after'));
assert.deepEqual(capturedAfter.tables,capturedBefore.tables);assert.deepEqual(capturedAfter.schemas,capturedBefore.schemas);
assert.deepEqual(capturedAfter.policies.filter(p=>p.policyname!=='viewings_insert'),capturedBefore.policies.filter(p=>p.policyname!=='viewings_insert'));
writeFileSync(`${dir}/db/task-25-followup-baseline-results.json`,JSON.stringify({source_preserved:true,atomic_rejections:6,captured_inputs:['live-a6-mutation-tables.json','live-a6-tables.json'],captured_acl_preserved:true,omitted_pg17_privilege:'MAINTAIN',scope:'bounded captured policy/table ACL fixture; not managed schema or live parity'},null,2));
console.log('Source preservation, six atomic rejections and bounded captured ACL preservation passed');
