import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { lintMigration, lintMigrationChronology } from '../../../../scripts/check-migration-idempotency.mjs';

const dir = '.superpowers/sdd/2026-09-21-verified-remediation-plan/db';
assert.equal(process.versions.node.split('.')[0],'20','source checks use pinned Node20');
const migration = '20260926233914_restore_ai_reservation_spendable_credits.sql';
const norm = s => s.replace(/\r\n/g, '\n').trim();
const sha = s => createHash('sha256').update(s).digest('hex');
const before = JSON.parse(readFileSync(`${dir}/task-24-before.json`, 'utf8'));
const after = JSON.parse(readFileSync(`${dir}/task-24-after.json`, 'utf8'));
const red = JSON.parse(readFileSync(`${dir}/task-13-billing-multicredit-probe-metadata.json`, 'utf8'));
for(const name of ['reserve_ai_quota_for_user','check_ai_quotas_for_user','check_ai_call_monthly_limit_trigger']) {
 assert.equal(before.routines.find(r=>r.name===name).source_md5,red.routines.find(r=>r.name===name).source_md5,`saved RED exact source binding: ${name}`);
}
const sources = readdirSync('supabase/migrations').filter(s => s.endsWith('.sql')).sort().map(file => ({file, text: norm(readFileSync(`supabase/migrations/${file}`, 'utf8'))}));
const changed = [];
const routines = after.routines.map(r => {
  const previous = before.routines.find(p => p.signature === r.signature);
  assert(previous, r.signature);
  if (norm(previous.source) !== norm(r.source)) changed.push(r.signature);
  assert.deepEqual(r.acl, previous.acl, `ACL preserved: ${r.signature}`);
  assert.equal(r.owner, previous.owner, `owner preserved: ${r.signature}`);
  const matching = sources.filter(s => s.text.includes(norm(r.source)));
  if (r.schema !== 'auth') assert(matching.length, `application source bound: ${r.signature}`);
  return {signature:r.signature, owner:r.owner, acl:r.acl, source_sha256:sha(norm(r.source)), matching_migrations:matching.map(s=>({file:s.file,sha256:sha(s.text)}))};
});
assert.deepEqual(changed, ['reserve_ai_quota_for_user(uuid,text)']);
const oldBody=before.routines.find(r=>r.name==='reserve_ai_quota_for_user').source;
const intendedBody=oldBody.replace(/  v_available_credits INTEGER;\r?\n/,'').replace(/  v_available_credits := public.get_available_addon_credits\(v_uid, p_bucket\);\r?\n  v_effective_limit := v_base_limit \+ v_available_credits;/,'  v_effective_limit := public.get_ai_call_monthly_limit(v_uid, p_bucket);');
assert.equal(norm(after.routines.find(r=>r.name==='reserve_ai_quota_for_user').source),norm(intendedBody),'only the specified two body changes');
assert.deepEqual(after.relations, before.relations, 'all captured relation constraints/triggers/ACLs preserved');
for (const [name, volatility] of [['reserve_ai_quota_for_user', ''], ['get_ai_call_monthly_limit', 'STABLE']]) {
  const r=after.routines.find(r=>r.name===name);
  assert.equal(r.owner,'postgres');
  assert.match(r.definition,/SECURITY DEFINER/);
  assert.match(r.definition,/SET search_path TO 'public'/);
  assert(r.definition.includes(volatility));
  if(name==='reserve_ai_quota_for_user') assert(!/\b(STABLE|IMMUTABLE)\b/.test(r.definition));
  assert.deepEqual(r.acl,['postgres=X/postgres','service_role=X/postgres']);
}
const sql=readFileSync(`supabase/migrations/${migration}`,'utf8');
assert.deepEqual(lintMigration(migration,sql),[]);
assert.deepEqual(lintMigrationChronology([migration],{now:new Date('2026-09-27T00:00:00Z'),appliedFutureVersions:[]}),[]);
const checks = ['contract','race','shared-backend'].map(name=>{
  const output=readFileSync(`${dir}/task-24-${name}.stdout`,'utf8');
  assert.equal(readFileSync(`${dir}/task-24-${name}.exit`,'utf8').trim(),'0');
  assert(!/not ok|Looks like you failed|Looks like you planned/.test(output));
  const count=(output.match(/^\s*ok \d+ -/gm)||[]).length;
  const expected={contract:33,race:14,'shared-backend':66}[name];
  assert.equal(count,expected);
  return {name,count,exit:0};
});
const result={node:process.version,base:'76a15d8a01d6cc3b297db5e7cfa9e350f5193075',database:after.database,version:after.version,socket:after.socket,changed_routines:changed,routines,migration_lint:[],migration_chronology:[],checks};
writeFileSync(`${dir}/task-24-source-check.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({node:process.version,bound_routines:routines.length,changed,checks,scoped_migration_lint:'pass',chronology:'pass'},null,2));
