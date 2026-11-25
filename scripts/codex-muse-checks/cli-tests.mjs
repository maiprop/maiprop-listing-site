import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const workspace=process.env.CANDIDATE_WORKSPACE;assert.ok(workspace);
const cli=join(workspace,'scripts/codex-muse.mjs');
const dir=mkdtempSync(join(tmpdir(),'codex-muse-cli-'));
let serial=0;
const task=()=>({schema_version:1,task_id:'cli-01',goal:'Fix wording',allowed_paths:['docs/guides/example.md'],facts:{kind:'mechanical',root_cause_known:true,contract_complete:true,security_sensitive:false,schema_change:false,public_api_change:false,new_dependency:false,production_change:false,uncertainty:0},limits:{max_files:3,max_added_lines:100,max_deleted_lines:100,max_corrections:1}});
function file(value,raw=false){const path=join(dir,++serial+'.json');writeFileSync(path,raw?value:JSON.stringify(value));return path}
function run(args,cwd=workspace){const r=spawnSync(process.execPath,[cli,...args],{cwd,encoding:'utf8',timeout:10000,maxBuffer:1048576});assert.equal(r.error,undefined);return r}
function deny(args){const r=run(args);assert.notEqual(r.status,0);assert.equal(r.stdout,'');assert.equal(JSON.parse(r.stderr).production_ready,false);return r}
test('CLI route emits a single bounded JSON planning result',()=>{const r=run(['route',file(task())]);assert.equal(r.status,0);assert.equal(r.stderr,'');const v=JSON.parse(r.stdout);assert.equal(v.route,'M0');assert.equal(v.worker_model,'muse-spark-1.3-contributor');assert.equal(v.production_ready,false);assert.match(v.task_sha256,/^[a-f0-9]{64}$/)});
test('CLI checks reported patch metadata and retains mandatory pending review',()=>{const t=task();const r=run(['check-reported-patch',file(t),file([{path:t.allowed_paths[0],added_lines:2,deleted_lines:1}])]);assert.equal(r.status,0);const v=JSON.parse(r.stdout);assert.equal(v.status,'within_contract_pending_review');assert.equal(v.production_ready,false);assert.equal(v.review_required,true);t.allowed_paths=['.github/workflows/ci.yml'];deny(['check-reported-patch',file(t),file([{path:t.allowed_paths[0],added_lines:1,deleted_lines:0}])])});
test('CLI unknown commands, missing args, extra args and unknown options fail closed',()=>{for(const args of [[],['route'],['route',file(task()),'extra'],['dispatch',file(task())],['route','--force',file(task())],['observe-ci']])deny(args)});
test('CLI invalid JSON and absent paths produce safe errors without input disclosure',()=>{const secret='synthetic-private-input-sentinel';const r=deny(['route',file(secret,true)]);assert.ok(!r.stderr.includes(secret));deny(['route',join(dir,'missing.json')]);deny(['route',file('{} trailing',true)])});
test('CLI rejects directories, symlinks and JSON inputs over one MiB',()=>{deny(['route',dir]);const target=file(task()),link=join(dir,'link.json');symlinkSync(process.platform==='win32'?dir:target,link,process.platform==='win32'?'junction':undefined);deny(['route',link]);deny(['route',file(' '.repeat(1048577),true)])});
test('CLI duplicate decoded keys are rejected at root and nested levels',()=>{const text=JSON.stringify(task());for(const raw of [text.replace('"schema_version":1','"schema_version":1,"schema_version":1'),text.replace('"security_sensitive":false','"security_sensitive":true,"security_sensitive":false'),text.replace('"security_sensitive":false','"security_sensitive":true,"security\\u005fsensitive":false')])deny(['route',file(raw,true)])});
test('CLI malformed observer request rejects before network and emits no authority',()=>{deny(['observe-ci',file({run_id:0})]);deny(['observe-ci',file({...task(),provider:'local-ci'})])});
test('CLI resolves implementation modules correctly outside the repository cwd',()=>{const r=run(['route',file(task())],dir);assert.equal(r.status,0);assert.equal(JSON.parse(r.stdout).route,'M0')});
