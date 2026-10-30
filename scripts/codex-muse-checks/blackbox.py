"""Trusted Python assertions over captured Node child results, never shared asserts."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile

if not __debug__ or sys.flags.optimize != 0:
 raise RuntimeError('Trusted checker requires enabled Python assertions')
WORK=Path(sys.argv[1])
FIXTURE=json.loads(Path(__file__).with_name('github-fixtures.json').read_text())
NOW='2026-10-22T16:00:00Z'
if len(sys.argv) != 3:
 raise RuntimeError('Expected workspace and Node executable')
NODE=sys.argv[2]
version=subprocess.run([NODE,'--version'],capture_output=True,text=True,check=True,timeout=5).stdout.strip()
parts=tuple(int(p) for p in version.removeprefix('v').split('.'))
assert (20,19,0) <= parts < (21,0,0), 'Project Node20.19+ runtime required'
PROGRAM=r'''
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const stringify=JSON.stringify;
const input=JSON.parse(readFileSync(0,'utf8'));
const m=await import(pathToFileURL(input.module));
let value, failed=false, failure;
try { value=await m[input.name](...input.args); }
catch(error){failed=true;failure=String(error);}
try { process.stdout.write(stringify(failed?{ok:false,error:failure}:{ok:true,value})); }
catch { process.stderr.write('Child result serialization failed');process.exitCode=70; }
'''
def invoke(module,name,*args):
 p=subprocess.run([NODE,'--input-type=module','-e',PROGRAM],input=json.dumps({'module':str(module),'name':name,'args':args}),capture_output=True,text=True,timeout=5)
 if p.returncode!=0 or len(p.stdout)>1024*1024 or len(p.stderr)>65536: raise AssertionError('Node child failed or exceeded protocol limit')
 try:r=json.loads(p.stdout)
 except (ValueError,TypeError) as exc:raise AssertionError('Node child did not emit a single data response') from exc
 if not isinstance(r,dict) or type(r.get('ok')) is not bool or set(r)!=({'ok','value'} if r['ok'] else {'ok','error'}):raise AssertionError('Invalid child response')
 return r
def task():return {'schema_version':1,'task_id':'blackbox-01','goal':'Proposed change','allowed_paths':['docs/guides/example.md'],'facts':{'kind':'mechanical','root_cause_known':True,'contract_complete':True,'security_sensitive':False,'schema_change':False,'public_api_change':False,'new_dependency':False,'production_change':False,'uncertainty':0},'limits':{'max_files':3,'max_added_lines':100,'max_deleted_lines':100,'max_corrections':1}}
def case(name):print(json.dumps({'codex_muse_case':name,'status':'passed'}),flush=True)
case('blackbox-exact-runtime')
router=WORK/'scripts/codex-muse-routing.mjs';github=WORK/'scripts/codex-muse-github.mjs'
t=task();r=invoke(router,'routeTask',t);assert r['ok'] and r['value']['route']=='M0' and r['value']['production_ready'] is False
assert len(r['value']['task_sha256'])==64 and len(r['value']['policy_sha256'])==64
t['goal']='Changed';s=invoke(router,'routeTask',t);assert s['ok'] and r['value']['task_sha256']!=s['value']['task_sha256']
t=task();p=invoke(router,'assertPatchWithinTask',t,[{'path':t['allowed_paths'][0],'added_lines':2,'deleted_lines':1}])
assert p['ok'] and p['value']['status']=='within_contract_pending_review' and p['value']['review_required'] is True and p['value']['production_ready'] is False
case('blackbox-normal-bindings')
for path in ['.github/workflows/ci.yml','scripts/create-release-artifact-binding.mjs','PACKAGE.JSON','src/components/ui/button.tsx']:
 t=task();t['allowed_paths']=[path];r=invoke(router,'routeTask',t);assert r['ok'] and r['value']['route']=='A2'
 r=invoke(router,'assertPatchWithinTask',t,[{'path':path,'added_lines':1,'deleted_lines':0}]);assert r['ok'] is False
for path in ['src/components/ProtectedRoute.tsx','src/components/marketing/CheckoutBanner.tsx','docs/private-policy.md','src/unclassified/src/components/marketing/x.tsx']:
 t=task();t['allowed_paths']=[path];r=invoke(router,'routeTask',t);assert r['ok'] and r['value']['route'] in ['A1','A2']
case('blackbox-risk-floors')
for path in ['../x','src/./x','src/x:stream','src/%2e/x','src/.git/config','src\\x']:
 t=task();t['allowed_paths']=[path];assert invoke(router,'routeTask',t)['ok'] is False
t=task();t['facts']['security_sensitive']='false';assert invoke(router,'routeTask',t)['ok'] is False
case('blackbox-invalid-data')
f=copy.deepcopy(FIXTURE);r=invoke(github,'verifyMaiPropCiEvidence',f['request'],f['records'],NOW);assert r['ok']
for key in ['production_ready','mutation_authorized','hmac_verified_locally','signature_verified','source_binding_verified']:assert r['value'][key] is False
case('blackbox-provider-observation')
for change in ['repo','owner','sha','job','artifact']:
 f=copy.deepcopy(FIXTURE)
 if change=='repo':f['records']['run']['repository']['id']+=1
 if change=='owner':f['records']['run']['head_repository']['owner']['id']+=1
 if change=='sha':f['records']['run']['head_sha']='a'*40
 if change=='job':f['records']['jobs'][0]['conclusion']='skipped'
 if change=='artifact':f['records']['artifacts'][0]['digest']='sha256:'+'a'*64
 assert invoke(github,'verifyMaiPropCiEvidence',f['request'],f['records'],NOW)['ok'] is False
case('blackbox-provider-substitutions')
with tempfile.TemporaryDirectory(prefix='checker-integrity-') as d:
 for name,body in [('premature.mjs','process.exit(0);'),('forged.mjs',"import a from 'node:assert/strict';a.equal=()=>{};console.log('TAP version 13\\n1..1\\nok 1\\n# tests 1\\n# pass 1\\n# fail 0\\n# skipped 0');process.exit(0);")]:
  p=Path(d)/name;p.write_text(body)
  rejected=False
  try:invoke(p,'routeTask',task())
  except AssertionError:rejected=True
  assert rejected,'Forged output or premature success cannot count as behavior proof'
 # Serialization failure must not be misreported as an API rejection.
 p=Path(d)/'cyclic.mjs';p.write_text('export function routeTask(){const x={};x.x=x;return x}')
 rejected=False
 try:invoke(p,'routeTask',task())
 except AssertionError:rejected=True
 assert rejected,'Serialization failure must be a protocol failure'
 p=Path(d)/'tampered-assert.mjs';p.write_text("import a from 'node:assert/strict';a.equal=()=>{};export function routeTask(){return {route:'M0'}}")
 r=invoke(p,'routeTask',task())
 tampering_rejected=False
 try:assert r['ok'] and r['value']['route']=='A2'
 except AssertionError:tampering_rejected=True
 assert tampering_rejected,'Node assertion mutation cannot change Python parent assertion'
case('blackbox-forgery-rejected')
