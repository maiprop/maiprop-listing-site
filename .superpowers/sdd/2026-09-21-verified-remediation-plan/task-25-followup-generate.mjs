import {readFileSync,writeFileSync} from 'node:fs';
import {sql,dir} from './task-25-followup-local.mjs';
const u=n=>`d6250001-0000-4000-8000-${String(n).padStart(12,'0')}`;
const l=n=>`d6250002-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=(n,role='authenticated')=>`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${n?u(n):''}',true),set_config('request.jwt.claims','${JSON.stringify({role,...(n?{sub:u(n)}:{})})}',true); SET LOCAL ROLE ${role};\nSELECT current_user,auth.uid(),current_setting('session_replication_role');\n`;
const insert=(n=1,owner=1,requester=2,returning=true)=>`INSERT INTO public.viewings(listing_id,owner_id,requester_id,viewing_type,scheduled_at,note) VALUES (${n===null?'NULL':`'${l(n)}'`},${owner===null?'NULL':`'${u(owner)}'`},'${u(requester)}','in_person','2026-12-15 12:30:00+00','Task25 exact note')${returning?' RETURNING *':''}`;
const esc=s=>s.replaceAll("'","''");
const assertion=(expr,label)=>`SELECT ok(${expr},'${esc(label)}');\n`;
const success=(q,label)=>`SELECT lives_ok($action$${q}$action$,'${esc(label)}');\n`;
const denied=(q,code,msg,label,hint='')=>`SELECT is(pg_temp.action_error($action$${q}$action$),jsonb_build_object('state','${code}','message','${esc(msg)}','hint','${esc(hint)}','role',current_user),'${esc(label)}');\n`;
let out=`\\set ON_ERROR_STOP on
\\pset pager off
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT no_plan();
-- Synthetic prerequisites only. All viewing actions retain origin triggers.
`+readFileSync('supabase/tests/viewing_create_policy_test.sql','utf8').split('SET LOCAL session_replication_role = replica;')[1].split("SELECT set_config('request.jwt.claim.sub'")[0].replace(/^/,'SET LOCAL session_replication_role = replica;');
out+=`CREATE FUNCTION pg_temp.action_error(q text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE s text;m text;h text;
BEGIN EXECUTE q; RETURN jsonb_build_object('unexpected_success',true);
EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS s=RETURNED_SQLSTATE,m=MESSAGE_TEXT,h=PG_EXCEPTION_HINT;
RETURN jsonb_build_object('state',s,'message',m,'hint',h,'role',current_user); END $$;
`;
out+=`CREATE TEMP TABLE before_counts AS SELECT (SELECT count(*) FROM public.viewings) v,(SELECT count(*) FROM public.leads) l,(SELECT count(*) FROM public.notifications) n;
`;
const unchanged=()=>`RESET ROLE; SELECT ok((SELECT v=(SELECT count(*) FROM public.viewings) AND l=(SELECT count(*) FROM public.leads) AND n=(SELECT count(*) FROM public.notifications) FROM before_counts),'denied action leaves viewing lead notification counts unchanged');\n`;
const policyError='new row violates row-level security policy for table "viewings"';
for(const [label,n,owner,requester,who,role] of [
 ['wrong owner',1,3,2,2],['missing listing',99,1,2,2],['NULL listing',null,1,2,2],['NULL owner',1,null,2,2],['spoofed requester',1,1,3,2],['no subject',1,1,2,null],['anon',1,1,2,null,'anon'],['paused outsider',2,1,2,2],['off-market outsider',3,1,2,2],['private org outsider',4,1,2,2]
]){out+=actor(who,role)+denied(insert(n,owner,requester),'42501',policyError,label)+unchanged();}
out+=actor(2)+assertion("has_schema_privilege(current_user,'private','USAGE') AND has_function_privilege(current_user,'private.can_request_viewing_for_listing(uuid,uuid)','EXECUTE')",'effective authenticated helper prerequisites')+denied('SELECT id,owner_id FROM public.listings','42501','permission denied for table listings','direct raw listing denied')+assertion('NOT private.can_request_viewing_for_listing(NULL,NULL)','actual-role NULL predicate false');
out+=actor(null)+assertion(`NOT private.can_request_viewing_for_listing('${l(1)}','${u(1)}')`,'actual-role missing subject false');
for(const [who,n,label] of [[1,2,'actual owner paused'],[4,4,'org listing:view member']])out+=`RESET ROLE; SAVEPOINT eligibility;\n`+actor(who)+success(insert(n,1,who),label)+`RESET ROLE; ROLLBACK TO eligibility; RELEASE eligibility;\n`;
out+=`UPDATE public.organization_memberships SET status='suspended' WHERE user_id='${u(4)}';\n`+actor(4)+denied(insert(4,1,4),'42501',policyError,'suspended org member')+unchanged();
out+=`UPDATE public.organization_memberships SET status='active' WHERE user_id='${u(4)}'; INSERT INTO public.organizations(id,name,slug,created_by) VALUES ('d6250004-0000-4000-8000-000000000002','Other tenant','task25-other','${u(3)}');\n`+actor(3)+denied(insert(4,1,3),'42501',policyError,'cross-tenant member')+unchanged();
out+=actor(5)+assertion(`NOT private.can_request_viewing_for_listing('${l(2)}','${u(1)}')`,'admin gets no helper private visibility')+success(insert(2,1,3,false),'admin outer insert without participant returning')+assertion(`(SELECT count(*)=0 FROM public.viewings WHERE listing_id='${l(2)}')`,'admin has no ordinary participant SELECT');
out+=`RESET ROLE; DELETE FROM public.viewings WHERE listing_id='${l(2)}'; DELETE FROM public.leads WHERE listing_id='${l(2)}'; DELETE FROM public.notifications WHERE user_id='${u(1)}';\n`;
out+=actor(2)+success(insert(),'under-limit exact insert returning')+assertion(`(SELECT count(*)=1 FROM public.viewings WHERE listing_id='${l(1)}' AND requester_id='${u(2)}' AND owner_id='${u(1)}' AND viewing_type='in_person' AND scheduled_at='2026-12-15 12:30:00+00' AND note='Task25 exact note' AND status='pending')`,'exact returned-row fields and requester read')+assertion(`(SELECT count(*)=1 FROM public.get_listing_reference_catalogue() WHERE id='${l(1)}' AND title='Task25 active public')`,'scoped reference current requester');
out+=`RESET ROLE; SELECT row_to_json(l) FROM public.leads l WHERE listing_id='${l(1)}'; SELECT row_to_json(n) FROM public.notifications n WHERE user_id='${u(1)}'; TRUNCATE before_counts; INSERT INTO before_counts SELECT (SELECT count(*) FROM public.viewings),(SELECT count(*) FROM public.leads),(SELECT count(*) FROM public.notifications);\n`;
out+=assertion(`(SELECT count(*)=1 FROM public.notifications WHERE user_id='${u(1)}' AND title='New viewing request' AND body='A buyer requested a in-person viewing for Task25 active public' AND type='viewing' AND link='/dashboard?tab=viewings')`,'canonical owner notification content');
out+=actor(2)+denied(insert(5),'P0001','viewing_limit_reached','requester exhaustion exact error/hint','Upgrade to Pro for more viewings per month')+unchanged();
out+=actor(2)+denied(`UPDATE public.viewings SET owner_id='${u(3)}' WHERE listing_id='${l(1)}'`,'42501','viewing identity cannot be changed','requester identity immutable')+denied(`UPDATE public.viewings SET status='confirmed' WHERE listing_id='${l(1)}'`,'42501','requesters may only cancel an active viewing request','requester cannot confirm')+denied(`UPDATE public.viewings SET note='changed' WHERE listing_id='${l(1)}'`,'42501','only the listing owner can manage viewing host details','requester cannot edit host details')+unchanged();
out+=actor(1)+assertion(`(SELECT count(*)=1 FROM public.viewings WHERE listing_id='${l(1)}')`,'owner reads created row')+denied(`UPDATE public.viewings SET status='completed' WHERE listing_id='${l(1)}'`,'42501','invalid listing-owner viewing status transition','owner cannot skip confirmation')+success(`UPDATE public.viewings SET status='pending' WHERE listing_id='${l(1)}'`,'same-status update')+unchanged();
out+=actor(1)+success(`UPDATE public.viewings SET status='confirmed' WHERE listing_id='${l(1)}'`,'owner confirms')+success(`UPDATE public.viewings SET status='completed' WHERE listing_id='${l(1)}'`,'owner completes')+denied(`UPDATE public.viewings SET status='pending' WHERE listing_id='${l(1)}'`,'42501','invalid listing-owner viewing status transition','owner cannot reopen completed');
out+=`RESET ROLE; `+assertion(`(SELECT count(*)=2 FROM public.notifications WHERE user_id='${u(2)}' AND title='Viewing status updated')`,'two status notifications to requester')+`UPDATE public.listings SET status='paused',is_off_market=true WHERE id='${l(1)}';\n`+actor(2)+assertion(`(SELECT count(*)=1 FROM public.get_listing_reference_catalogue() WHERE id='${l(1)}')`,'existing participant retains private paused reference')+assertion(`NOT private.can_request_viewing_for_listing('${l(1)}','${u(1)}')`,'reference relationship does not allow new request');
out+=actor(3)+denied(insert(1,1,3),'42501',policyError,'unrelated private paused creation denied');
out+=`RESET ROLE; SAVEPOINT cancellation;\n`+actor(4)+success(insert(5,1,4),'fresh member public request')+success(`UPDATE public.viewings SET status='cancelled' WHERE requester_id='${u(4)}'`,'requester cancels pending')+`RESET ROLE; ROLLBACK TO cancellation; RELEASE cancellation;\n`;
out+=`SAVEPOINT owner_quota; SET LOCAL session_replication_role=replica; UPDATE public.profiles SET role='agent' WHERE user_id='${u(1)}'; UPDATE public.profiles SET role='agent' WHERE user_id='${u(4)}'; SET LOCAL session_replication_role=origin; SELECT is(public.get_viewing_limit('${u(1)}',false),3,'authoritative free owner allowance'); SET LOCAL session_replication_role=origin; SELECT is(public.get_viewing_limit('${u(4)}',true),999,'separate unlimited requester allowance');\n`+actor(4)+success(insert(5,1,4),'owner allowance second hosted')+success(insert(5,1,4),'owner allowance third hosted')+`RESET ROLE; TRUNCATE before_counts; INSERT INTO before_counts SELECT (SELECT count(*) FROM public.viewings),(SELECT count(*) FROM public.leads),(SELECT count(*) FROM public.notifications);\n`+actor(4)+denied(insert(5,1,4),'P0001','viewing_limit_reached','owner exhaustion exact error/hint','Listing owner has reached viewing limit. Upgrade to Pro for more.')+unchanged()+`ROLLBACK TO owner_quota; RELEASE owner_quota;\nSELECT * FROM finish(); ROLLBACK;\n`;
out=out.replace('SELECT no_plan();',()=>`DO $$ DECLARE expected_database text:=current_setting('maiprop.test_disposable_database',true); BEGIN IF expected_database IS NULL OR expected_database='' OR expected_database<>current_database() OR inet_server_addr() IS NOT NULL OR current_database() IN ('postgres','template0','template1','maiprop_replay_current_20260921') THEN RAISE EXCEPTION 'Explicit matching disposable socket database required'; END IF; END $$; SELECT no_plan();`);
out=out.replace('SELECT row_to_json(l) FROM public.leads l',assertion(`(SELECT count(*)=1 FROM public.leads WHERE listing_id='${l(1)}' AND owner_id='${u(1)}' AND source='viewing' AND origin_context_key='listing:${l(1)}' AND name='Task25 Requester' AND email='task25-requester@example.test' AND message='Viewing request for Task25 active public (in-person)' AND status='new' AND follow_up_at='2026-12-15 12:30:00+00')`,'canonical lead identity and follow-up')+'SELECT row_to_json(l) FROM public.leads l');
out=out.replace('SELECT * FROM finish();',actor(4)+assertion(`NOT private.can_request_viewing_for_listing('${l(1)}',NULL)`,'actual-role NULL expected owner false')+`RESET ROLE; SELECT * FROM finish();`);
out=out.replaceAll('RESET ROLE;',"RESET ROLE; SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);");
// Do not roll pgTAP counters back with the isolated eligibility fixtures.
out=out.replaceAll('SAVEPOINT eligibility;','').replaceAll('ROLLBACK TO eligibility; RELEASE eligibility;',`DELETE FROM public.viewings WHERE listing_id::text LIKE 'd6250002-%'; DELETE FROM public.leads WHERE listing_id::text LIKE 'd6250002-%'; DELETE FROM public.notifications WHERE user_id::text LIKE 'd6250001-%';`);
out=out.replace('SAVEPOINT cancellation;','').replace('ROLLBACK TO cancellation; RELEASE cancellation;',`DELETE FROM public.viewings WHERE requester_id='${u(4)}'; DELETE FROM public.leads WHERE listing_id='${l(5)}';`);
out=out.replace('SAVEPOINT owner_quota;','').replace('ROLLBACK TO owner_quota; RELEASE owner_quota;','');
out=out.replace("'state','42501','message','new row violates row-level security policy for table \"viewings\"','hint','','role',current_user),'NULL owner'", "'state','P0001','message','viewing_limit_reached','hint','Listing owner has reached viewing limit. Upgrade to Pro for more.','role',current_user),'NULL owner is rejected by unchanged quota before RLS'");
out=out.replace(/[ \t]+$/gm,'');
writeFileSync('supabase/tests/viewing_create_followup_test.sql',out);
sql(`SET maiprop.test_disposable_database='${process.env.TASK25_LOCAL_DATABASE??'maiprop_t25_followup_20260927'}';\n`+out,process.argv[2]??'contract-attempt1');
