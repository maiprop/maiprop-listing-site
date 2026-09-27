import {readFileSync,writeFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
import {sql,dir,db} from './task-25-followup-local.mjs';
const id=(kind,n)=>`d625000${kind}-0000-4000-8000-${String(n).padStart(12,'0')}`;
const guard=`DO $$ BEGIN IF current_database()<>'${db}' OR inet_server_addr() IS NOT NULL THEN RAISE EXCEPTION 'Named local disposable target required'; END IF; END $$;`;
if(process.argv[2]==='prepare'){
 const original=readFileSync('supabase/tests/viewing_create_policy_test.sql','utf8');
 const seed='BEGIN;'+original.split('SET LOCAL session_replication_role = replica;')[1].split("SELECT set_config('request.jwt.claim.sub'")[0];
 sql(guard+seed.replace('BEGIN;','BEGIN; SET LOCAL session_replication_role=replica;')+'COMMIT;','http-fixture');
 writeFileSync(dir+'/db/task-25-followup-rest.conf',readFileSync(dir+'/db/postgrest.conf','utf8').replace('maiprop_professionals_http_20260921',db).replace('54339','54345'));
}else{
 const key=JSON.parse(readFileSync(dir+'/db/rest-test-key.json','utf8')).jwtSecret;
 const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const token=n=>{const raw=enc({alg:'HS256',typ:'JWT'})+'.'+enc({role:'authenticated',sub:id(1,n),exp:Math.floor(Date.now()/1000)+600});return raw+'.'+createHmac('sha256',key).update(raw).digest('base64url');};
 const results=[];
 async function req(label,path,actor,body,single=false){
  const r=await fetch('http://127.0.0.1:54345'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token(actor),'Content-Type':'application/json',Prefer:'return=representation',...(single?{Accept:'application/vnd.pgrst.object+json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const text=await r.text();const result={label,status:r.status,body:text?JSON.parse(text):null};results.push(result);return result;
 }
 try{
  const payload={listing_id:id(2,1),owner_id:id(1,1),requester_id:id(1,2),viewing_type:'in_person',scheduled_at:'2026-12-15T12:30:00Z',note:'Task25 HTTP exact note'};
  const r=await req('insert select single six-field payload','/viewings?select=*',2,payload,true);
  assert.equal(r.status,201);for(const k of ['listing_id','owner_id','requester_id','viewing_type','note'])assert.equal(r.body[k],payload[k]);assert.equal(Date.parse(r.body.scheduled_at),Date.parse(payload.scheduled_at));assert.equal(r.body.status,'pending');assert.equal(typeof r.body.id,'string');assert.equal(Object.keys(r.body).length,11);
  const read=await req('owner participant read','/viewings?select=*&id=eq.'+r.body.id,1);assert.equal(read.status,200);assert.equal(read.body.length,1);
  const columns='id,owner_id,organization_id,project_id,title,city,address,cover_image_url,listing_type,is_pre_sale,price,sqm,views_count,status';
  const reference=await req('existing fixed reference projection','/rpc/get_listing_reference_catalogue?select='+columns+'&id=in.('+payload.listing_id+')',2,{});assert.equal(reference.status,200);assert.equal(reference.body.length,1);assert.deepEqual(Object.keys(reference.body[0]).sort(),columns.split(',').sort());
  sql(guard+`UPDATE public.listings SET status='paused',is_off_market=true WHERE id='${payload.listing_id}';`,'http-pause');
  const retained=await req('existing participant private paused reference','/rpc/get_listing_reference_catalogue?select='+columns+'&id=in.('+payload.listing_id+')',2,{});assert.equal(retained.status,200);assert.equal(retained.body.length,1);
  const outsider=await req('unrelated new private request denied','/viewings?select=*',3,{...payload,requester_id:id(1,3)},true);assert.equal(outsider.status,403);assert.equal(outsider.body.code,'42501');
  const raw=await req('raw listing select denied','/listings?select=id,owner_id',2);assert.equal(raw.status,403);assert.equal(raw.body.code,'42501');
  console.log('Six local HTTP representation/read/reference/privacy checks passed');
 }finally{
  writeFileSync(dir+'/db/task-25-followup-http-results.json',JSON.stringify(results,null,2));
  sql(guard+`SELECT row_to_json(v) FROM public.viewings v WHERE listing_id::text LIKE 'd6250002-%'; SELECT row_to_json(l) FROM public.leads l WHERE listing_id::text LIKE 'd6250002-%'; SELECT row_to_json(n) FROM public.notifications n WHERE user_id::text LIKE 'd6250001-%'; BEGIN; SET LOCAL session_replication_role=replica; DELETE FROM public.notifications WHERE user_id::text LIKE 'd6250001-%'; DELETE FROM public.leads WHERE listing_id::text LIKE 'd6250002-%'; DELETE FROM public.viewings WHERE listing_id::text LIKE 'd6250002-%'; DELETE FROM public.organization_memberships WHERE user_id::text LIKE 'd6250001-%'; DELETE FROM public.organizations WHERE id::text LIKE 'd6250004-%'; DELETE FROM public.listings WHERE id::text LIKE 'd6250002-%'; DELETE FROM public.profiles WHERE user_id::text LIKE 'd6250001-%'; DELETE FROM auth.users WHERE id::text LIKE 'd6250001-%'; COMMIT;`,'http-cleanup');
 }
}
