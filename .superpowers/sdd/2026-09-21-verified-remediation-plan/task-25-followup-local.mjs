import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
export const dir='.superpowers/sdd/2026-09-21-verified-remediation-plan';
export const db=process.env.TASK25_LOCAL_DATABASE??'maiprop_t25_followup_20260927';
if(!['maiprop_t25_followup_20260927','maiprop_t25_source_followup_20260927'].includes(db))throw Error('Named local Task25 database required');
export const root='/mnt/c/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/';
export function sql(q,label,expected=0){
 const file=`${dir}/db/task-25-followup-${label}.sql`;writeFileSync(file,q);
 const r=spawnSync('wsl.exe',['-d','Ubuntu','-u','postgres','--','psql','-X','-At','-v','ON_ERROR_STOP=1','-d',db,'-f',root+file],{encoding:'utf8',maxBuffer:20e6});
 for(const [ext,value] of Object.entries({stdout:r.stdout,stderr:r.stderr,exit:String(r.status)}))writeFileSync(`${dir}/db/task-25-followup-${label}.${ext}`,value);
 console.log(label,r.status,r.stdout.slice(-500),r.stderr.slice(-900));
 if(r.status!==expected || /not ok \d/.test(r.stdout))throw Error(label+' failed');return r.stdout;
}
export const migration=readFileSync('supabase/migrations/20260924130000_restore_viewing_create_visibility.sql','utf8');
export const metadata=readFileSync(`${dir}/db/task-13-d6-viewing-create-probe-metadata.sql`,'utf8').replace("'51f6a9d1 (viewing domain unchanged)'","'9e08dca302621f45eb5b377a43bda21eeb1951e1 + Task25 candidate syntax correction'").replace("'authoritative_role',","'can_request_viewing_for_listing','has_org_permission','get_listing_reference_catalogue','authoritative_role',").replace("'access',json_build_object", "'schemas',(SELECT json_agg(json_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl) ORDER BY nspname) FROM pg_namespace WHERE nspname IN ('public','private')), 'access',json_build_object");
if(process.argv[1]?.endsWith('task-25-followup-local.mjs') && process.argv[2]==='prepare'){
 sql(metadata,'before');
 sql(migration,'apply');
 sql(metadata,'after');
}
