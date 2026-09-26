import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const dir='.superpowers/sdd/2026-09-21-verified-remediation-plan';
export const db=process.env.TASK23_LOCAL_DATABASE ?? 'maiprop_t23_impl_0927';
if(!['maiprop_t23_impl_0927','maiprop_t23_selected_0927'].includes(db)) throw Error('Only disposable Task23 databases permitted');
export function sql(text,label){
 if(db.includes('selected')) label='selected-'+label;
 const file=`${dir}/db/task-23-${label}.sql`; writeFileSync(file,text);
 const path='/mnt/c/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/'+file;
 const r=spawnSync('wsl.exe',['-d','Ubuntu','-u','postgres','--','psql','-X','-v','ON_ERROR_STOP=1','-d',db,'-f',path],{encoding:'utf8',maxBuffer:10e6});
 writeFileSync(`${dir}/db/task-23-${label}.log`,r.stdout+r.stderr);
 writeFileSync(`${dir}/db/task-23-${label}-status.json`,JSON.stringify({database:db,exit:r.status,failedAssertions:(r.stdout.match(/not ok \d/g)??[]).length},null,2));
 console.log(label,r.status,r.stdout.slice(-1300),r.stderr.slice(-1600));
 if(r.status!==0 || /not ok \d/.test(r.stdout)) throw Error(label+' failed');
 return r.stdout;
}
const original=readFileSync(`${dir}/db/task-23-submit-red.sql`,'utf8').replaceAll('maiprop_t23_impl_0927',db);
export const fixture=original.split("SELECT json_build_object('phase','before_offer'")[0];
export const actor=n=>`RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-${String(n).padStart(12,'0')}',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-${String(n).padStart(12,'0')}"}',true); SET LOCAL ROLE authenticated;\n`;
if(process.argv[1].endsWith('task-23-local.mjs') && process.argv[2]==='red'){
 sql(original,'submit-red');
 const checks=[
 'SELECT * FROM public.open_house_settings',
 "INSERT INTO public.open_house_settings(listing_id) VALUES ('d1131002-0000-4000-8000-000000000001') ON CONFLICT(listing_id) DO UPDATE SET broker_required=true",
 'SELECT * FROM public.open_house_registrations',
 "UPDATE public.open_house_registrations SET contact_name='changed'",
 'SELECT * FROM public.open_house_offers',
 "UPDATE public.open_house_offers SET status='revealed' WHERE status='submitted'",
 'SELECT r.*,l.title FROM public.open_house_registrations r LEFT JOIN public.listings l ON l.id=r.listing_id',
 'SELECT o.bidder_id,o.status,l.owner_id FROM public.open_house_offers o JOIN public.listings l ON l.id=o.listing_id',
 ];
 sql(fixture+actor(1)+checks.map((q,i)=>`DO $$ BEGIN BEGIN ${q.replace(/^SELECT /,'PERFORM ')}; RAISE EXCEPTION 'unexpected success'; EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM <> 'permission denied for table listings' THEN RAISE; END IF; RAISE NOTICE 'RED ${i+1}: %',SQLERRM; END; END $$;`).join('\n')+`\nRESET ROLE; UPDATE public.open_house_registrations SET status='approved',rejection_reason='ADMISSION_REASON',pof_rejection_reason='POF_REASON',pof_verified_status='rejected'; SELECT body FROM public.notifications WHERE type='pof_review'; ROLLBACK;`,'coupled-red');
}

