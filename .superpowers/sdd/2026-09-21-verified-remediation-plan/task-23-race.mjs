import {fixture,actor,sql,db} from './task-23-local.mjs';
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const l="'d1131002-0000-4000-8000-000000000001'";
const offer=n=>`(SELECT id FROM public.open_house_offers WHERE listing_id=${l} AND bidder_id='d1131001-0000-4000-8000-00000000000${n}')`;
const args=['-d','Ubuntu','-u','postgres','--','psql','-X','-v','ON_ERROR_STOP=1','-d',db];
const dir='.superpowers/sdd/2026-09-21-verified-remediation-plan/db';
function run(query,label,onText){
 writeFileSync(`${dir}/task-23-${label}.sql`,query);
 const start=Date.now(),p=spawn('wsl.exe',args,{stdio:['pipe','pipe','pipe']});let out='',err='';
 p.stdout.on('data',data=>{out+=data;onText?.(out);});p.stderr.on('data',data=>err+=data);p.stdin.end(query);
 return new Promise(resolve=>p.on('close',code=>{const r={code,elapsedMs:Date.now()-start,stdout:out,stderr:err};writeFileSync(`${dir}/task-23-${label}.json`,JSON.stringify(r,null,2));resolve(r);}));
}
try {
 sql(fixture+actor(2)+`SELECT public.submit_open_house_offer(${l},210000,NULL,'EUR');`+actor(3)+`SELECT public.submit_open_house_offer(${l},220000,NULL,'EUR');`+actor(1)+`UPDATE public.open_house_settings SET offer_deadline=now()-interval '1 hour'; UPDATE public.open_house_offers SET status='revealed'; COMMIT;`,'race-setup');
 let unlock;const ready=new Promise(resolve=>unlock=resolve);
 const a=run(`\\set VERBOSITY verbose\nBEGIN; SET LOCAL statement_timeout='10s'; ${actor(1)} SELECT public.accept_open_house_offer(${offer(2)}); SELECT 'LOCK_HELD'; SELECT pg_sleep(2); COMMIT;`,'race-a',text=>{if(text.includes('LOCK_HELD'))unlock();});
 await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('race A ready timeout')),10000))]);
 const b=run(`\\set VERBOSITY verbose\nBEGIN; SET LOCAL statement_timeout='8s'; ${actor(1)} SELECT public.accept_open_house_offer(${offer(3)}); COMMIT;`,'race-b');
 const [ra,rb]=await Promise.all([a,b]);
 if(ra.code!==0||rb.code!==3||!rb.stderr.includes('only_revealed_offers_can_be_accepted')||rb.elapsedMs<1000)throw Error('Race did not establish intended serialization');
 sql(`BEGIN; CREATE EXTENSION IF NOT EXISTS pgtap; SELECT plan(5);
 SELECT is((SELECT count(*)::int FROM public.open_house_offers WHERE listing_id=${l} AND status='accepted'),1,'one winner after competing accepts');
 SELECT is((SELECT count(*)::int FROM public.open_house_offers WHERE listing_id=${l} AND status='rejected'),1,'one rejected rival, no partial mutation');
 SELECT is((SELECT status::text FROM public.listings WHERE id=${l}),'paused','listing paused consistently');
 SELECT is((SELECT count(*)::int FROM public.open_house_offers WHERE listing_id=${l} AND decided_by='d1131001-0000-4000-8000-000000000001' AND decided_at IS NOT NULL),2,'host decisions complete');
 SELECT is((SELECT count(*)::int FROM public.notifications WHERE user_id::text LIKE 'd1131001-%' AND type='open_house_offer' AND title IN ('Open house bid accepted','Open house bid not selected')),2,'one transition notification per decision');
 SELECT * FROM finish(); ROLLBACK;`,'race-state');
} finally {
 sql(`BEGIN; SET LOCAL session_replication_role=replica;
 DELETE FROM public.notifications WHERE user_id::text LIKE 'd1131001-%';
 DELETE FROM public.open_house_offers WHERE listing_id=${l}; DELETE FROM public.open_house_registrations WHERE listing_id=${l};
 DELETE FROM public.open_house_settings WHERE listing_id=${l}; DELETE FROM public.listings WHERE id=${l};
 DELETE FROM public.profiles WHERE user_id::text LIKE 'd1131001-%'; DELETE FROM auth.users WHERE id::text LIKE 'd1131001-%'; COMMIT;
 SELECT jsonb_build_object('users',(SELECT count(*) FROM auth.users WHERE id::text LIKE 'd1131001-%'),'offers',(SELECT count(*) FROM public.open_house_offers WHERE listing_id=${l}),'registrations',(SELECT count(*) FROM public.open_house_registrations WHERE listing_id=${l}),'notifications',(SELECT count(*) FROM public.notifications WHERE user_id::text LIKE 'd1131001-%')) AS cleanup;`,'race-cleanup');
}

