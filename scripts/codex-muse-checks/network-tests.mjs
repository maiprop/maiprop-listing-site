// Independent default transport tests. Synthetic sentinel is not a credential.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeFixture, NOW } from './github-fixtures.mjs';
const { collectMaiPropCiEvidence } = await import(pathToFileURL(resolve(process.env.CANDIDATE_WORKSPACE,'scripts/codex-muse-github.mjs')));
const sentinel='synthetic-transport-test-not-a-real-token';
async function withFetch(mock,run){const original=globalThis.fetch;const old=process.env.GH_TOKEN;globalThis.fetch=mock;process.env.GH_TOKEN=sentinel;try{return await run()}finally{globalThis.fetch=original;if(old===undefined)delete process.env.GH_TOKEN;else process.env.GH_TOKEN=old}}
function recordFor(url,fixture){
 const path=new URL(url).pathname, r=fixture.records;
 if(path.endsWith('/branches/main'))return r.branch;
 if(path.includes('/commits/'))return r.commit;
 if(path.endsWith('/actions/workflows/262230414'))return r.workflow;
 if(path.includes('/contents/'))return {...r.workflow_source,type:'file'};
 if(path.endsWith('/jobs'))return {total_count:r.jobs.length,jobs:r.jobs};
 if(path.endsWith('/artifacts'))return {total_count:r.artifacts.length,artifacts:r.artifacts};
 if(path.endsWith('/actions/runs/'+fixture.request.run_id))return r.run;
 return r.repository;
}
test('default transport uses fixed HTTPS GET, redirect refusal, deadline and header-only token',async()=>{
 const f=makeFixture();let count=0;
 const result=await withFetch(async(url,options)=>{
  count++;const u=new URL(url);assert.equal(u.origin,'https://api.github.com');
  assert.ok(u.pathname.startsWith('/repos/maiprop/maiprop-listing-site'));
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  assert.ok(options.signal instanceof AbortSignal);assert.equal(options.signal.aborted,false);
  const headers=new Headers(options.headers);assert.equal(headers.get('authorization'),'Bearer '+sentinel);
  assert.ok(!u.href.includes(sentinel));assert.equal(options.body,undefined);
  return new Response(JSON.stringify(recordFor(u,f)),{status:200,headers:{'content-type':'application/json'}});
 },()=>collectMaiPropCiEvidence(f.request,{nowIso:NOW}));
 assert.equal(count,8);assert.equal(result.observation.production_ready,false);
 assert.ok(!JSON.stringify(result).includes(sentinel));
});
test('provider error body and bearer token never enter diagnostic errors',async()=>{
 const f=makeFixture();
 await withFetch(async()=>new Response('provider echoed '+sentinel,{status:403}),async()=>{
  await assert.rejects(()=>collectMaiPropCiEvidence(f.request,{nowIso:NOW}),error=>{
   assert.ok(!String(error).includes(sentinel));return true;
  });
 });
});
test('oversized streaming body is canceled before consuming the entire provider response',async()=>{
 const f=makeFixture();let chunks=0,canceled=false;
 await withFetch(async()=>new Response(new ReadableStream({
  pull(controller){chunks++;controller.enqueue(new Uint8Array(1024*1024).fill(32));if(chunks===12)controller.close()},
  cancel(){canceled=true},
 }),{status:200,headers:{'content-type':'application/json'}}),async()=>{
  await assert.rejects(()=>collectMaiPropCiEvidence(f.request,{nowIso:NOW}));
  assert.ok(chunks<12,'Bound body consumption before all chunks are read');assert.equal(canceled,true);
 });
});
