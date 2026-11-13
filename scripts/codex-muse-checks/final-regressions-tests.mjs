import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeFixture, NOW } from './github-fixtures.mjs';
const {routeTask}=await import(pathToFileURL(join(process.env.CANDIDATE_WORKSPACE,'scripts/codex-muse-routing.mjs')));
const {verifyMaiPropCiEvidence}=await import(pathToFileURL(join(process.env.CANDIDATE_WORKSPACE,'scripts/codex-muse-github.mjs')));
const task=()=>({schema_version:1,task_id:'final-review-01',goal:'Proposed component change',allowed_paths:['docs/guides/example.md'],facts:{kind:'mechanical',root_cause_known:true,contract_complete:true,security_sensitive:false,schema_change:false,public_api_change:false,new_dependency:false,production_change:false,uncertainty:0},limits:{max_files:3,max_added_lines:100,max_deleted_lines:100,max_corrections:1}});
for(const path of ['docs/private-policy.md','guides/root.md','src/unclassified/src/components/marketing/x.tsx','elsewhere/src/components/presentation/x.tsx'])
 test('ordinary scope uses exact anchored prefixes: '+path,()=>{const t=task();t.allowed_paths=[path];assert.equal(routeTask(t).route,'A1')});
test('hidden unknown router object fields are rejected instead of omitted from binding',()=>{
 for(const select of [t=>t,t=>t.facts,t=>t.limits]){const t=task();Object.defineProperty(select(t),'hidden_capability',{value:true,enumerable:false});assert.throws(()=>routeTask(t))}
});
test('router rejects accessor schema fields without invoking them',()=>{
 const t=task();let reads=0;Object.defineProperty(t,'goal',{get(){reads++;return 'A getter'},enumerable:true});
 assert.throws(()=>routeTask(t));assert.equal(reads,0);
});
test('normalized source metadata remains valid without raw Contents type',()=>{
 const {request,records}=makeFixture();assert.equal(verifyMaiPropCiEvidence(request,records,NOW).production_ready,false);
 records.workflow_source.type='symlink';assert.throws(()=>verifyMaiPropCiEvidence(request,records,NOW));
});
test('GitHub request rejects hidden fields, custom prototypes and accessors without reading them',()=>{
 for(const mode of ['hidden','prototype','accessor']){
  const {request,records}=makeFixture();records.workflow_source.type='file';let reads=0;
  if(mode==='hidden')Object.defineProperty(request,'hidden_capability',{value:true,enumerable:false});
  if(mode==='prototype')Object.setPrototypeOf(request,{capability:true});
  if(mode==='accessor')Object.defineProperty(request,'run_id',{get(){reads++;return 1234567890},enumerable:true});
  assert.throws(()=>verifyMaiPropCiEvidence(request,records,NOW));assert.equal(reads,0);
 }
});
test('GitHub provider data and arrays reject custom capabilities and inherited required identity',()=>{
 for(const mode of ['filter','inherited','getter']){
  const {request,records}=makeFixture();records.workflow_source.type='file';let reads=0;
  if(mode==='filter')records.artifacts.filter=Array.prototype.filter;
  if(mode==='inherited'){const id=records.run.repository.id;delete records.run.repository.id;Object.setPrototypeOf(records.run.repository,{id})}
  if(mode==='getter')Object.defineProperty(records.run.repository,'id',{get(){reads++;return 1179072210},enumerable:true});
  assert.throws(()=>verifyMaiPropCiEvidence(request,records,NOW));assert.equal(reads,0);
 }
});
