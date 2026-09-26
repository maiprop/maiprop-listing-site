import {readFileSync,writeFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fixture} from './task-23-local.mjs';
const dir='.superpowers/sdd/2026-09-21-verified-remediation-plan';
if(process.argv[2]==='prepare'){
 writeFileSync(dir+'/db/task-23-rest.conf',readFileSync(dir+'/db/postgrest.conf','utf8').replace('maiprop_professionals_http_20260921','maiprop_t23_http_0927').replace('54339','54343'));
 const q=fixture.replaceAll('maiprop_t23_impl_0927','maiprop_t23_http_0927')+'COMMIT;';
 const r=spawnSync('wsl.exe',['-d','Ubuntu','-u','postgres','--','psql','-X','-v','ON_ERROR_STOP=1','-d','maiprop_t23_http_0927'],{input:q,encoding:'utf8'});
 writeFileSync(dir+'/db/task-23-http-fixture.log',r.stdout+r.stderr);if(r.status)throw Error(r.stderr);
} else {
 const key=JSON.parse(readFileSync(dir+'/db/rest-test-key.json','utf8')).jwtSecret;
 const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const token=n=>{const raw=enc({alg:'HS256',typ:'JWT'})+'.'+enc({role:'authenticated',sub:'d1131001-0000-4000-8000-'+String(n).padStart(12,'0'),exp:Math.floor(Date.now()/1000)+600});return raw+'.'+createHmac('sha256',key).update(raw).digest('base64url');};
 const requests=[
 ['settings','/open_house_settings?select=*',1],
 ['registrations','/open_house_registrations?select=*',1],
 ['offers','/open_house_offers?select=*',1],
 ['old-my-registration','/open_house_registrations?select=*,listings:listing_id(id,title,city,address,cover_image_url,open_house_date)',2],
 ['old-my-offer','/open_house_offers?select=*,listings:listing_id(id,title,city,cover_image_url,open_house_date)',2],
 ['old-registration-lookup','/open_house_registrations?select=requester_id,status,listings!inner(owner_id,price,open_house_transaction_type,open_house_settings(*))',1],
 ['old-offer-lookup','/open_house_offers?select=bidder_id,status,listings!inner(owner_id,open_house_date,open_house_settings(offer_deadline))',1],
 ];
 const results=[];
 for(const [label,path,actor] of requests){const r=await fetch('http://127.0.0.1:54343'+path,{headers:{Authorization:'Bearer '+token(actor)}});results.push({label,status:r.status,body:await r.json()});}
 writeFileSync(dir+'/db/task-23-http-'+process.argv[2]+'.json',JSON.stringify(results,null,2));
 console.log(results.map(r=>({label:r.label,status:r.status,code:r.body.code})));
 if(process.argv[2]==='red' && results.some(r=>r.status!==403||r.body.code!=='42501'))throw Error('Unexpected RED response');
 if(process.argv[2]==='green'){
  assert.ok(results.slice(0,3).every(r=>r.status===200));
  assert.ok(results.slice(3).every(r=>r.status===403 && r.body.code==='42501'));
  const l='d1131002-0000-4000-8000-000000000001';
  async function req(label,path,actor,body,method=body?'POST':'GET'){
   const r=await fetch('http://127.0.0.1:54343'+path,{method,headers:{...(actor?{Authorization:'Bearer '+token(actor)}:{}),'Content-Type':'application/json',Prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{})});
   const raw=await r.text();const result={label,status:r.status,body:raw?JSON.parse(raw):null};results.push(result);return result;
  }
  try{
   const context=await req('participant fixed context','/rpc/get_open_house_listing_context',2,{p_listing_ids:[l,l]});assert.equal(context.status,200);assert.equal(context.body.length,1);assert.equal(Object.keys(context.body[0]).length,10);assert.equal(Object.keys(context.body[0].open_house_settings[0]).length,13);
   assert.deepEqual((await req('unrelated active id context absent','/rpc/get_open_house_listing_context',5,{p_listing_ids:[l]})).body,[]);
   assert.equal((await req('anon context denied','/rpc/get_open_house_listing_context',null,{p_listing_ids:[l]})).status,401);
   const reg=await req('upgraded registration and retained profile embed','/open_house_registrations?select=*,profiles:requester_id(display_name,first_name,last_name,avatar_url)',1);assert.equal(reg.status,200);assert.equal(reg.body.length,2);
   const a=await req('old signature submit A','/rpc/submit_open_house_offer',2,{p_listing_id:l,p_amount:210000,p_message:'A',p_currency:'EUR'});assert.equal(a.status,200);
   const b=await req('old signature submit B','/rpc/submit_open_house_offer',3,{p_listing_id:l,p_amount:220000,p_message:'B',p_currency:'EUR'});assert.equal(b.status,200);
   const aid=a.body.id,bid=b.body.id;
   assert.equal((await req('deadline denial','/open_house_offers?id=eq.'+aid,1,{status:'revealed'},'PATCH')).status,400);
   assert.equal((await req('host settings deadline update','/open_house_settings?listing_id=eq.'+l,1,{offer_deadline:'2020-01-01T00:00:00Z'},'PATCH')).status,200);
   assert.equal((await req('host reveal direct child API','/open_house_offers?listing_id=eq.'+l+'&status=eq.submitted',1,{status:'revealed',revealed_at:new Date().toISOString()},'PATCH')).status,200);
   assert.equal((await req('foreign bidder acceptance denied','/rpc/accept_open_house_offer',2,{p_offer_id:aid})).status,400);
   assert.equal((await req('old accept signature host A','/rpc/accept_open_house_offer',1,{p_offer_id:aid})).status,200);
   assert.deepEqual((await req('paused bidder context absent','/rpc/get_open_house_listing_context',2,{p_listing_ids:[l]})).body,[]);
   assert.equal((await req('paused owner context','/rpc/get_open_house_listing_context',1,{p_listing_ids:[l]})).body.length,1);
   assert.equal((await req('old reopen signature paused host','/rpc/reopen_open_house_offer_selection',1,{p_listing_id:l})).status,204);
   assert.equal((await req('old accept signature select B','/rpc/accept_open_house_offer',1,{p_offer_id:bid})).status,200);
   const admin=await req('dedicated admin panel','/rpc/get_admin_open_house_pof_reviews',4,{p_listing_id:l});assert.equal(admin.status,200);assert.equal(admin.body.length,2);assert.equal(Object.keys(admin.body[0]).length,11);
   const proof=admin.body[0];assert.equal(typeof proof.updated_at,'string');
   const reviewed=await req('exact-version admin verify','/rpc/review_admin_open_house_pof',4,{p_registration_id:proof.id,p_decision:'verified',p_reason:null,p_expected_updated_at:proof.updated_at});assert.equal(reviewed.status,200);assert.equal(reviewed.body.length,1);
   assert.equal((await req('stale review conflict','/rpc/review_admin_open_house_pof',4,{p_registration_id:proof.id,p_decision:'verified',p_reason:null,p_expected_updated_at:proof.updated_at})).body.code,'40001');
   assert.equal((await req('proof reason reject','/rpc/review_admin_open_house_pof',4,{p_registration_id:proof.id,p_decision:'rejected',p_reason:'POF_HTTP_REASON',p_expected_updated_at:reviewed.body[0].updated_at})).status,200);
   assert.equal((await req('legacy admin flag review denied','/rpc/get_admin_open_house_pof_reviews',5,{})).status,403);
   assert.equal((await req('raw listing stays denied','/listings?select=id,owner_id',1)).status,403);
  } finally {writeFileSync(dir+'/db/task-23-http-green.json',JSON.stringify(results,null,2));}
  console.log('HTTP named-argument/shape/workflow/admin assertions passed:',results.length);
 }
}

