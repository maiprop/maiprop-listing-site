import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const modulePath=join(process.env.CANDIDATE_WORKSPACE,'scripts/codex-muse-routing.mjs');
const {routeTask,assertPatchWithinTask}=await import(pathToFileURL(modulePath));
const task=()=>({schema_version:1,task_id:'MP-001',goal:'Fix documented wording',
 allowed_paths:['docs/guides/example.md'],
 facts:{kind:'mechanical',root_cause_known:true,contract_complete:true,security_sensitive:false,schema_change:false,
 public_api_change:false,new_dependency:false,production_change:false,uncertainty:0},
 limits:{max_files:3,max_added_lines:100,max_deleted_lines:100,max_corrections:1}});
test('mechanical proven scope still requires supervisor review and grants no production authority',()=>{
 const r=routeTask(task());assert.equal(r.route,'M0');assert.equal(r.worker_model,'muse-spark-1.3-contributor');
 assert.equal(r.supervisor_model,'gpt-6.1-sol');assert.equal(r.supervisor_effort,'ultra');
 assert.equal(r.review_required,true);assert.equal(r.production_ready,false);
 assert.match(r.task_sha256,/^[0-9a-f]{64}$/);assert.match(r.policy_sha256,/^[0-9a-f]{64}$/);
});
test('routing is deterministic and independent of object key order',()=>{
 const a=task(),b=Object.fromEntries(Object.entries(a).reverse());assert.deepEqual(routeTask(a),routeTask(b));
});
test('request changes produce a new task binding',()=>{const a=task(),b=task();b.goal='Different wording';assert.notEqual(routeTask(a).task_sha256,routeTask(b).task_sha256)});
test('normal feature implementation is M1 only in known ordinary scope',()=>{const a=task();a.facts.kind='implementation';a.allowed_paths=['src/components/marketing/Banner.tsx'];assert.equal(routeTask(a).route,'M1')});
test('unknown repository paths default to supervised A1',()=>{const a=task();a.allowed_paths=['src/unclassified/unknown.ts'];assert.equal(routeTask(a).route,'A1')});
for(const flag of ['security_sensitive','schema_change','public_api_change','new_dependency'])
 test('hard risk '+flag+' cannot be averaged down',()=>{const a=task();a.facts[flag]=true;assert.equal(routeTask(a).route,'A1')});
test('production-changing work is supervisor-owned A2',()=>{const a=task();a.facts.production_change=true;assert.equal(routeTask(a).route,'A2');assert.equal(routeTask(a).worker_model,null)});
for(const field of ['root_cause_known','contract_complete'])
 test('missing certainty '+field+' cannot route downward',()=>{const a=task();a.facts[field]=false;assert.equal(routeTask(a).route,'A1')});
for(const kind of ['architecture','investigation'])
 test(kind+' requires supervisor planning',()=>{const a=task();a.facts.kind=kind;assert.equal(routeTask(a).route,'A1')});
test('uncertainty forces A1',()=>{const a=task();a.facts.uncertainty=1;assert.equal(routeTask(a).route,'A1')});
for(const path of ['.github/workflows/ci.yml','.agents/skills/control/SKILL.md','.codex/config.toml','.muse/settings.json',
 'scripts/production-release-validation.mjs','scripts/release-artifact-binding.mjs','scripts/codex-muse-routing.mjs',
 'scripts/create-release-artifact-binding.mjs','scripts/verify-release-artifact-binding.mjs','scripts/github-artifact-metadata.mjs',
 'package.json','package-lock.json','.npmrc','Dockerfile','wrangler.toml','src/components/ui/button.tsx'])
 test('control-path floor '+path+' is A2 regardless of claimed task simplicity',()=>{
  const a=task();a.allowed_paths=[path];assert.equal(routeTask(a).route,'A2');
  assert.throws(()=>assertPatchWithinTask(a,[{path,added_lines:1,deleted_lines:0}]));
 });
for(const path of ['src/contexts/AuthContext.tsx','src/hooks/useSubscription.ts','src/components/Checkout.tsx',
 'supabase/migrations/change.sql','functions/api.ts','src/integrations/supabase/client.ts'])
 test('sensitive-path floor '+path+' is at least A1',()=>{const a=task();a.allowed_paths=[path];assert.ok(['A1','A2'].includes(routeTask(a).route))});
for(const path of ['../escape.ts','/absolute.ts','C:/escape.ts','src\\escape.ts','src/./x.ts','src//x.ts','src/%2e%2e/x.ts',
 'src/.git/config','src/x.ts:stream','src/file?.ts','src/file*.ts','src/trailing.','src/trailing '])
 test('noncanonical/ambiguous path is denied: '+path,()=>{const a=task();a.allowed_paths=[path];assert.throws(()=>routeTask(a))});
test('case-colliding path declarations are denied',()=>{const a=task();a.allowed_paths=['docs/guides/a.md','docs/guides/A.md'];assert.throws(()=>routeTask(a))});
test('unknown capability and model override fields fail closed',()=>{const a=task();a.worker_model='cheaper';assert.throws(()=>routeTask(a));const b=task();b.facts.network=true;assert.throws(()=>routeTask(b))});
test('invalid booleans and numeric budgets fail closed',()=>{for(const mutate of [a=>a.facts.security_sensitive='false',a=>a.limits.max_files=0,a=>a.limits.max_corrections=2,a=>a.facts.uncertainty=-1,a=>a.limits.max_added_lines=NaN]){const a=task();mutate(a);assert.throws(()=>routeTask(a))}});
test('admitted patch remains pending independent review',()=>{const a=task();const r=assertPatchWithinTask(a,[{path:a.allowed_paths[0],added_lines:2,deleted_lines:1}]);assert.equal(r.status,'within_contract_pending_review');assert.equal(r.review_required,true);assert.equal(r.production_ready,false)});
test('out-of-scope patch cannot self-promote',()=>{const a=task();assert.throws(()=>assertPatchWithinTask(a,[{path:'src/contexts/AuthContext.tsx',added_lines:1,deleted_lines:0}]))});
test('diff line limits are aggregate and cannot be reset per file',()=>{const a=task();a.allowed_paths=['docs/guides/a.md','docs/guides/b.md'];assert.throws(()=>assertPatchWithinTask(a,a.allowed_paths.map(path=>({path,added_lines:60,deleted_lines:0}))))});
test('duplicate or malformed changed paths fail closed',()=>{const a=task();const r={path:a.allowed_paths[0],added_lines:1,deleted_lines:0};assert.throws(()=>assertPatchWithinTask(a,[r,r]));assert.throws(()=>assertPatchWithinTask(a,[{...r,deleted_lines:-1}]));assert.throws(()=>assertPatchWithinTask(a,[]))});
test('all allowed paths contribute a maximum risk floor regardless of order',()=>{
 for(const paths of [['docs/guides/example.md','.github/workflows/ci.yml'],['.github/workflows/ci.yml','docs/guides/example.md']]){
  const a=task();a.allowed_paths=paths;assert.equal(routeTask(a).route,'A2');
 }
});
test('case variants cannot downgrade protected or sensitive paths',()=>{
 for(const path of ['.GITHUB/workflows/ci.yml','Scripts/Production-release-validation.mjs','PACKAGE.JSON','src/components/UI/button.tsx']){
  const a=task();a.allowed_paths=[path];assert.equal(routeTask(a).route,'A2');
 }
 const a=task();a.allowed_paths=['SRC/contexts/AUTHContext.tsx'];assert.ok(['A1','A2'].includes(routeTask(a).route));
});
