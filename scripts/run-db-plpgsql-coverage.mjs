import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import yaml from 'js-yaml';
import {
  aggregateStatements, assertDisposableName, assertRepoPath, hashFile,
  parseCsv, parseTap, sha256, expectedSegments,
} from './db-plpgsql-coverage-lib.mjs';

const root = resolve(import.meta.dirname, '..');
const evidenceRoot = resolve(root, '.superpowers/sdd/2026-09-21-verified-remediation-plan/db');
const args = process.argv.slice(2);
const at = args.indexOf('--database');
const database = assertDisposableName(at >= 0 ? args[at + 1] : null);
const thresholdAt = args.indexOf('--threshold');
const threshold = thresholdAt >= 0 ? Number(args[thresholdAt + 1]) : 80;
if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) throw new Error('invalid threshold');
if (args.length !== (thresholdAt >= 0 ? 4 : 2)) throw new Error('usage: --database maiprop_d0_<unique> [--threshold 80]');
const runId = `d0-${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
const out = resolve(evidenceRoot, runId);
mkdirSync(out, { recursive: false });
const manifest = { runId, database, threshold, startedAt: new Date().toISOString(),
  localTarget: { distribution: 'Ubuntu', user: 'postgres', socket: '/var/run/postgresql', port: 5432 },
  managedSurfaces: ['CI PostgreSQL fixture', 'auth claim shims', 'storage SELECT baseline', 'Realtime relation', 'Vault/net/cron/pgmq no-network stubs'],
  exclusions: ['extension-owned routines', 'SQL-language routines', 'DDL', 'trace functions', 'test-only helpers', 'remote dblink profiler sessions'],
  commands: [], status: 'preparing' };
const manifestPath = join(out, 'manifest.json');
const persist = () => writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
persist();

function run(command, argv, label, { cwd = root, timeout = 2_400_000, allowFailure = false } = {}) {
  const result = spawnSync(command, argv, { cwd, encoding: 'utf8', shell: false, timeout, maxBuffer: 256 * 1024 * 1024 });
  const prefix = join(out, label);
  writeFileSync(`${prefix}.stdout`, result.stdout ?? '');
  writeFileSync(`${prefix}.stderr`, result.stderr ?? String(result.error ?? ''));
  const status = { command: basename(command), args: argv, exitCode: result.status, signal: result.signal, error: result.error?.message ?? null, stdout: basename(`${prefix}.stdout`), stderr: basename(`${prefix}.stderr`) };
  manifest.commands.push(status); persist();
  if (!allowFailure && (result.error || result.status !== 0)) throw new Error(`${label} failed (exit ${result.status}); see ${prefix}.stderr`);
  return result.stdout ?? '';
}
const wsl = (argv, label, options) => run('wsl.exe', ['-d', 'Ubuntu', '-u', 'postgres', '--', ...argv], label, options);
const psql = (db, argv, label) => wsl(['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-h', '/var/run/postgresql', '-p', '5432', '-U', 'postgres', '-d', db, ...argv], label);
const wslPath = (path) => wsl(['wslpath', '-a', '-u', resolve(path)], `path-${sha256(path).slice(0, 12)}`).trim();
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const include = (path) => `\\i ${quote(wslPath(path))}`;
const copyTo = (query, path) => `\\copy (${query.replaceAll('\n', ' ')}) TO ${quote(wslPath(path))} CSV HEADER`;
const writeSql = (name, body) => { const file = join(out, name); writeFileSync(file, `\\set ON_ERROR_STOP on\n${body}\n`); return file; };

function sourceInventory() {
  const migrations = readdirSync(join(root, 'supabase/migrations')).filter((n) => n.endsWith('.sql')).sort();
  const testDir = join(root, 'supabase/tests');
  const suites = readdirSync(testDir).filter((n) => n.endsWith('_test.sql')).sort();
  if (!migrations.length || !suites.length) throw new Error('empty migration or test inventory');
  const files = [
    '.github/workflows/ci.yml', 'scripts/db-plpgsql-coverage-bootstrap.sql',
    'scripts/db-plpgsql-coverage-trace.sql', 'scripts/db-plpgsql-coverage-proof.sql', 'scripts/run-db-plpgsql-coverage.mjs',
    'scripts/db-plpgsql-coverage-lib.mjs',
    ...migrations.map((n) => `supabase/migrations/${n}`),
    ...readdirSync(testDir, { recursive: true }).filter((n) => n.endsWith('.sql')).map((n) => `supabase/tests/${n.replaceAll('\\', '/')}`),
  ];
  const hashes = Object.fromEntries(files.map((name) => [name, hashFile(join(root, name))]));
  for (const name of migrations) assertRepoPath(root, join(root, 'supabase/migrations', name), 'supabase/migrations', /^\d+_[A-Za-z0-9_.-]+\.sql$/);
  for (const name of suites) assertRepoPath(root, join(testDir, name), 'supabase/tests', /^[a-z0-9_]+_test\.sql$/);
  return { migrations, suites: suites.map((name) => ({ name, hash: hashes[`supabase/tests/${name}`], segments: expectedSegments(name) })), hashes };
}

function ciBootstrap() {
  const ci = yaml.load(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'));
  const step = ci?.jobs?.['migrations-validate']?.steps?.find((s) => s.name === 'Prepare extensions')?.run;
  const match = step?.match(/<<'SQL'\s*\n([\s\S]*?)\nSQL(?:\n|$)/);
  if (!match) throw new Error('CI Prepare extensions block changed');
  return match[1];
}

function substituteMigration(name, source) {
  const changes = [];
  let edited = source.replace(/DO \$\$ BEGIN\s+IF NOT EXISTS \(SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'\) THEN\s+CREATE EXTENSION pg_cron;\s+END IF;\s+END \$\$;/gi, (match) => {
    changes.push({ extension: 'pg_cron-conditional', originalSha256: sha256(match) });
    return '-- D0 managed pg_cron conditional extension represented by local stub';
  });
  edited = edited.replace(/CREATE EXTENSION (IF NOT EXISTS )?(pg_cron|pg_net|pgmq|supabase_vault)[^;]*;/gi, (match, _flag, ext) => {
    changes.push({ extension: ext, originalSha256: sha256(match) });
    return `-- D0 managed ${ext} extension represented by local stub`;
  });
  if (/CREATE EXTENSION (?:IF NOT EXISTS )?(?:pg_cron|pg_net|pgmq|supabase_vault)\b/i.test(edited)) throw new Error(`unreplaced managed extension in ${name}`);
  return { edited, changes };
}

function databasePreflight() {
  const facts = psql('postgres', ['-A', '-t', '-F', '|', '-c', "SELECT current_setting('server_version_num'), current_setting('port'), current_setting('unix_socket_directories'), current_user, (SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role'), (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role'))"], 'local-preflight').trim();
  const [version, port, sockets, user, bypass, roles] = facts.split('|');
  if (!version?.startsWith('16') || port !== '5432' || !sockets?.split(',').map((s) => s.trim()).includes('/var/run/postgresql') || user !== 'postgres' || bypass !== 't' || roles !== '3') throw new Error(`unexpected local PostgreSQL prerequisite: ${facts}`);
  manifest.postgresqlPreflight = { version, port, sockets, user, serviceBypassRls: bypass, apiRoleCount: Number(roles) };
  const exists = psql('postgres', ['-A', '-t', '-c', `SELECT count(*) FROM pg_database WHERE datname=${quote(database)}`], 'database-exists').trim();
  if (exists !== '0') throw new Error(`disposable database already exists: ${database}`);
  wsl(['createdb', '-h', '/var/run/postgresql', '-p', '5432', '-U', 'postgres', '-T', 'template0', database], 'create-database');
}

const routineQuery = `WITH routines AS (
 SELECT p.oid, p.oid::regprocedure::text AS signature, n.nspname AS schema_name,
 encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex') AS definition_sha256
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
 WHERE n.nspname IN ('public','private') AND l.lanname='plpgsql'
 AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
) SELECT * FROM routines ORDER BY signature`;
const statementQuery = `WITH routines AS (
 SELECT p.oid, p.oid::regprocedure::text AS signature, n.nspname AS schema_name,
 encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex') AS definition_sha256
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
 WHERE n.nspname IN ('public','private') AND l.lanname='plpgsql'
 AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
) SELECT r.signature,r.schema_name,r.definition_sha256,s.stmtid,s.lineno,s.stmtname,s.exec_stmts,s.exec_stmts_err
 FROM routines r CROSS JOIN LATERAL plpgsql_profiler_function_statements_tb(r.oid::regprocedure) s ORDER BY r.signature,s.stmtid`;

function orderedSuites(suites) {
  const names = suites.map((s) => s.name);
  for (const [race, ordinary] of [
    ['new_build_enquiry_replay_race_test.sql','new_build_enquiry_source_policy_test.sql'],
    ['ai_reservation_last_credit_race_test.sql','ai_reservation_spendable_credits_test.sql'],
    ['open_house_rsvp_service_quota_race_test.sql','open_house_rsvp_service_quota_test.sql'],
  ]) {
    if (!names.includes(race) || !names.includes(ordinary)) throw new Error(`missing required race pair ${race}/${ordinary}`);
    names.splice(names.indexOf(race), 1); names.splice(names.indexOf(ordinary), 1);
    names.push(race, ordinary);
  }
  return names;
}

try {
  const source = sourceInventory();
  manifest.head = run('git', ['rev-parse','HEAD'], 'git-head').trim();
  manifest.gitStatus = run('git', ['status','--porcelain=v1'], 'git-status').trim();
  manifest.source = source; persist();
  databasePreflight();
  const bootstrap = writeSql('bootstrap.sql', `${ciBootstrap()}\n${readFileSync(join(root,'scripts/db-plpgsql-coverage-bootstrap.sql'),'utf8')}`);
  manifest.bootstrapSha256 = hashFile(bootstrap);
  const migrationDir = join(out, 'migrations'); mkdirSync(migrationDir);
  const lines = [include(bootstrap), include(join(root,'scripts/db-plpgsql-coverage-trace.sql'))];
  manifest.substitutions = [];
  for (const name of source.migrations) {
    const original = readFileSync(join(root,'supabase/migrations',name),'utf8');
    const { edited, changes } = substituteMigration(name, original);
    const file = join(migrationDir,name); writeFileSync(file, edited);
    manifest.substitutions.push({ name, sourceSha256: sha256(original), replaySha256: sha256(edited), changes });
    lines.push(`\\echo D0_MIGRATION ${name}`, `SELECT set_config('remediation_trace.migration',${quote(name)},false);`, include(file));
  }
  lines.push('DROP EVENT TRIGGER remediation_capture_ddl;', 'DROP EVENT TRIGGER remediation_capture_drop;');
  const replay = writeSql('replay.sql', lines.join('\n'));
  psql(database, ['-f', wslPath(replay)], 'replay');
  manifest.status = 'replayed'; persist();

  const checks = writeSql('post-replay-checks.sql', `DO $guard$ BEGIN
 IF NOT has_table_privilege('service_role','public.firesale_requests','SELECT')
 OR NOT has_table_privilege('service_role','public.firesale_requests','INSERT')
 OR NOT has_table_privilege('service_role','public.firesale_requests','DELETE') THEN RAISE EXCEPTION 'firesale service privileges missing'; END IF;
 IF has_table_privilege('anon','public.firesale_requests','INSERT') OR has_table_privilege('authenticated','public.firesale_requests','INSERT')
 OR has_table_privilege('anon','public.firesale_requests','DELETE') OR has_table_privilege('authenticated','public.firesale_requests','DELETE') THEN RAISE EXCEPTION 'browser firesale write privilege remains'; END IF;
 IF NOT has_table_privilege('authenticated','storage.objects','SELECT') THEN RAISE EXCEPTION 'managed storage SELECT missing'; END IF;
 IF EXISTS (SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
   JOIN pg_roles r ON r.oid=a.grantee WHERE d.defaclrole='postgres'::regrole AND d.defaclnamespace='public'::regnamespace
   AND d.defaclobjtype IN ('r','S') AND r.rolname IN ('anon','authenticated','service_role'))
 THEN RAISE EXCEPTION 'future public table/sequence API defaults unexpectedly remain'; END IF;
END $guard$;
SELECT current_setting('server_version'), extname, extversion FROM pg_extension WHERE extname IN ('plpgsql_check','pgtap','pgcrypto') ORDER BY extname;`);
  manifest.extensionVersions = psql(database, ['-A','-t','-f',wslPath(checks)], 'post-replay-checks').trim().split(/\r?\n/).filter((x) => x.includes('|'));

  const lineage = `SELECT e.sequence,e.migration,e.event,e.command_tag,e.object_type,e.schema_name,e.object_identity,
 e.classid::regclass::text AS class_name,e.objid,e.objsubid,
 CASE WHEN e.classid='pg_proc'::regclass THEN EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=e.objid)
 WHEN e.classid='pg_class'::regclass THEN EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=e.objid)
 WHEN e.classid='pg_constraint'::regclass THEN EXISTS(SELECT 1 FROM pg_constraint c WHERE c.oid=e.objid)
 WHEN e.classid='pg_trigger'::regclass THEN EXISTS(SELECT 1 FROM pg_trigger t WHERE t.oid=e.objid)
 WHEN e.classid='pg_policy'::regclass THEN EXISTS(SELECT 1 FROM pg_policy p WHERE p.oid=e.objid)
 WHEN e.classid='pg_type'::regclass THEN EXISTS(SELECT 1 FROM pg_type t WHERE t.oid=e.objid)
 ELSE NULL END AS final_oid_present,
 CASE WHEN e.classid='pg_proc'::regclass THEN (SELECT encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex') FROM pg_proc p WHERE p.oid=e.objid)
 WHEN e.classid='pg_class'::regclass THEN (SELECT encode(digest(to_jsonb(c)::text,'sha256'),'hex') FROM pg_class c WHERE c.oid=e.objid)
 WHEN e.classid='pg_constraint'::regclass THEN (SELECT encode(digest(pg_get_constraintdef(c.oid,true),'sha256'),'hex') FROM pg_constraint c WHERE c.oid=e.objid)
 WHEN e.classid='pg_trigger'::regclass THEN (SELECT encode(digest(pg_get_triggerdef(t.oid,true),'sha256'),'hex') FROM pg_trigger t WHERE t.oid=e.objid)
 ELSE NULL END AS final_definition_sha256
 FROM remediation_ddl_trace.events e ORDER BY e.sequence`;
  const lineageFile = join(out,'effective-schema-lineage.csv');
  const lineageScript = writeSql('export-lineage.sql', copyTo(lineage,lineageFile));
  psql(database,['-f',wslPath(lineageScript)],'export-lineage');
  manifest.effectiveSchema = { file: basename(lineageFile), rows: parseCsv(readFileSync(lineageFile,'utf8')).length, sha256: hashFile(lineageFile), limits: 'Event-trigger DDL lineage joined by final object OID; generic or dropped-object definitions may have no final hash. Managed bootstrap precedes trace.' };

  const proofSource = readFileSync(join(root,'scripts/db-plpgsql-coverage-proof.sql'),'utf8');
  const proof = writeSql('profiler-proof.sql', proofSource);
  const proofOut = psql(database,['-A','-t','-f',wslPath(proof)],'profiler-proof');
  manifest.profilerProof = { raw: 'profiler-proof.stdout', sha256: sha256(proofOut) };

  const before = join(out,'routines-before.csv'); const after = join(out,'routines-after.csv'); const statements = join(out,'statements.csv');
  const names = orderedSuites(source.suites);
  const suiteSql = [
    '\\pset format unaligned','\\pset tuples_only on','\\set ECHO queries',
    "LOAD 'plpgsql_check';", 'SELECT plpgsql_check_profiler(true);','SELECT plpgsql_profiler_reset_all();',
    `SELECT set_config('maiprop.test_disposable_database',${quote(database)},false);`,
    copyTo(routineQuery,before),
  ];
  const boundaryGuard = `DO $guard$ BEGIN
    IF current_user <> 'postgres' OR current_setting('session_replication_role') <> 'origin'
      OR COALESCE(current_setting('request.jwt.claim.sub',true),'') <> ''
      OR COALESCE(current_setting('request.jwt.claim.role',true),'') <> ''
      OR COALESCE(current_setting('request.jwt.claims',true),'') NOT IN ('','{}')
    THEN RAISE EXCEPTION 'suite leaked role, claims, or replication state'; END IF;
    IF to_regprocedure('public.dblink_get_connections()') IS NOT NULL THEN
      IF COALESCE(array_length(public.dblink_get_connections(),1),0) <> 0 THEN RAISE EXCEPTION 'suite leaked dblink connections'; END IF;
    END IF;
  END $guard$;`;
  for (const name of names) suiteSql.push(`\\echo D0_START_TEST ${name}`,include(join(root,'supabase/tests',name)),boundaryGuard,`\\echo D0_END_TEST ${name}`);
  suiteSql.push(`DO $guard$ BEGIN
    IF EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE 'e1850000-%' OR id::text LIKE 'd1221001-%' OR id::text LIKE 'd1241001-%')
      THEN RAISE EXCEPTION 'race suite committed synthetic user residue'; END IF;
  END $guard$;`);
  suiteSql.push(copyTo(routineQuery,after),copyTo(statementQuery,statements));
  const collection = writeSql('collect.sql',suiteSql.join('\n'));
  const rawTap = psql(database,['-f',wslPath(collection)],'collection');
  manifest.tap = parseTap(rawTap,source.suites);
  const beforeRows = parseCsv(readFileSync(before,'utf8'));
  const afterRows = parseCsv(readFileSync(after,'utf8'));
  if (JSON.stringify(beforeRows) !== JSON.stringify(afterRows)) throw new Error('routine definitions or inventory changed during suites');
  const rows = parseCsv(readFileSync(statements,'utf8'));
  const report = aggregateStatements(beforeRows,rows,{threshold});
  for (const [name, hash] of Object.entries(source.hashes)) if (hashFile(join(root,name)) !== hash) throw new Error(`source drift during collection: ${name}`);
  if (run('git',['rev-parse','HEAD'],'git-head-after').trim() !== manifest.head) throw new Error('HEAD drift during collection');
  manifest.completedAt = new Date().toISOString();
  manifest.status = report.meetsThreshold ? 'valid-target-met' : 'valid-below-target';
  manifest.artifacts = Object.fromEntries([before,after,statements,lineageFile].map((file) => [basename(file),hashFile(file)]));
  writeFileSync(join(out,'coverage.json'),`${JSON.stringify({ ...report, sourceHead: manifest.head, dirty: Boolean(manifest.gitStatus), database, runId },null,2)}\n`);
  persist();
  console.log(JSON.stringify({ output: out, status: manifest.status, routines: report.routines, hit: report.hit, total: report.total, percent: report.percent, tap: manifest.tap },null,2));
  if (!report.meetsThreshold) process.exitCode = 2;
} catch (error) {
  manifest.status = 'invalid'; manifest.error = String(error.stack ?? error); persist();
  console.error(`D0 collection invalid: ${error.message}\nEvidence: ${out}`);
  process.exitCode = 1;
}
