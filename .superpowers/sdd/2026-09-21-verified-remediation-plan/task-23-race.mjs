import {fixture,actor,sql,db} from './task-23-local.mjs';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const l="'d1131002-0000-4000-8000-000000000001'";
const offer=n=>`(SELECT id FROM public.open_house_offers WHERE listing_id=${l} AND bidder_id='d1131001-0000-4000-8000-00000000000${n}')`;
const args=['-d','Ubuntu','-u','postgres','--','psql','-X','-v','ON_ERROR_STOP=1','-d',db];
const dir='.superpowers/sdd/2026-09-21-verified-remediation-plan/db';
function run(query,label,onText,keepInputOpen=false){
 writeFileSync(`${dir}/task-23-${label}.sql`,query);
 const start=Date.now(),p=spawn('wsl.exe',args,{stdio:['pipe','pipe','pipe']});let out='',err='';
 p.stdout.on('data',data=>{out+=data;onText?.(out);});p.stderr.on('data',data=>err+=data);
 if(keepInputOpen)p.stdin.write(query);else p.stdin.end(query);
 const done=new Promise(resolve=>p.on('close',code=>{const r={code,processElapsedMs:Date.now()-start,stdout:out,stderr:err};writeFileSync(`${dir}/task-23-${label}.json`,JSON.stringify(r,null,2));resolve(r);}));
 return {process:p,done};
}
let a,b;
let released=false;
const lifecycle=[];
try {
 const sourcePaths=['.superpowers/sdd/2026-09-21-verified-remediation-plan/task-23-race.mjs','supabase/migrations/20260926224929_repair_open_house_listing_boundary.sql'];
 writeFileSync(`${dir}/task-23-race-fix1-bindings.json`,JSON.stringify({base:'a6e2f69324b89143eb2048cf27c494512a4f4810',node:process.version,sources:sourcePaths.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}))},null,2));
 sql(`SELECT current_database(),version(),md5(pg_get_functiondef('public.accept_open_house_offer(uuid)'::regprocedure)) AS accept_definition_md5;`,'race-fix1-effective-definition');
 sql(fixture+actor(2)+`SELECT public.submit_open_house_offer(${l},210000,NULL,'EUR');`+actor(3)+`SELECT public.submit_open_house_offer(${l},220000,NULL,'EUR');`+actor(1)+`UPDATE public.open_house_settings SET offer_deadline=now()-interval '1 hour'; UPDATE public.open_house_offers SET status='revealed'; COMMIT;`,'race-fix1-setup');
 let unlock;const ready=new Promise(resolve=>unlock=resolve);
 a=run(`\\set VERBOSITY verbose\nSET application_name='task23_fix1_accept_a'; BEGIN; SET LOCAL statement_timeout='15s'; SET LOCAL idle_in_transaction_session_timeout='20s'; ${actor(1)} SELECT public.accept_open_house_offer(${offer(2)}); SELECT json_build_object('barrier','A_LOCK_HELD','pid',pg_backend_pid());\n`,'race-fix1-a',text=>{const line=text.split('\n').map(x=>x.trim()).find(x=>x.startsWith('{')&&x.includes('A_LOCK_HELD'));if(line)unlock(JSON.parse(line));},true);
 let readyTimer;
 const readyInfo=await Promise.race([ready,new Promise((_,reject)=>{readyTimer=setTimeout(()=>reject(Error('race A ready timeout')),10000);})]).finally(()=>clearTimeout(readyTimer));
 lifecycle.push({event:'A accepted and remains uncommitted',pid:readyInfo.pid,at:new Date().toISOString()});
 let contenderReady;const contenderStarted=new Promise(resolve=>contenderReady=resolve);
 b=run(`\\set VERBOSITY verbose\nSET application_name='task23_fix1_accept_b'; BEGIN; SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='12s'; SELECT json_build_object('barrier','B_BACKEND_READY','pid',pg_backend_pid()); ${actor(1)} SELECT public.accept_open_house_offer(${offer(3)}); COMMIT;`,'race-fix1-b',text=>{const line=text.split('\n').map(x=>x.trim()).find(x=>x.startsWith('{')&&x.includes('B_BACKEND_READY'));if(line)contenderReady(JSON.parse(line));});
 let bTimer;
 const bInfo=await Promise.race([contenderStarted,new Promise((_,reject)=>{bTimer=setTimeout(()=>reject(Error('race B ready timeout')),10000);})]).finally(()=>clearTimeout(bTimer));
 lifecycle.push({event:'B backend identified before observer',pid:bInfo.pid,at:new Date().toISOString()});
 const observedPair=`FROM pg_stat_activity a JOIN pg_stat_activity b ON b.datname=a.datname
 WHERE a.datname=current_database() AND a.application_name='task23_fix1_accept_a' AND a.pid=${readyInfo.pid}
 AND b.application_name='task23_fix1_accept_b' AND a.state='idle in transaction' AND b.state='active'
 AND b.wait_event_type='Lock' AND a.pid=ANY(pg_blocking_pids(b.pid))
 AND b.query LIKE '%public.accept_open_house_offer%'`;
 const observed=sql(`SET statement_timeout='10s';
 DO $barrier$ DECLARE deadline timestamptz:=clock_timestamp()+interval '8 seconds'; BEGIN
 LOOP
   PERFORM pg_stat_clear_snapshot();
   EXIT WHEN EXISTS(SELECT 1 ${observedPair});
   IF clock_timestamp()>=deadline THEN RAISE EXCEPTION 'contender_backend_wait_not_observed'; END IF;
   PERFORM pg_sleep(0.05);
 END LOOP;
 END $barrier$;
 SELECT json_build_object('a_pid',a.pid,'b_pid',b.pid,'a_state',a.state,'b_state',b.state,
 'wait_event_type',b.wait_event_type,'wait_event',b.wait_event,'blocking_pids',pg_blocking_pids(b.pid),
 'a_xact_start',a.xact_start,'b_query_start',b.query_start,'observed_at',clock_timestamp(),
 'locks',(SELECT json_agg(json_build_object('pid',k.pid,'locktype',k.locktype,'transactionid',k.transactionid,'classid',k.classid,'objid',k.objid,'objsubid',k.objsubid,'mode',k.mode,'granted',k.granted)) FROM pg_locks k WHERE k.pid IN (a.pid,b.pid) ))
 ${observedPair};`,'race-fix1-blocking-observation');
 const observationLine=observed.split('\n').map(x=>x.trim()).find(x=>x.startsWith('{')&&x.includes('blocking_pids'));
 if(!observationLine)throw Error('No persisted backend blocking observation');
 const observation=JSON.parse(observationLine);
 if(observation.a_pid!==readyInfo.pid||!observation.blocking_pids.includes(readyInfo.pid))throw Error('Wrong backend blocker');
 lifecycle.push({event:'B observed blocked by A; A still uncommitted',...observation});
 // This is the only successful release. Process startup duration is not evidence.
 lifecycle.push({event:'Observer passed; sending COMMIT to A',at:new Date().toISOString()});
 writeFileSync(`${dir}/task-23-race-fix1-release.sql`,'COMMIT;\n');
 a.process.stdin.end('COMMIT;\n');released=true;
 const [ra,rb]=await Promise.all([a.done,b.done]);
 if(ra.code!==0||rb.code!==3||!rb.stderr.includes('P0001: only_revealed_offers_can_be_accepted'))throw Error('Race did not establish intended serialization');
 lifecycle.push({event:'Both sessions disconnected',aExit:ra.code,bExit:rb.code,at:new Date().toISOString()});
 sql(`SELECT count(*) AS remaining_named_race_sessions FROM pg_stat_activity WHERE datname=current_database() AND application_name IN ('task23_fix1_accept_a','task23_fix1_accept_b');
 DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name IN ('task23_fix1_accept_a','task23_fix1_accept_b')) THEN RAISE EXCEPTION 'race_session_not_disconnected'; END IF; END $$;`,'race-fix1-disconnect');
 sql(`BEGIN; CREATE EXTENSION IF NOT EXISTS pgtap; SELECT plan(5);
 SELECT is((SELECT count(*)::int FROM public.open_house_offers WHERE listing_id=${l} AND status='accepted'),1,'one winner after competing accepts');
 SELECT is((SELECT count(*)::int FROM public.open_house_offers WHERE listing_id=${l} AND status='rejected'),1,'one rejected rival, no partial mutation');
 SELECT is((SELECT status::text FROM public.listings WHERE id=${l}),'paused','listing paused consistently');
 SELECT is((SELECT count(*)::int FROM public.open_house_offers WHERE listing_id=${l} AND decided_by='d1131001-0000-4000-8000-000000000001' AND decided_at IS NOT NULL),2,'host decisions complete');
 SELECT is((SELECT count(*)::int FROM public.notifications WHERE user_id::text LIKE 'd1131001-%' AND type='open_house_offer' AND title IN ('Open house bid accepted','Open house bid not selected')),2,'one transition notification per decision');
 SELECT * FROM finish(); ROLLBACK;`,'race-fix1-state');
} finally {
 if(a&&!released){a.process.stdin.end('ROLLBACK;\n');await a.done;}
 if(b)await b.done;
 writeFileSync(`${dir}/task-23-race-fix1-lifecycle.json`,JSON.stringify(lifecycle,null,2));
 sql(`BEGIN; SET LOCAL session_replication_role=replica;
 DELETE FROM public.notifications WHERE user_id::text LIKE 'd1131001-%';
 DELETE FROM public.open_house_offers WHERE listing_id=${l}; DELETE FROM public.open_house_registrations WHERE listing_id=${l};
 DELETE FROM public.open_house_settings WHERE listing_id=${l}; DELETE FROM public.listings WHERE id=${l};
 DELETE FROM public.profiles WHERE user_id::text LIKE 'd1131001-%'; DELETE FROM auth.users WHERE id::text LIKE 'd1131001-%'; COMMIT;
 SELECT jsonb_build_object('users',(SELECT count(*) FROM auth.users WHERE id::text LIKE 'd1131001-%'),'offers',(SELECT count(*) FROM public.open_house_offers WHERE listing_id=${l}),'registrations',(SELECT count(*) FROM public.open_house_registrations WHERE listing_id=${l}),'notifications',(SELECT count(*) FROM public.notifications WHERE user_id::text LIKE 'd1131001-%')) AS cleanup;
 DO $$ BEGIN IF EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'd1131001-%') OR EXISTS(SELECT 1 FROM public.open_house_offers WHERE listing_id=${l}) OR EXISTS(SELECT 1 FROM public.open_house_registrations WHERE listing_id=${l}) OR EXISTS(SELECT 1 FROM public.notifications WHERE user_id::text LIKE 'd1131001-%') THEN RAISE EXCEPTION 'race_fixture_residue'; END IF; END $$;`,'race-fix1-cleanup');
}

