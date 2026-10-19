import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { it } = typeof globalThis.it === 'function' ? globalThis : await import('node:test');
const api = await import('./advisor-index-release.mjs').catch(e => { if (e.code === 'ERR_MODULE_NOT_FOUND')
    return {}; throw e; });
const filename = '20260901180000_index_auction_quarantine_canonical_fk.sql';
const history = [{
        version: '20260101000000', name: 'baseline', statement_count: 1, statements_sha256: 'a'.repeat(64)
    }];
const before = () => ({
    history: structuredClone(history), catalog: {
        table: {
            schema: 'private', name: 'os_auction_duplicate_quarantine', kind: 'r', acl: null
        }, constraints: [{
                name: 'pk', type: 'p', definition: 'PRIMARY KEY (duplicate_listing_id)'
            }, {
                name: 'canonical_fk', type: 'f', definition: 'FOREIGN KEY (canonical_listing_id) REFERENCES listings(id)', columns: ['canonical_listing_id'], target: 'public.listings', validated: true
            }], indexes: [], collision: []
    }, metrics: { row_count: 48000, pages: 2400 }
});
it('rejects all non-singleton or truncated pending lists before preparing mutation', () => {
    assert.equal(typeof api.validateDryRun, 'function');
    assert.equal(api.validateDryRun(`DRY RUN: migrations will *not* be pushed to the database.\nConnecting to remote database...\nWould push these migrations:\n • ${filename}\nFinished supabase db push.\n`), filename);
    for (const text of ['', ` • ${filename}\n`, `Would push these migrations:\n • ${filename}\n • ${filename}\n`, `Would push these migrations:\n • ${filename}\n • 20260102000000_extra.sql\n`, `Would push these migrations:\n • ${filename.slice(0, -4)}\n`])
        assert.throws(() => api.validateDryRun(text));
});
it('rejects duplicate, malformed, already applied history and unsafe existing indexes', () => {
    assert.equal(typeof api.validateBefore, 'function');
    api.validateBefore(before());
    const changes = [x => x.history.push(x.history[0]), x => x.history[0].version = 'bad', x => x.history.push({ ...history[0], version: '20260901180000' }), x => x.catalog.constraints = [], x => x.catalog.collision = ['existing'], x => x.catalog.indexes.push({
            name: 'other', keys: ['canonical_listing_id'], valid: true, ready: true, live: true, method: 'btree', predicate: null, expressions: null, nkeys: 1, natts: 1
        }), x => x.catalog.indexes.push({ name: 'bad', valid: false })];
    for (const change of changes) {
        const x = before();
        change(x);
        assert.throws(() => api.validateBefore(x));
    }
});
it('requires complete immediate history/catalog equality but classifies concurrent row movement separately', () => {
    assert.equal(typeof api.validateRecheck, 'function');
    const x = before();
    x.metrics.row_count++;
    api.validateRecheck(before(), x);
    x.history[0].statements_sha256 = 'b'.repeat(64);
    assert.throws(() => api.validateRecheck(before(), x));
});
it('only accepts the fixed direct production endpoint with explicit verified TLS and fixed startup budgets', () => {
    assert.equal(typeof api.databaseTarget, 'function');
    const url = 'postgresql://postgres:secret@db.qvvicunqcrwpioqnvzxf.supabase.co:5432/postgres?sslmode=verify-full';
    const value = api.databaseTarget(url);
    assert.equal(new URL(value.url).searchParams.get("options"), "-c lock_timeout=1000ms -c statement_timeout=5000ms");
    assert.doesNotMatch(JSON.stringify(value.identity), /secret/);
    for (const bad of [url.replace('verify-full', 'require'), url + '&sslmode=disable', url + '&options=anything', url.replace(':5432', ':6543'), url.replace('qvvicunqcrwpioqnvzxf', 'xsiehskfgeoqyazcgauv'), url.replace('/postgres?', '/other?'), url.replace('db.qvvicunqcrwpioqnvzxf.supabase.co', 'aws-0.pooler.supabase.com')])
        assert.throws(() => api.databaseTarget(bad));
});
it('prepares only immutable target SQL and inert recorded numeric placeholders', () => {
    assert.equal(typeof api.prepareDb, 'function');
    const root = mkdtempSync(join(tmpdir(), 'advisor-index-test-'));
    const work = join(root, 'selected');
    api.prepareDb(process.cwd(), before(), work);
    assert.deepEqual(readdirSync(join(work, 'supabase/migrations')).sort(), ['20260101000000_recorded.sql', filename]);
    assert.equal(readFileSync(join(work, 'supabase/migrations', filename), 'utf8'), readFileSync(`supabase/migrations/${filename}`, 'utf8'));
    writeFileSync(join(work, 'supabase/migrations', '20260102000000_extra.sql'), 'select 1;');
    assert.throws(() => api.verifyPrepared(process.cwd(), before(), work));
});
it('requires exactly the two executed statements and preserves unrelated history and catalog', () => {
    assert.equal(typeof api.validateAfter, 'function');
    const after = before();
    after.history.push({
        version: '20260901180000', name: 'index_auction_quarantine_canonical_fk', statement_count: 2, statements_sha256: '6ecaae9bbcf3193a51eae265782b7a0f2afdc809b7df74884dd0efee956f60bf'
    });
    after.catalog.indexes.push({
        name: 'idx_os_auction_duplicate_quarantine_canonical_listing_id', method: 'btree', keys: ['canonical_listing_id'], valid: true, ready: true, live: true, nkeys: 1, natts: 1, predicate: null, expressions: null, comment: 'Supports canonical-listing foreign-key checks and duplicate-quarantine convergence reads.'
    });
    after.catalog.collision = [{
            schema: 'private', name: 'idx_os_auction_duplicate_quarantine_canonical_listing_id', kind: 'i'
        }];
    api.validateAfter(before(), after);
    for (const mutate of [x => x.history[1].statement_count = 0, x => x.history[1].statements_sha256 = 'a'.repeat(64), x => x.history[0].name = 'changed', x => x.catalog.indexes[0].ready = false, x => x.catalog.table.acl = 'changed']) {
        const x = structuredClone(after);
        mutate(x);
        assert.throws(() => api.validateAfter(before(), x));
    }
});
const sha = 'a'.repeat(40), tree = 'b'.repeat(40), now = new Date('2026-10-18T12:00:00.000Z');
const repository = { id: 10, full_name: 'maiprop/maiprop-listing-site' };
const runtimeEnv = () => ({
    RELEASE_SHA: sha, ADVISOR_CI_RUN_ID: '30', RELEASE_INCIDENT_ID: 'INDEX-20261019', RELEASE_REASON: `Release advisor-index-20260901180000 at ${sha}`, RELEASE_CONFIRM: `DEPLOY_PRODUCTION_BREAK_GLASS ${sha} INDEX-20261019`, GITHUB_REPOSITORY: repository.full_name, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_WORKFLOW_REF: `${repository.full_name}/.github/workflows/deploy-advisor-index.yml@refs/heads/main`, GITHUB_WORKFLOW_SHA: sha, GITHUB_RUN_ID: '40', GITHUB_RUN_ATTEMPT: '1', GITHUB_ACTOR: 'krenios', GITHUB_TRIGGERING_ACTOR: 'krenios'
});
const variables = () => ({
    PRODUCTION_RELEASE_ENABLED: 'true', PRODUCTION_RELEASE_DEPLOYERS: 'krenios', PRODUCTION_BREAK_GLASS_ACTOR: 'krenios', PRODUCTION_BREAK_GLASS_RELEASE_SHA: sha, PRODUCTION_BREAK_GLASS_INCIDENT_ID: 'INDEX-20261019', PRODUCTION_BREAK_GLASS_EXPIRES_AT: '2026-10-18T13:00:00.000Z'
});
const run = (ci = false) => ({
    id: ci ? 30 : 40, run_attempt: 1, head_sha: sha, head_branch: 'main', event: ci ? 'push' : 'workflow_dispatch', path: ci ? '.github/workflows/ci.yml' : '.github/workflows/deploy-advisor-index.yml', status: ci ? 'completed' : 'in_progress', conclusion: ci ? 'success' : null, repository, head_repository: repository, actor: { login: 'krenios' }, triggering_actor: { login: 'krenios' }
});
const fixtureWorkflowSources=Object.fromEntries(['deploy-advisor-index.yml','deploy-production-release.yml','deploy-auction-recovery.yml','deploy-catalogue-performance-hotfix.yml','direct-cloudflare-production-deploy.yml'].map(name=>[`.github/workflows/${name}`,"on:\n  workflow_dispatch:\njobs:\n  deploy:\n    env:\n      RELEASE_AUTHORIZATION_ACTION: production-deploy\n"]));
const fixtureGit=(...args)=>args[0]==='ls-tree'?Object.keys(fixtureWorkflowSources).join('\n'):args[0]==='show'?fixtureWorkflowSources[args[1].slice(5)]:args[0]==='status'?'':args[1]==='HEAD'?sha:tree;
const control = () => ({
    env: runtimeEnv(), currentMain: sha, checkout: sha, tree, clean: true, variables: variables(), ci: run(true), run: run(), dispatches: [run()]
});
it('requires live main, original successful CI, exact producer and configured generic deploy grant', () => {
    assert.equal(typeof api.validateControl, 'function');
    const value = api.validateControl(control(), now);
    assert.equal(value.authorization.mode, 'break_glass');
    assert.equal(value.authorization.action, 'production-deploy');
    const changes = [x => x.currentMain = 'c'.repeat(40), x => x.checkout = 'c'.repeat(40), x => x.clean = false, x => x.tree = 'bad', x => x.env.GITHUB_REF = 'refs/heads/other', x => x.env.GITHUB_RUN_ATTEMPT = '2', x => x.env.GITHUB_ACTOR = 'other', x => x.env.GITHUB_WORKFLOW_REF = x.env.GITHUB_WORKFLOW_REF.replace('deploy-advisor-index', 'deploy-auction-recovery'), x => x.ci.run_attempt = 2, x => x.ci.conclusion = 'failure', x => x.ci.event = 'workflow_dispatch', x => x.ci.head_repository = { ...repository, id: 20 }, x => x.run.path = '.github/workflows/other.yml', x => x.variables.PRODUCTION_RELEASE_ENABLED = 'false', x => x.variables.PRODUCTION_BREAK_GLASS_RELEASE_SHA = 'c'.repeat(40), x => x.variables.PRODUCTION_BREAK_GLASS_EXPIRES_AT = '2026-10-18T11:00:00Z', x => x.dispatches.push({ ...run(), id: 41 }), x => x.env.RELEASE_REASON = 'unrelated deployment authorization'];
    for (const change of changes) {
        const x = control();
        change(x);
        assert.throws(() => api.validateControl(x, now));
    }
});
it('reads every replay page and rejects expired prior receipts and incomplete pagination', () => {
    assert.equal(typeof api.completePages, 'function');
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }));
    let calls = 0;
    const values = api.completePages(page => { calls++; return { total_count: 101, artifacts: page === 1 ? rows : [{ id: 101 }] }; }, 'artifacts');
    assert.equal(values.length, 101);
    assert.equal(calls, 2);
    assert.throws(() => api.completePages(() => ({ total_count: 101, artifacts: [] }), 'artifacts'));
    assert.throws(() => api.completePages(() => ({ total_count: 101, artifacts: rows }), 'artifacts'));
    assert.throws(() => api.completePages(() => ({ total_count: 1000, workflow_runs: [] }), 'workflow_runs'));
    const name = `production-break-glass-consumed-production-deploy-${sha}-INDEX-20261019`;
    api.validateReplay([], name);
    assert.throws(() => api.validateReplay([{
            id: 2, name, expired: true
        }], name));
    api.validateReplay([{
            id: 2, name, expired: false
        }], name, '2');
    assert.throws(() => api.validateReplay([{
            id: 2, name, expired: true
        }], name, '2'));
});
it('control adapter captures explicit workflow vars without a Variables API fallback', () => {
    assert.equal(typeof api.liveControl, 'function');
    const routes = [];
    const input = control();
    const get = path => { routes.push(path); if (path.endsWith('/commits/main'))
        return { sha }; if (path.endsWith('/runs/30'))
        return input.ci; if (path.endsWith('/runs/40'))
        return input.run; if (path.includes('/variables/'))
        return { name: path.split('/').at(-1), value: input.variables[path.split('/').at(-1)] }; if (path.includes('event=workflow_dispatch'))
        return { total_count: 1, workflow_runs: [input.run] }; throw Error(`unexpected ${path}`); };
    const git = fixtureGit;
    const value = api.liveControl({ ...runtimeEnv(), ...variables() }, {
        get, git, now: () => now
    });
    assert.equal(value.authorization.release_sha, sha);
    assert.equal(routes.filter(x => x.includes('/variables/')).length, 0);
    assert.throws(() => api.liveControl(runtimeEnv(), {
        get: () => { throw Error('offline'); }, git, now: () => now
    }));
});
const leaseInput = () => ({
    target: {
        project: 'qvvicunqcrwpioqnvzxf', host: 'db.qvvicunqcrwpioqnvzxf.supabase.co', port: 5432, database: 'postgres', user: 'postgres', sslmode: 'verify-full', transport: 'direct'
    }, artifact: {
        artifact_id: '50', artifact_digest: 'c'.repeat(64), payload_sha256: 'd'.repeat(64)
    }, consumption: {
        artifact_id: '60', artifact_digest: 'e'.repeat(64), binding_artifact_id: '61', payload_sha256: 'f'.repeat(64), action: 'production-deploy', incident_id: 'INDEX-20261019', release_sha: sha, parent_run_id: '40'
    }, before: before(), pending: filename
});
it('leases bind every authority, source, artifact, target and finite budget field and never renew after starting', () => {
    assert.equal(typeof api.createLease, 'function');
    const context = api.validateControl(control(), now), input = leaseInput();
    const lease = api.createLease(context, input, now);
    assert.equal(lease.evidence_type, 'maiprop-advisor-index-mutation-lease');
    assert.equal(lease.expires_at, '2026-10-18T12:15:00.000Z');
    api.validateLease(lease, context, input, now);
    const changes = [x => x.scope = 'auction', x => x.target.project = 'other', x => x.budgets.lock_ms = 5000, x => x.run.run_id = '41', x => x.source_tree = 'c'.repeat(40), x => x.ci.run_attempt = '2', x => x.artifact.artifact_id = '51', x => x.consumption.binding_artifact_id = '62', x => x.history_sha256 = '0'.repeat(64), x => x.authorization_sha256 = '0'.repeat(64), x => x.nonce = '', x => x.extra = true];
    for (const change of changes) {
        const x = structuredClone(lease);
        change(x);
        assert.throws(() => api.validateLease(x, context, input, now));
    }
    for (const time of ['2026-10-18T11:59:59Z', '2026-10-18T12:14:41Z', '2026-10-18T12:15:00Z'])
        assert.throws(() => api.validateLease(lease, context, input, new Date(time)));
    const shortened = control();
    shortened.variables.PRODUCTION_BREAK_GLASS_EXPIRES_AT = '2026-10-18T12:05:00Z';
    const shortContext = api.validateControl(shortened, now);
    assert.equal(api.createLease(shortContext, input, now).expires_at, '2026-10-18T12:05:00.000Z');
});
import { createReleaseArtifactBinding } from './release-artifact-binding.mjs';
it('packages only contract manifest and original SQL, and verifies signed payload/run identity', () => {
    assert.equal(typeof api.packageRelease, 'function');
    assert.equal(typeof api.verifyEvidence, 'function');
    const context = api.validateControl(control(), now);
    const root = mkdtempSync(join(tmpdir(), 'advisor-evidence-'));
    const payload = join(root, 'selected');
    api.packageRelease(process.cwd(), payload, context);
    assert.deepEqual(readdirSync(payload).sort(), [filename, 'manifest.json']);
    const manifest = JSON.parse(readFileSync(join(payload, 'manifest.json'), 'utf8'));
    assert.equal(manifest.source_tree, tree);
    assert.equal(manifest.ci.run_id, '30');
    const key = 'local-test-signing-key-32-bytes-minimum';
    const name = `advisor-index-selected-${sha}-40`;
    const binding = createReleaseArtifactBinding({
        ...context, payloadRoot: payload, artifactId: '50', artifactName: name, artifactDigest: 'c'.repeat(64), keyId: 'test-key', signingKey: key, issuedAt: '2026-01-01T00:00:00Z'
    });
    const meta = {
        id: 50, name, expired: false, digest: 'sha256:' + 'c'.repeat(64), workflow_run: {
            id: 40, head_sha: sha, repository_id: 10, head_repository_id: 10
        }
    };
    const get = path => path.endsWith('/artifacts/50') ? meta : run();
    const env = { RELEASE_EVIDENCE_SIGNING_KEY: key, RELEASE_EVIDENCE_SIGNING_KEY_ID: 'test-key' };
    assert.equal(api.verifyEvidence('selected', payload, binding, context, get, env).artifact_id, '50');
    for (const change of [x => x.signature.key_id = 'wrong', x => x.signature.value = '0'.repeat(64), x => x.artifact.id = '51', x => x.producer.run_id = '41', x => x.files[0].sha256 = '0'.repeat(64)]) {
        const x = structuredClone(binding);
        change(x);
        assert.throws(() => api.verifyEvidence('selected', payload, x, context, get, env));
    }
    assert.throws(() => api.verifyEvidence('selected', payload, binding, context, () => ({ ...meta, expired: true }), env));
    writeFileSync(join(payload, 'extra.sql'), 'select 1;');
    assert.throws(() => api.verifyEvidence('selected', payload, binding, context, get, env));
});
it('launches the official CLI exactly once only after live boundary validation and retains ambiguous failure without retry', () => {
    assert.equal(typeof api.applyOnce, 'function');
    const root = mkdtempSync(join(tmpdir(), 'advisor-apply-'));
    const events = [];
    const boundary = () => { events.push('boundary'); return { expires_at: '2026-10-18T12:15:00.000Z' }; };
    const cli = (args, options) => { events.push({ args, options }); return {
        status: 0, stdout: 'applied', stderr: ''
    }; };
    api.applyOnce({
        directory: root, url: 'postgresql://redacted', work: '/fixed/selected', cli: '/pinned/supabase', boundary, invoke: cli, now: () => now
    });
    assert.equal(events[0], 'boundary');
    assert.deepEqual(events[1].args, ['db', 'push', '--workdir', '/fixed/selected', '--db-url', 'postgresql://redacted', '--skip-vault', '--include-all', '--yes']);
    assert.equal(events[1].options.timeout, 20000);
    assert.equal(events.length, 2);
    assert.throws(() => api.applyOnce({
        directory: root, url: 'x', work: 'x', cli: 'x', boundary, invoke: cli, now: () => now
    }));
    assert.equal(events.length, 2);
    for (const kind of ['preflight', 'expiry', 'timeout', 'disconnect']) {
        const dir = mkdtempSync(join(tmpdir(), 'advisor-failed-'));
        let applies = 0;
        assert.throws(() => api.applyOnce({
            directory: dir, url: 'postgresql://secret', work: 'x', cli: 'x', boundary: () => { if (kind === 'preflight')
                throw Error('invalid evidence'); return { expires_at: kind === 'expiry' ? '2026-10-18T12:00:00Z' : '2026-10-18T12:15:00Z' }; }, now: () => now, invoke: () => { applies++; return {
                status: null, signal: 'SIGKILL', stdout: '', stderr: kind
            }; }
        }));
        assert.equal(applies, kind === 'preflight' || kind === 'expiry' ? 0 : 1);
        if (applies) {
            assert.match(readFileSync(join(dir, 'attempt.json'), 'utf8'), /ambiguous/);
            assert.doesNotMatch(readFileSync(join(dir, 'apply.log'), 'utf8'), /postgresql:\/\/secret/);
        }
    }
});
function flowFixture() {
    const root = mkdtempSync(join(tmpdir(), 'advisor-flow-'));
    const env = {
        ...runtimeEnv(), ...variables(), RUNNER_TEMP: root, GITHUB_OUTPUT: join(root, 'outputs'), TARGET_DB_URL: 'postgresql://postgres:secret@db.qvvicunqcrwpioqnvzxf.supabase.co:5432/postgres?sslmode=verify-full', RELEASE_EVIDENCE_SIGNING_KEY: 'local-test-signing-key-32-bytes-minimum', RELEASE_EVIDENCE_SIGNING_KEY_ID: 'test-key'
    };
    const state = {
        artifacts: [], snapshot: before(), applies: 0, commands: [], current: control(), time: now, outcome: 'disconnect', cliVersion: '2.116.0'
    };
    const get = path => {
        if (path.includes('/variables/'))
            throw Error('Variables API is unavailable, with no fallback');
        if (path.endsWith('/commits/main'))
            return { sha: state.current.currentMain };
        if (path.endsWith('/runs/30'))
            return state.current.ci;
        if (path.endsWith('/runs/40'))
            return state.current.run;
        if (path.includes('event=workflow_dispatch'))
            return { total_count: state.current.dispatches.length, workflow_runs: state.current.dispatches };
        if (path.includes('/artifacts?'))
            return { total_count: state.artifacts.length, artifacts: state.artifacts };
        if (/\/artifacts\/\d+$/.test(path))
            return state.artifacts.find(x => String(x.id) === path.split('/').at(-1));
        throw Error(`unexpected ${path}`);
    };
    const adapters = {
        get, git: fixtureGit, now: () => state.time, invoke: (exe, args, options) => {
            state.commands.push({
                exe, args, options
            });
            if (exe === 'psql')
                return {
                    status: 0, stdout: JSON.stringify(state.snapshot), stderr: ''
                };
            if (args[0] === '--version')
                return {
                    status: 0, stdout: state.cliVersion + '\n', stderr: ''
                };
            if (args.includes('--dry-run'))
                return {
                    status: 0, stdout: `Would push these migrations:\n • ${filename}\nFinished supabase db push.\n`, stderr: ''
                };
            state.applies++;
            if (state.outcome !== 'success')
                return {
                    status: null, signal: 'SIGKILL', stdout: '', stderr: state.outcome
                };
            state.snapshot.history.push({
                version: '20260901180000', name: 'index_auction_quarantine_canonical_fk', statement_count: 2, statements_sha256: '6ecaae9bbcf3193a51eae265782b7a0f2afdc809b7df74884dd0efee956f60bf'
            });
            state.snapshot.catalog.indexes.push({
                name: 'idx_os_auction_duplicate_quarantine_canonical_listing_id', method: 'btree', keys: ['canonical_listing_id'], valid: true, ready: true, live: true, nkeys: 1, natts: 1, predicate: null, expressions: null, comment: 'Supports canonical-listing foreign-key checks and duplicate-quarantine convergence reads.'
            });
            state.snapshot.catalog.collision = [{
                    schema: 'private', name: 'idx_os_auction_duplicate_quarantine_canonical_listing_id', kind: 'i'
                }];
            return {
                status: 0, stdout: 'applied', stderr: ''
            };
        }
    };
    const execute = (command, args = []) => api.execute(command, args, {
        env, adapters, source: process.cwd()
    });
    const upload = (kind, id) => {
        const name = kind === 'receipt' ? `production-break-glass-consumed-production-deploy-${sha}-INDEX-20261019` : `advisor-index-${kind}-${sha}-40`;
        const add = (artifactName, artifactId) => state.artifacts.push({
            id: artifactId, name: artifactName, expired: false, digest: 'sha256:' + 'c'.repeat(64), workflow_run: {
                id: 40, head_sha: sha, repository_id: 10, head_repository_id: 10
            }
        });
        add(name, id);
        execute('sign', [kind, String(id), 'c'.repeat(64)]);
        add(`${name}-binding`, id + 1);
    };
    const prepare = () => { execute('package'); upload('selected', 50); execute('prepare-db'); execute('consume'); upload('receipt', 60); execute('issue-lease'); upload('lease', 70); };
    return {
        root, env, state, execute, prepare
    };
}
it('successful real orchestration invokes one selected CLI mutation and verifies exact after evidence', () => {
    const flow = flowFixture();
    flow.prepare();
    flow.state.outcome = 'success';
    const result = flow.execute('apply');
    assert.equal(flow.state.applies, 1);
    assert.equal(result.history_verified, true);
    assert.equal(result.catalog_verified, true);
    assert.equal(flow.state.commands.filter(x => x.args.includes('--dry-run')).length, 1);
    assert.equal(JSON.parse(readFileSync(join(flow.root, 'advisor-index/evidence/attempt.json'), 'utf8')).state, 'verified');
    assert.match(readFileSync(flow.env.GITHUB_OUTPUT, 'utf8'), /^receipt_name=production-break-glass-consumed-production-deploy-/);
    assert.ok(flow.state.commands.filter(x => x.exe === 'psql').every(x => x.args.includes('--no-psqlrc') && x.args.some(y => typeof y === 'string' && y.includes('BEGIN READ ONLY'))));
});
it('every preflight rejects before the official CLI mutation, including missing or tampered signed grants', () => {
    const failures = [
        f => f.state.current.currentMain = 'c'.repeat(40),
        f => f.state.current.ci.conclusion = 'failure',
        f => f.state.current.run.actor.login = 'other',
        f => f.state.current.dispatches.push({ ...run(), id: 41 }),
        f => f.state.snapshot.history[0].name = 'changed',
        f => f.state.snapshot.catalog.table.acl = 'changed',
        f => f.state.artifacts.find(x => x.id === 70).expired = true,
        f => { const item=f.state.artifacts.find(x=>x.id===71); item.workflow_run.repository_id=11; item.workflow_run.head_repository_id=11; },
        f => f.state.artifacts.find(x => x.id === 60).digest = 'sha256:' + 'e'.repeat(64),
        f => f.state.artifacts.push({
            ...f.state.artifacts.find(x => x.id === 60), id: 80, expired: true
        }),
        f => f.state.time = new Date('2026-10-18T12:15:00Z'),
        f => f.state.cliVersion = '2.100.0',
        f => f.env.TARGET_DB_URL = f.env.TARGET_DB_URL.replace('verify-full', 'disable'),
        f => f.env.RELEASE_EVIDENCE_SIGNING_KEY = 'incorrect-signing-key-at-least-32-bytes',
        f => writeFileSync(join(f.root, 'advisor-index/selected/manifest.json'), '{}'),
        f => writeFileSync(join(f.root, 'advisor-index/lease/lease.json'), '{}'),
        f => writeFileSync(join(f.root, 'advisor-index/receipt/receipt.json'), '{}'),
        f => writeFileSync(join(f.root, 'advisor-index/apply-work/supabase/migrations/20260102000000_extra.sql'), 'select 1;'),
        f => writeFileSync(join(f.root, 'advisor-index/evidence/dry-run.log'), `Would push these migrations:\n • ${filename}\n • ${filename}\n`),
    ];
    for (const mutate of failures) {
        const flow = flowFixture();
        flow.prepare();
        mutate(flow);
        assert.throws(() => flow.execute('apply'));
        assert.equal(flow.state.applies, 0);
    }
    const missing = flowFixture();
    delete missing.env.PRODUCTION_BREAK_GLASS_ACTOR;
    assert.throws(() => missing.prepare());
    assert.equal(missing.state.applies, 0);
});
it('post-capture configuration changes remain unobservable within the signed window, and failures never replay', () => {
    for (const outcome of ['lock timeout', 'statement timeout', 'disconnect']) {
        const flow = flowFixture();
        flow.prepare();
        flow.env.PRODUCTION_RELEASE_ENABLED = 'false';
        flow.state.current.variables.PRODUCTION_RELEASE_ENABLED = 'false';
        flow.state.outcome = outcome;
        assert.throws(() => flow.execute('apply'));
        assert.equal(flow.state.applies, 1);
        assert.throws(() => flow.execute('apply'));
        assert.equal(flow.state.applies, 1);
        assert.equal(JSON.parse(readFileSync(join(flow.root, 'advisor-index/evidence/attempt.json'), 'utf8')).state, 'ambiguous');
        assert.ok(readFileSync(join(flow.root, 'advisor-index/evidence/after-failure.json'), 'utf8'));
    }
});
it('captures only trusted workflow variables and binds provenance, age and identity into signed grant evidence', () => {
    assert.equal(typeof api.validateGrantSnapshot, 'function');
    const context = api.validateControl(control(), now);
    const snapshot = context.grantSnapshot;
    assert.equal(snapshot.provenance, 'github-workflow-vars-context');
    assert.equal(snapshot.captured_at, now.toISOString());
    api.validateGrantSnapshot(snapshot, context, now);
    for (const mutate of [x => x.provenance = 'caller-json', x => x.run_id = '41', x => x.configured.PRODUCTION_RELEASE_ENABLED = 'false', x => x.captured_at = '2026-10-18T12:00:01.000Z', x => x.captured_at = '2026-10-18T11:44:59.000Z', x => x.extra = 'unsigned']) {
        const x = structuredClone(snapshot);
        mutate(x);
        assert.throws(() => api.validateGrantSnapshot(x, context, now));
    }
    const later = new Date('2026-10-18T12:10:00Z');
    const lease = api.createLease(context, leaseInput(), later);
    assert.equal(lease.expires_at, '2026-10-18T12:15:00.000Z');
    assert.throws(() => api.createLease(context, leaseInput(), new Date('2026-10-18T12:15:00Z')));
});
import yaml from 'js-yaml';
import { spawnSync } from 'node:child_process';
it('workflow rejects caller configuration, missing leases and additional mutation paths', () => {
    assert.equal(typeof api.workflowViolations, 'function');
    const workflow = yaml.load(readFileSync('.github/workflows/deploy-advisor-index.yml', 'utf8'));
    assert.deepEqual(api.workflowViolations(workflow), []);
    for (const mutate of [x => x.jobs.deploy.environment = 'staging', x => x.concurrency['cancel-in-progress'] = true, x => x.on.workflow_dispatch.inputs.scope = { type: 'string' }, x => x.jobs.deploy.steps.find(s => s.run?.endsWith(' package')).env.PRODUCTION_BREAK_GLASS_ACTOR = '${{ inputs.actor }}', x => x.jobs.deploy.steps = x.jobs.deploy.steps.filter(s => s.run !== 'node scripts/advisor-index-release.mjs issue-lease'), x => x.jobs.deploy.steps.push({ run: 'supabase db push' }), x => x.jobs.deploy.steps.find(s => s.run === 'bash scripts/advisor-index-db.sh apply').if = 'always()']) {
        const x = structuredClone(workflow);
        mutate(x);
        assert.notEqual(api.workflowViolations(x).length, 0);
    }
});
it('workflow database phases execute only the bounded driver and reject extra arguments', () => {
    const workflow = yaml.load(readFileSync('.github/workflows/deploy-advisor-index.yml', 'utf8'));
    const driver = readFileSync('scripts/advisor-index-db.sh', 'utf8').replaceAll('\r', '');
    const bash = (source) => spawnSync(process.platform === 'win32' ? 'wsl.exe' : 'bash', process.platform === 'win32' ? ['--exec', 'bash'] : [], { input: source, encoding: 'utf8' });
    for (const phase of ['prepare-db', 'apply']) {
        const step = workflow.jobs.deploy.steps.find(s => s.run === `bash scripts/advisor-index-db.sh ${phase}`);
        assert.ok(step);
        const result = bash(`node() { printf 'BOUNDARY:%s\\n' "$*"; }; export -f node\nexec() { "$@"; }\nset -- ${phase}\n${driver}`);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout.trim(), `BOUNDARY:scripts/advisor-index-release.mjs ${phase}`);
    }
    for (const args of ['', 'other', 'apply extra']) {
        const result = bash(`node() { echo SHOULD_NOT_RUN; }; export -f node\nexec() { "$@"; }\nset -- ${args}\n${driver}`);
        assert.notEqual(result.status, 0);
        assert.doesNotMatch(result.stdout, /SHOULD_NOT_RUN/);
    }
});
it('rejects a zero-exit but truncated dry-run before the completed pending-list marker', () => {
    assert.throws(() => api.validateDryRun(`Would push these migrations:\n • ${filename}\n`));
});
import { mkdirSync, symlinkSync } from 'node:fs';
it('rejects changed source SQL and directory junctions without preparing a selected workdir', () => {
    const root = mkdtempSync(join(tmpdir(), 'advisor-source-'));
    mkdirSync(join(root, 'supabase'));
    mkdirSync(join(root, 'supabase/migrations'));
    writeFileSync(join(root, 'supabase/migrations', filename), 'select 1;');
    assert.throws(() => api.prepareDb(root, before(), join(root, 'selected')));
    const linkRoot = mkdtempSync(join(tmpdir(), 'advisor-link-'));
    symlinkSync(join(process.cwd(), 'supabase'), join(linkRoot, 'supabase'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => api.sourceSql(linkRoot));
});
it('importing validators requires no workflow context and executes no GitHub/database process', () => {
    const url = new URL('./advisor-index-release.mjs', import.meta.url).href;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)});console.log('imported')`], {
        cwd: tmpdir(), env: {}, encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'imported');
});

it('rejects a caller-selected checkout SHA before any repository script can run',()=>{
 const workflow=yaml.load(readFileSync('.github/workflows/deploy-advisor-index.yml','utf8'));
 const first=workflow.jobs.deploy.steps[0];assert.equal(typeof first.run,'string');
 for(const selected of ['a'.repeat(40),'b'.repeat(40),'invalid']){
  const input=`RELEASE_SHA=${selected}\nGITHUB_WORKFLOW_SHA=${'a'.repeat(40)}\nGITHUB_REPOSITORY=maiprop/maiprop-listing-site\ngh() { printf '%s\\n' '${'a'.repeat(40)}'; }\n${first.run}\necho CHECKOUT_ALLOWED\n`;
  const result=spawnSync(process.platform==='win32'?'wsl.exe':'bash',process.platform==='win32'?['--exec','bash']:[],{input,encoding:'utf8'});
  assert.equal(result.stdout.includes('CHECKOUT_ALLOWED'),selected==='a'.repeat(40));
 }
});

it('classifies replay roots from exact-tree workflow inventory and permits unrelated dispatches only',()=>{
 assert.equal(typeof api.classifyDispatchWorkflows,'function');
 const names=['deploy-advisor-index.yml','deploy-production-release.yml','deploy-auction-recovery.yml','deploy-catalogue-performance-hotfix.yml','direct-cloudflare-production-deploy.yml'];
 const sources=Object.fromEntries(names.map(name=>[`.github/workflows/${name}`,"on:\n  workflow_dispatch:\njobs:\n  deploy:\n    env:\n      RELEASE_AUTHORIZATION_ACTION: production-deploy\n"]));
 sources['.github/workflows/read-only.yml']='on:\n  workflow_dispatch:\njobs: {}\n';sources['.github/workflows/stage-release.yml']='on:\n  workflow_dispatch:\njobs: {}\n';
 const inventory=api.classifyDispatchWorkflows(sources);
 for(const path of ['.github/workflows/read-only.yml','.github/workflows/stage-release.yml']){const x=control();x.workflowInventory=inventory;x.dispatches.push({...run(),id:41,path});api.validateControl(x,now);}
 for(const path of [...names.map(n=>`.github/workflows/${n}`),'.github/workflows/unknown.yml','bad']){const x=control();x.workflowInventory=inventory;x.dispatches.push({...run(),id:41,path});assert.throws(()=>api.validateControl(x,now));}
 sources['.github/workflows/new-consumer.yml']=sources['.github/workflows/deploy-production-release.yml'];assert.throws(()=>api.classifyDispatchWorkflows(sources));
});

it('current workflow source inventory has exactly the reviewed production-deploy roots',()=>{
 const sources=Object.fromEntries(readdirSync('.github/workflows').filter(x=>/\.ya?ml$/.test(x)).map(x=>[`.github/workflows/${x}`,readFileSync(`.github/workflows/${x}`,'utf8')]));
 const result=api.classifyDispatchWorkflows(sources);assert.equal(result.consumers.length,5);assert.ok(result.nonconsuming.includes('.github/workflows/staging-scale-proof.yml'));assert.ok(result.nonconsuming.includes('.github/workflows/live-operational-smoke.yml'));
});
