import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateStatements, assessRun, assertDisposableName, assertInventoryStable, assertRepoPath,
  assertStatementIdentitySet, parseCsv, parseTap, sha256, validateEffectiveSchema } from './db-plpgsql-coverage-lib.mjs';

const one = [{ name: 'basic_test.sql', hash: 'a'.repeat(64) }];
const tap = (body, name = 'basic_test.sql') => `D0_START_TEST ${name}\n${body}\nD0_END_TEST ${name}`;
const good = '1..2\nok 1 - first\nok 2 - second\nSELECT * FROM finish();';
test('local target and source path guards', () => {
  assert.equal(assertDisposableName('maiprop_d0_abcdef'), 'maiprop_d0_abcdef');
  for (const value of ['postgres', 'maiprop_test', 'maiprop_d0_x;drop', 'postgres://localhost/x']) assert.throws(() => assertDisposableName(value));
  assert.throws(() => assertRepoPath('/repo','/other/basic_test.sql','supabase/tests',/.*_test\.sql/));
});
test('strict TAP accepts both plan styles and the declared two-segment suite', () => {
  assert.equal(parseTap(tap(good),one).assertions,2);
  assert.equal(parseTap(tap('ok 1 - first\nok 2 - second\nSELECT * FROM finish();\n1..2'),one).assertions,2);
  const split = [{name:'open_house_listing_boundary_test.sql',hash:'b'.repeat(64)}];
  const two = 'ok 1 - first\nSELECT * FROM finish();\n1..1\nok 1 - second\nSELECT * FROM finish();\n1..1';
  assert.deepEqual(parseTap(tap(two,split[0].name),split).segments,2);
});
test('strict TAP rejects failed, missing, extra, restarted, and undiscovered segments', () => {
  for (const body of [
    '1..1\nnot ok 1 - failed\nSELECT * FROM finish();',
    '1..2\nok 1 - short\nSELECT * FROM finish();',
    '1..1\nok 1 - no finish',
    '1..1\nok 1 - first\n1..1\nSELECT * FROM finish();',
    '1..2\nok 1 - first\nok 1 - repeated\nSELECT * FROM finish();',
    'ok 1 - first\nSELECT * FROM finish();\n1..1\nok 1 - extra\nSELECT * FROM finish();\n1..1',
  ]) assert.throws(() => parseTap(tap(body),one), body);
  assert.throws(() => parseTap(tap(good,'unknown_test.sql'),one));
});
const routine = (signature, hash = 'a'.repeat(64)) => ({ signature, schema_name:'public', definition_sha256:hash });
const stmt = (signature, stmtid, exec_stmts, hash = 'a'.repeat(64)) => ({ signature, schema_name:'public', definition_sha256:hash, stmtid:String(stmtid), lineno:String(stmtid), stmtname:'stmt', exec_stmts:String(exec_stmts), exec_stmts_err:'0' });
test('weighted official statement identities include zero-hit routines and threshold', () => {
  const routines = [routine('public.a()'),routine('public.b()')];
  const rows = [stmt('public.a()',1,1),stmt('public.a()',2,1),stmt('public.b()',1,0)];
  const result = aggregateStatements(routines,rows);
  assert.equal(result.hit,2); assert.equal(result.total,3);
  assert.equal(result.zeroHitRoutines,1); assert.equal(result.meetsTarget,false);
  assert.equal(aggregateStatements(routines,rows.map((s) => ({...s,exec_stmts:'0'}))).percent,0);
  assert.equal(aggregateStatements(routines,rows.map((s) => ({...s,exec_stmts:'1'}))).percent,100);
});
test('acceptance requires clean source and the fixed 80 percent gate', () => {
  assert.deepEqual(assessRun({percent:80,initialStatus:'',finalStatus:''}).status,'valid-target-met');
  for (const input of [
    {percent:79.99,initialStatus:'',finalStatus:''},
    {percent:80,initialStatus:' M migration.sql',finalStatus:''},
    {percent:80,initialStatus:'',finalStatus:'?? new_test.sql'},
    {percent:80,initialStatus:'',finalStatus:'',requestedThreshold:0},
  ]) {
    const result = assessRun(input);
    assert.equal(result.accepted,false); assert.equal(result.exitCode,2);
  }
});
test('pre-suite official statement set detects omitted zero-hit and conflicting rows', () => {
  const before = [stmt('public.a()',1,0),stmt('public.a()',2,0)];
  const after = [stmt('public.a()',1,2),stmt('public.a()',2,0)];
  assert.equal(aggregateStatements([routine('public.a()')],assertStatementIdentitySet(before,after)).total,2);
  assert.throws(() => assertStatementIdentitySet(before,[after[0]]),/identity drift/);
  assert.throws(() => assertStatementIdentitySet(before,[...after,stmt('public.a()',3,0)]),/identity drift/);
  assert.throws(() => assertStatementIdentitySet(before,[after[0],{...after[1],lineno:'3'}]),/identity drift/);
  assert.throws(() => assertStatementIdentitySet(before,[after[0],{...after[1],definition_sha256:'b'.repeat(64)}]),/identity drift/);
});
test('final discovery catches added migration, suite, supporting SQL, and hash drift', () => {
  const base = { migrations:['001_a.sql'], suites:[{name:'a_test.sql',hash:'a',segments:1}],
    hashes:{'supabase/migrations/001_a.sql':'a','supabase/tests/a_test.sql':'a','supabase/tests/fixtures/setup.sql':'a'} };
  assert.doesNotThrow(() => assertInventoryStable(base,structuredClone(base)));
  assert.throws(() => assertInventoryStable(base,{...base,migrations:[...base.migrations,'002_b.sql']}));
  assert.throws(() => assertInventoryStable(base,{...base,suites:[...base.suites,{name:'b_test.sql',hash:'b',segments:1}]}));
  assert.throws(() => assertInventoryStable(base,{...base,hashes:{...base.hashes,'supabase/tests/fixtures/new.sql':'b'}}));
  assert.throws(() => assertInventoryStable(base,{...base,hashes:{...base.hashes,'supabase/tests/a_test.sql':'b'}}));
});
test('effective inventory requires stable canonical object hashes and bound event status', () => {
  const definition = '{"command":"r","roles":["PUBLIC"]}';
  const policy = { catalog_class:'pg_policy',catalog_oid:'42',object_identity:'public.t.p',object_kind:'policy',canonical_definition:definition,definition_sha256:sha256(definition) };
  const event = {sequence:'1',migration:'001_a.sql',class_name:'pg_policy',objid:'42',lineage_status:'current_object',final_identity:policy.object_identity,final_definition_sha256:policy.definition_sha256};
  assert.equal(validateEffectiveSchema([policy],[event],['001_a.sql']).policies,1);
  assert.throws(() => validateEffectiveSchema([{...policy,definition_sha256:'0'.repeat(64)}],[event],['001_a.sql']));
  assert.throws(() => validateEffectiveSchema([policy,policy],[event],['001_a.sql']));
  assert.throws(() => validateEffectiveSchema([policy],[{...event,objid:'43'}],['001_a.sql']));
  assert.throws(() => validateEffectiveSchema([policy],[{...event,lineage_status:'superseded_or_unmapped'}],['001_a.sql']));
  assert.throws(() => validateEffectiveSchema([policy],[{...event,final_identity:'public.t.other'}],['001_a.sql']));
  assert.throws(() => validateEffectiveSchema([policy],[{...event,final_definition_sha256:'0'.repeat(64)}],['001_a.sql']));
  const namedDefinition = '{"command":"r","roles":["postgres"]}';
  assert.notEqual(sha256(definition),sha256(namedDefinition));
  const namedPolicy = {...policy,canonical_definition:namedDefinition,definition_sha256:sha256(namedDefinition)};
  assert.equal(validateEffectiveSchema([namedPolicy],[{...event,final_definition_sha256:namedPolicy.definition_sha256}],['001_a.sql']).policies,1);
});
test('statement input rejects duplicates, source drift, omissions, malformed counters and namespace', () => {
  const routines = [routine('public.a()')]; const row = stmt('public.a()',1,1);
  assert.throws(() => aggregateStatements(routines,[row,row]));
  assert.throws(() => aggregateStatements(routines,[{...row,definition_sha256:'b'.repeat(64)}]));
  assert.throws(() => aggregateStatements(routines,[]));
  assert.throws(() => aggregateStatements(routines,[{...row,exec_stmts:'-1'}]));
  assert.throws(() => aggregateStatements([{...routines[0],schema_name:'auth'}],[row]));
});
test('CSV parser preserves quoted commas and rejects row shape drift', () => {
  assert.deepEqual(parseCsv('a,b\n"x,y",z\n'),[{a:'x,y',b:'z'}]);
  assert.throws(() => parseCsv('a,b\nx\n'));
});
