import {spawnSync} from 'node:child_process';
import {writeFileSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const dir='.superpowers/sdd/2026-09-21-verified-remediation-plan/db';
const database=process.argv[2],label=process.argv[3];
if(!['maiprop_t23_impl_0927','maiprop_t23_selected_0927','maiprop_t23_http_0927'].includes(database))throw Error('Invalid local database');
const query=`SELECT jsonb_build_object(
'routines',(SELECT jsonb_agg(x ORDER BY signature) FROM (SELECT p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner) owner,p.prosecdef security_definer,p.provolatile volatility,p.proconfig settings,p.proacl::text acl,md5(p.prosrc) body_md5,md5(pg_get_functiondef(p.oid)) definition_md5,pg_get_functiondef(p.oid) definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.proname IN ('current_user_owns_listing','can_read_open_house_settings','guard_open_house_offer_mutation','guard_open_house_registration_update','accept_open_house_offer','submit_open_house_offer','reopen_open_house_offer_selection','get_open_house_listing_context','get_admin_open_house_pof_reviews','review_admin_open_house_pof','notify_open_house_pof_status_change','can_select_open_house_document','check_open_house_rsvp_monthly_limit','has_platform_admin','authoritative_role')) x),
'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public' AND tablename IN ('open_house_settings','open_house_registrations','open_house_offers')),
'relations',(SELECT jsonb_agg(x ORDER BY relation) FROM (SELECT c.oid::regclass::text relation,c.relacl::text acl,c.relrowsecurity rls FROM pg_class c WHERE c.oid IN ('public.listings'::regclass,'public.open_house_settings'::regclass,'public.open_house_registrations'::regclass,'public.open_house_offers'::regclass,'storage.objects'::regclass)) x),
'private_schema',(SELECT nspacl::text FROM pg_namespace WHERE nspname='private'),
'storage_acl',jsonb_build_object('authenticated_select',has_table_privilege('authenticated','storage.objects','SELECT'),'authenticated_schema_usage',has_schema_privilege('authenticated','storage','USAGE')));`;
const r=spawnSync('wsl.exe',['-d','Ubuntu','-u','postgres','--','psql','-X','-At','-v','ON_ERROR_STOP=1','-d',database,'-c',query],{encoding:'utf8',maxBuffer:1e7});
if(r.status)throw Error(r.stderr);const metadata=JSON.parse(r.stdout);writeFileSync(`${dir}/task-23-${label}-metadata.json`,JSON.stringify(metadata,null,2));
if(label==='selected-after'){
 const before=JSON.parse(readFileSync(`${dir}/task-23-selected-before-metadata.json`,'utf8'));
 const source=JSON.parse(readFileSync(`${dir}/task-23-source-after-metadata.json`,'utf8'));
 assert.deepEqual(metadata,source,'selected upgrade changed routines/policies/ACL match source clone');
 assert.deepEqual(before.relations,metadata.relations,'no table grants changed');assert.equal(before.private_schema,metadata.private_schema,'schema ACL unchanged');
 for(const name of ['submit_open_house_offer','check_open_house_rsvp_monthly_limit','can_select_open_house_document','has_platform_admin','authoritative_role']){
  assert.deepEqual(before.routines.find(x=>x.signature.includes(name+'(')),metadata.routines.find(x=>x.signature.includes(name+'(')),'unchanged '+name);
 }
 const oldOwner=before.routines.find(x=>x.signature.startsWith('private.current_user_owns_listing('));
 const newOwner=metadata.routines.find(x=>x.signature===oldOwner.signature);assert.equal(oldOwner.definition_md5,newOwner.definition_md5);assert.ok(newOwner.acl.includes('anon=X'));assert.ok(newOwner.acl.includes('authenticated=X'));assert.ok(newOwner.acl.includes('service_role=X'));
 writeFileSync(`${dir}/task-23-catalog-comparison.json`,JSON.stringify({matched:true,tableAndSchemaAclUnchanged:true,submitQuotaDocumentsAdminAuthorityUnchanged:true,sharedOwnerDefinitionUnchanged:true,onlySharedOwnerGrantAdded:'service_role EXECUTE'},null,2));
}
console.log(label,'captured',metadata.routines.length,'routines',metadata.policies.length,'policies');
