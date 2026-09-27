import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateStatements, assertDisposableName, assertRepoPath, parseCsv, parseTap } from './db-plpgsql-coverage-lib.mjs';

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
  assert.equal(result.zeroHitRoutines,1); assert.equal(result.meetsThreshold,false);
  assert.equal(aggregateStatements(routines,rows.map((s) => ({...s,exec_stmts:'0'}))).percent,0);
  assert.equal(aggregateStatements(routines,rows.map((s) => ({...s,exec_stmts:'1'}))).percent,100);
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
