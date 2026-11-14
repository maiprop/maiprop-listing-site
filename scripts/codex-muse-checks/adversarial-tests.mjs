import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath=join(process.env.CANDIDATE_WORKSPACE,'scripts/codex-muse-routing.mjs');
const {routeTask,assertPatchWithinTask}=await import(pathToFileURL(modulePath));
const task=()=>({schema_version:1,task_id:'review-01',goal:'Proposed component change',allowed_paths:['docs/guides/example.md'],facts:{kind:'mechanical',root_cause_known:true,contract_complete:true,security_sensitive:false,schema_change:false,public_api_change:false,new_dependency:false,production_change:false,uncertainty:0},limits:{max_files:3,max_added_lines:100,max_deleted_lines:100,max_corrections:1}});
for(const path of ['src/components/ProtectedRoute.tsx','src/components/AdminRoute.tsx','src/components/dashboard/BillingUsagePanel.tsx','src/components/marketing/CheckoutBanner.tsx','src/components/unclassified/UnknownControl.tsx'])
 test('actual authorization or unclassified component cannot be a simple Muse task: '+path,()=>{
  const t=task();t.allowed_paths=[path];assert.ok(['A1','A2'].includes(routeTask(t).route));
 });
test('caller array methods cannot erase protected path floors or admit a protected patch',()=>{
 const t=task();t.allowed_paths=['.github/workflows/ci.yml'];t.allowed_paths.filter=()=>[];
 try {assert.equal(routeTask(t).route,'A2')}catch(error){if(error.code==='ERR_ASSERTION')throw error}
 assert.throws(()=>assertPatchWithinTask(t,[{path:t.allowed_paths[0],added_lines:1,deleted_lines:0}]));
});
test('policy fingerprint changes when an actual protected path rule changes',async()=>{
 const original=readFileSync(modulePath,'utf8');
 assert.ok(original.includes("'.github'"),'Controlled mutation must hit an actual rule literal');
 const altered=original.replace("'.github'","'.not-github'");assert.notEqual(altered,original);
 const folder=mkdtempSync(join(tmpdir(),'router-policy-regression-'));
 const copy=join(folder,'router.mjs');writeFileSync(copy,altered);
 const other=await import(pathToFileURL(copy));
 const a=routeTask(task()),b=other.routeTask(task());
 assert.notEqual(a.policy_sha256??a.hashes?.policy_sha256,b.policy_sha256??b.hashes?.policy_sha256);
});
