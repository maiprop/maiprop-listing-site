import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { stableJson } from './release-artifact-binding.mjs';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { selectReleaseAuthorization, releaseAuthorizationSha256 } from './production-break-glass-validation.mjs';
import { consumptionArtifactName } from './production-break-glass-consumption.mjs';
import { existsSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createReleaseArtifactBinding, verifyReleaseArtifactBinding } from './release-artifact-binding.mjs';
import { createConsumptionReceipt, validateConsumptionReceipt, consumptionTuple } from './production-break-glass-consumption.mjs';
import { pathToFileURL } from 'node:url';
import yaml from 'js-yaml';

export const CONTRACT = Object.freeze({
    scope: 'advisor-index-20260901180000', repository: 'maiprop/maiprop-listing-site',
    project: 'qvvicunqcrwpioqnvzxf', version: '20260901180000', name: 'index_auction_quarantine_canonical_fk',
    file: 'supabase/migrations/20260901180000_index_auction_quarantine_canonical_fk.sql',
    sql_sha256: 'bc33e3a2326a0a457a214b37474c95b1e5a0a7d3173f8a78a5d56939d43c995f',
    statements_sha256: '6ecaae9bbcf3193a51eae265782b7a0f2afdc809b7df74884dd0efee956f60bf',
    relation: 'private.os_auction_duplicate_quarantine', index: 'idx_os_auction_duplicate_quarantine_canonical_listing_id',
    key: 'canonical_listing_id', cli: '2.116.0',
    grant_policy: 'Signed workflow vars snapshot; configuration changes after capture may remain unobserved until expiry. No immediate revocation guarantee.',
    budgets: Object.freeze({
        lock_ms: 1000, statement_ms: 5000, process_ms: 20000, lease_ms: 900000
    })
});
const filename = CONTRACT.file.split('/').at(-1);
const comment = 'Supports canonical-listing foreign-key checks and duplicate-quarantine convergence reads.';
const placeholder = '-- Already recorded remotely; inert selected-release placeholder.\n';
const fail = message => { throw Error(`Advisor index: ${message}`); };
const requireValue = (ok, message) => { if (!ok)
    fail(message); };
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : stableJson(value)).digest('hex');
function equal(a, b, label) { requireValue(stableJson(a) === stableJson(b), `${label} differs`); }
function exact(value, keys, label) { requireValue(value && typeof value === 'object' && !Array.isArray(value), `${label} missing`); equal(Object.keys(value).sort(), [...keys].sort(), `${label} fields`); }
function regular(path) { requireValue(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(), 'regular file required'); return readFileSync(path); }
export function sourceSql(root) {
    for (const part of ['supabase', 'supabase/migrations'])
        requireValue(!lstatSync(join(root, part)).isSymbolicLink(), 'source directory symlink');
    const sql = regular(join(root, CONTRACT.file));
    equal(digest(sql), CONTRACT.sql_sha256, 'immutable SQL');
    return sql;
}
function historyRows(history) {
    requireValue(Array.isArray(history), 'complete history required');
    let previous = '';
    for (const row of history) {
        exact(row, ['version', 'name', 'statement_count', 'statements_sha256'], 'history row');
        requireValue(/^\d+$/.test(row.version) && row.version > previous, 'duplicate, nonnumeric or unordered history');
        previous = row.version;
        requireValue(typeof row.name === 'string' && Number.isInteger(row.statement_count) && row.statement_count >= 0 && /^[a-f0-9]{64}$/.test(row.statements_sha256), 'incomplete history');
    }
}
function catalogBase(catalog) {
    exact(catalog, ['table', 'constraints', 'indexes', 'collision'], 'catalog');
    requireValue(catalog.table?.schema === 'private' && catalog.table?.name === 'os_auction_duplicate_quarantine' && catalog.table?.kind === 'r' && Object.hasOwn(catalog.table, 'acl'), 'target table missing');
    requireValue(Array.isArray(catalog.constraints) && catalog.constraints.some(x => x.type === 'p') && catalog.constraints.some(x => x.type === 'f' && x.validated === true && stableJson(x.columns) === '["canonical_listing_id"]' && x.target === 'public.listings'), 'target FK/PK missing');
    requireValue(Array.isArray(catalog.indexes) && Array.isArray(catalog.collision), 'incomplete index catalog');
    for (const index of catalog.indexes)
        requireValue(index.valid === true && index.ready === true && index.live === true && index.predicate === null && index.expressions === null && Array.isArray(index.keys), 'invalid/partial/expression index');
}
export function validateBefore(snapshot) {
    exact(snapshot, ['history', 'catalog', 'metrics'], 'snapshot');
    historyRows(snapshot.history);
    catalogBase(snapshot.catalog);
    requireValue(!snapshot.history.some(x => x.version === CONTRACT.version), 'target already recorded');
    requireValue(snapshot.catalog.collision.length === 0 && !snapshot.catalog.indexes.some(x => x.name === CONTRACT.index || x.keys[0] === CONTRACT.key), 'colliding or equivalent canonical index');
    return snapshot;
}
export function validateRecheck(before, current) {
    validateBefore(before);
    validateBefore(current);
    equal(current.history, before.history, 'history recheck');
    equal(current.catalog, before.catalog, 'catalog recheck');
}
export function validateAfter(before, after) {
    validateBefore(before);
    historyRows(after.history);
    catalogBase(after.catalog);
    equal(after.history.filter(x => x.version !== CONTRACT.version), before.history, 'prior history');
    equal(after.history.filter(x => x.version === CONTRACT.version), [{
            version: CONTRACT.version, name: CONTRACT.name, statement_count: 2, statements_sha256: CONTRACT.statements_sha256
        }], 'executed target statements');
    equal(after.catalog.table, before.catalog.table, 'table/ACL');
    equal(after.catalog.constraints, before.catalog.constraints, 'FK/PK');
    equal(after.catalog.indexes.filter(x => x.name !== CONTRACT.index), before.catalog.indexes, 'prior indexes');
    const target = after.catalog.indexes.filter(x => x.name === CONTRACT.index);
    requireValue(target.length === 1, 'target index count');
    const index = target[0];
    requireValue(index.method === 'btree' && index.nkeys === 1 && index.natts === 1 && stableJson(index.keys) === '["canonical_listing_id"]' && index.comment === comment, 'target index shape/comment');
    equal(after.catalog.collision, [{
            schema: 'private', name: CONTRACT.index, kind: 'i'
        }], 'index collision catalog');
    return {
        history_verified: true, catalog_verified: true, data_evidence: stableJson(before.metrics) === stableJson(after.metrics) ? 'metrics unchanged; no row-content proof' : 'inconclusive: concurrent data/metric change'
    };
}
export function validateDryRun(record) {
    requireValue(record?.status === 0 && record.signal === null && record.error === false, 'CLI dry-run failed');
    for (const text of [record.stdout, record.stderr])
        requireValue(typeof text === 'string' && !text.includes('\u001b') && !text.replaceAll('\r\n', '\n').includes('\r'), 'ambiguous dry-run output');
    const lines = text => text.replaceAll('\r\n', '\n').replace(/\n$/, '').split('\n');
    // The pinned CLI emits completion on stdout and the pending list on stderr.
    // Preserve stream identity: concatenation cannot establish temporal ordering.
    equal(lines(record.stdout), ['Finished supabase db push.'], 'complete dry-run stdout');
    const diagnostics = lines(record.stderr);
    const header = diagnostics.indexOf('Would push these migrations:');
    requireValue(header >= 0, 'missing pending header');
    equal(diagnostics.slice(header), ['Would push these migrations:', ` \u2022 ${filename}`], 'singleton pending migration');
    const prefix = diagnostics.slice(0, header);
    requireValue(new Set(prefix).size === prefix.length && prefix.every(line =>
        line === 'DRY RUN: migrations will *not* be pushed to the database.' ||
        line === 'Connecting to remote database...' ||
        /^NotFound: FileSystem\.readFile \(\/[a-zA-Z0-9_./-]+\/\.supabase\/profile\)$/.test(line)), 'unknown dry-run diagnostic');
    requireValue(((record.stdout + record.stderr).match(/\.sql/g) ?? []).length === 1, 'extra/ambiguous migration filename');
    return filename;
}
export function databaseTarget(raw) {
    let url;
    try {
        url = new URL(raw);
    }
    catch {
        fail('invalid database URL');
    }
    requireValue(['postgres:', 'postgresql:'].includes(url.protocol) && url.hostname === `db.${CONTRACT.project}.supabase.co` && (url.port === '' || url.port === '5432') && url.username === 'postgres' && url.password.length > 0 && url.pathname === '/postgres' && !url.hash, 'unsupported production endpoint');
    equal([...url.searchParams.keys()], ['sslmode'], 'ambiguous or unsupported URL parameters');
    requireValue(url.searchParams.get('sslmode') === 'verify-full', 'verified TLS required');
    // Startup options are forwarded by the pinned Go CLI; PGOPTIONS is insufficient.
    url.searchParams.set('options', '-c lock_timeout=1000ms -c statement_timeout=5000ms');
    return { url: url.toString(), identity: {
            project: CONTRACT.project, host: url.hostname, port: 5432, database: 'postgres', user: 'postgres', sslmode: 'verify-full', transport: 'direct'
        } };
}
export function prepareDb(root, before, work) {
    validateBefore(before);
    const sql = sourceSql(root);
    mkdirSync(work);
    mkdirSync(join(work, 'supabase'));
    mkdirSync(join(work, 'supabase/migrations'));
    writeFileSync(join(work, 'supabase/config.toml'), 'project_id = "advisor-index-selected"\n');
    for (const row of before.history)
        writeFileSync(join(work, 'supabase/migrations', `${row.version}_recorded.sql`), placeholder, { flag: 'wx' });
    writeFileSync(join(work, CONTRACT.file), sql, { flag: 'wx' });
    verifyPrepared(root, before, work);
}
export function verifyPrepared(root, before, work) {
    validateBefore(before);
    sourceSql(root);
    for (const dir of [work, join(work, 'supabase'), join(work, 'supabase/migrations')])
        requireValue(lstatSync(dir).isDirectory() && !lstatSync(dir).isSymbolicLink(), 'selected directory symlink');
    equal(readdirSync(work).sort(), ['supabase'], 'selected root files');
    equal(readdirSync(join(work, 'supabase')).sort(), ['config.toml', 'migrations'], 'selected supabase files');
    equal(regular(join(work, 'supabase/config.toml')).toString(), 'project_id = "advisor-index-selected"\n', 'inert config');
    equal(readdirSync(join(work, 'supabase/migrations')).sort(), [filename, ...before.history.map(x => `${x.version}_recorded.sql`)].sort(), 'selected migrations');
    for (const row of before.history)
        equal(regular(join(work, 'supabase/migrations', `${row.version}_recorded.sql`)).toString(), placeholder, 'inert placeholder');
    equal(digest(regular(join(work, CONTRACT.file))), CONTRACT.sql_sha256, 'selected SQL');
}
export const WORKFLOW = '.github/workflows/deploy-advisor-index.yml';
const PRODUCTION_DEPLOY_ROOTS = [
    WORKFLOW,
    '.github/workflows/deploy-production-release.yml',
    '.github/workflows/deploy-auction-recovery.yml',
    '.github/workflows/deploy-catalogue-performance-hotfix.yml',
    '.github/workflows/direct-cloudflare-production-deploy.yml'
];
export function classifyDispatchWorkflows(sources) {
    const parsed = new Map(), consumers = new Set();
    for (const [path, source] of Object.entries(sources)) {
        requireValue(/^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/.test(path), 'workflow inventory path');
        const workflow = yaml.load(source);
        requireValue(workflow && typeof workflow === 'object', 'workflow inventory parse');
        parsed.set(path, workflow);
        if (/RELEASE_AUTHORIZATION_ACTION:\s*production-deploy\b|action:\s*["']production-deploy["']|--action\s+production-deploy\b|scripts\/advisor-index-(?:release\.mjs|db\.sh)\b/.test(source)) consumers.add(path);
    }
    // Propagate authority through reusable calls; a new consumer root must be
    // explicitly reviewed into the inventory, never silently treated read-only.
    let changed = true;
    while (changed) {
        changed = false;
        for (const [path, workflow] of parsed) {
            if (!consumers.has(path) && Object.values(workflow.jobs ?? {}).some(job => typeof job.uses === 'string' && consumers.has(job.uses.replace(/^\.\//, '')))) {
                consumers.add(path); changed = true;
            }
        }
    }
    const dispatches = [...parsed].filter(([, workflow]) => Object.hasOwn(workflow.on ?? {}, 'workflow_dispatch')).map(([path]) => path);
    const roots = dispatches.filter(path => consumers.has(path));
    equal(roots.sort(), [...PRODUCTION_DEPLOY_ROOTS].sort(), 'production-deploy root inventory');
    return {consumers: roots, nonconsuming: dispatches.filter(path => !consumers.has(path)).sort()};
}
const VARIABLE_NAMES = ['PRODUCTION_RELEASE_ENABLED', 'PRODUCTION_RELEASE_DEPLOYERS', 'PRODUCTION_BREAK_GLASS_ACTOR', 'PRODUCTION_BREAK_GLASS_RELEASE_SHA', 'PRODUCTION_BREAK_GLASS_INCIDENT_ID', 'PRODUCTION_BREAK_GLASS_EXPIRES_AT'];
function runIdentity(run, env, ci = false) {
    requireValue(run && String(run.id) === (ci ? env.ADVISOR_CI_RUN_ID : env.GITHUB_RUN_ID) && run.run_attempt === 1 && run.head_sha === env.RELEASE_SHA && run.head_branch === 'main' && run.event === (ci ? 'push' : 'workflow_dispatch') && [ci ? '.github/workflows/ci.yml' : WORKFLOW, `${ci ? '.github/workflows/ci.yml' : WORKFLOW}@main`].includes(run.path), 'workflow/CI identity');
    requireValue(run.repository?.full_name === CONTRACT.repository && run.head_repository?.full_name === CONTRACT.repository && Number.isSafeInteger(run.repository.id) && run.repository.id > 0 && run.repository.id === run.head_repository.id, 'repository identity');
    requireValue(typeof run.actor?.login === 'string' && run.actor.login === run.triggering_actor?.login, 'original run actor required');
    if (ci)
        requireValue(run.status === 'completed' && run.conclusion === 'success', 'successful completed CI required');
    else
        requireValue(run.status === 'in_progress' && run.conclusion === null && run.actor.login === env.GITHUB_ACTOR && run.triggering_actor.login === env.GITHUB_TRIGGERING_ACTOR, 'current original producer required');
}
export function validateControl(input, now = new Date()) {
    const { env, variables, ci, run } = input;
    requireValue(env.GITHUB_REPOSITORY === CONTRACT.repository && env.GITHUB_WORKFLOW_REF === `${CONTRACT.repository}/${WORKFLOW}@refs/heads/main` && env.GITHUB_REF === 'refs/heads/main' && env.GITHUB_EVENT_NAME === 'workflow_dispatch', 'fixed workflow required');
    requireValue(/^[a-f0-9]{40}$/.test(input.tree) && input.clean === true, 'clean source tree required');
    requireValue(/^[1-9][0-9]*$/.test(env.ADVISOR_CI_RUN_ID ?? '') && variables.PRODUCTION_RELEASE_ENABLED === 'true', 'production/CI disabled');
    requireValue(typeof env.RELEASE_REASON === 'string' && env.RELEASE_REASON.includes(CONTRACT.scope) && env.RELEASE_REASON.includes(env.RELEASE_SHA), 'reason must identify bounded scope and exact SHA');
    runIdentity(ci, env, true);
    runIdentity(run, env);
    requireValue(ci.repository.id === run.repository.id, 'CI repository differs');
    requireValue(Array.isArray(input.dispatches), 'complete dispatch history required');
    const consuming = input.dispatches.filter(dispatch => {
        const path = String(dispatch.path ?? '').replace(/@main$/, '');
        requireValue(dispatch.head_sha === env.RELEASE_SHA && dispatch.event === 'workflow_dispatch' && dispatch.repository?.full_name === CONTRACT.repository && dispatch.head_repository?.full_name === CONTRACT.repository, 'dispatch provenance');
        if (PRODUCTION_DEPLOY_ROOTS.includes(path)) return true;
        requireValue(input.workflowInventory?.nonconsuming?.includes(path), 'unknown or unclassified prior dispatch');
        return false;
    });
    requireValue(consuming.length === 1 && String(consuming[0].id) === env.GITHUB_RUN_ID, 'production-deploy control SHA already dispatched');
    const authorization = selectReleaseAuthorization({
        action: 'production-deploy', standardConfirmation: '', singleAdminBreakGlass: 'true', incidentId: env.RELEASE_INCIDENT_ID, reason: env.RELEASE_REASON, confirmation: env.RELEASE_CONFIRM,
        releaseSha: env.RELEASE_SHA, currentMainSha: input.currentMain, checkoutSha: input.checkout, workflowSha: env.GITHUB_WORKFLOW_SHA,
        repository: env.GITHUB_REPOSITORY, ref: env.GITHUB_REF, eventName: env.GITHUB_EVENT_NAME, actor: env.GITHUB_ACTOR, triggeringActor: env.GITHUB_TRIGGERING_ACTOR, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT,
        productionReleaseDeployers: variables.PRODUCTION_RELEASE_DEPLOYERS, breakGlassActor: variables.PRODUCTION_BREAK_GLASS_ACTOR, breakGlassReleaseSha: variables.PRODUCTION_BREAK_GLASS_RELEASE_SHA, breakGlassIncidentId: variables.PRODUCTION_BREAK_GLASS_INCIDENT_ID, breakGlassExpiresAt: variables.PRODUCTION_BREAK_GLASS_EXPIRES_AT
    }, { now });
    const context = {
        repository: CONTRACT.repository, releaseSha: env.RELEASE_SHA, sourceTree: input.tree, workflowPath: WORKFLOW, workflowRef: env.GITHUB_WORKFLOW_REF, workflowSha: env.GITHUB_WORKFLOW_SHA, event: env.GITHUB_EVENT_NAME, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT, actor: env.GITHUB_ACTOR, triggeringActor: env.GITHUB_TRIGGERING_ACTOR, ci: {
            run_id: String(ci.id), run_attempt: '1', sha: ci.head_sha, actor: ci.actor.login, workflow: '.github/workflows/ci.yml'
        }, authorization
    };
    context.grantSnapshot = input.grantSnapshot ?? {
        ...snapshotIdentity(context), configured: { ...variables }, configured_sha256: digest(variables), captured_at: now.toISOString()
    };
    validateGrantSnapshot(context.grantSnapshot, context, now);
    equal(context.grantSnapshot.configured, variables, 'captured configuration');
    return context;
}
function snapshotIdentity(context) { return {
    schema_version: 1, evidence_type: 'maiprop-advisor-index-grant-snapshot', provenance: 'github-workflow-vars-context', repository: context.repository, release_sha: context.releaseSha, source_tree: context.sourceTree, workflow_ref: context.workflowRef, workflow_sha: context.workflowSha, run_id: context.runId, run_attempt: context.runAttempt, actor: context.actor, triggering_actor: context.triggeringActor
}; }
export function validateGrantSnapshot(snapshot, context, now = new Date()) {
    const identity = snapshotIdentity(context);
    exact(snapshot, [...Object.keys(identity), 'configured', 'configured_sha256', 'captured_at'], 'grant snapshot');
    for (const [key, value] of Object.entries(identity))
        equal(snapshot[key], value, `snapshot ${key}`);
    exact(snapshot.configured, VARIABLE_NAMES, 'configured grant');
    equal(snapshot.configured_sha256, digest(snapshot.configured), 'configured grant digest');
    const capture = Date.parse(snapshot.captured_at), time = now.getTime();
    // Zero future-clock tolerance: all same-job timestamps share the runner clock.
    requireValue(Number.isFinite(capture) && Number.isFinite(time) && new Date(capture).toISOString() === snapshot.captured_at && capture <= time && time + CONTRACT.budgets.process_ms < capture + CONTRACT.budgets.lease_ms, 'future/stale grant snapshot');
    return snapshot;
}
export function completePages(getPage, field) {
    const rows = [], seen = new Set();
    let total;
    for (let page = 1; page <= 10000; page++) {
        const result = getPage(page);
        requireValue(Number.isSafeInteger(result.total_count) && result.total_count >= 0 && Array.isArray(result[field]), 'pagination evidence incomplete');
        if (total === undefined)
            total = result.total_count;
        requireValue(total === result.total_count && (field !== 'workflow_runs' || total < 1000), 'pagination changed or API run search cap reached');
        const entries = result[field];
        requireValue(entries.length <= 100 && (entries.length > 0 || total === 0), 'pagination truncated');
        for (const entry of entries) {
            requireValue(Number.isSafeInteger(entry.id) && entry.id > 0 && !seen.has(entry.id), 'duplicate/malformed pagination identity');
            seen.add(entry.id);
            rows.push(entry);
        }
        requireValue(rows.length <= total, 'pagination exceeds reported count');
        if (rows.length === total)
            return rows;
        requireValue(entries.length === 100, 'pagination incomplete');
    }
    fail('pagination budget exceeded');
}
export function validateReplay(artifacts, name, currentId) {
    const matches = artifacts.filter(x => x.name === name);
    if (currentId === undefined)
        requireValue(matches.length === 0, 'grant already consumed, including expired receipts');
    else
        requireValue(matches.length === 1 && String(matches[0].id) === currentId && matches[0].expired === false, 'current consumption receipt not unique/live');
}
function defaultAdapters() {
    return {
        get: path => JSON.parse(execFileSync('gh', ['api', '-H', 'X-GitHub-Api-Version: 2026-03-10', path], {
            encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000
        })),
        git: (...args) => execFileSync('git', args, {
            encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000
        }).trim(),
        now: () => new Date()
    };
}
export function liveControl(env = process.env, adapters = defaultAdapters(), grantSnapshot) {
    requireValue(env.GITHUB_REPOSITORY === CONTRACT.repository && /^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '') && /^[1-9][0-9]*$/.test(env.ADVISOR_CI_RUN_ID ?? '') && /^[a-f0-9]{40}$/.test(env.RELEASE_SHA ?? ''), 'invalid trusted environment');
    const prefix = `repos/${CONTRACT.repository}`, { get, git } = adapters;
    const variables = grantSnapshot?.configured ?? Object.fromEntries(VARIABLE_NAMES.map(name => { requireValue(typeof env[name] === 'string' && env[name] !== '', 'explicit workflow configured variable missing'); return [name, env[name]]; }));
    const workflowPaths = git('ls-tree', '-r', '--name-only', 'HEAD', '.github/workflows').split('\n').filter(path => /\.ya?ml$/.test(path));
    const workflowInventory = classifyDispatchWorkflows(Object.fromEntries(workflowPaths.map(path => [path, git('show', `HEAD:${path}`)])));
    // Shared grant replay is checked repository-wide; unrelated known-tree
    // workflows are excluded only by the verified source authority inventory.
    return validateControl({
        env, variables, grantSnapshot, workflowInventory, currentMain: get(`${prefix}/commits/main`).sha, checkout: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), clean: git('status', '--porcelain', '--untracked-files=no') === '', ci: get(`${prefix}/actions/runs/${env.ADVISOR_CI_RUN_ID}`), run: get(`${prefix}/actions/runs/${env.GITHUB_RUN_ID}`), dispatches: completePages(page => get(`${prefix}/actions/runs?head_sha=${env.RELEASE_SHA}&event=workflow_dispatch&per_page=100&page=${page}`), 'workflow_runs')
    }, adapters.now());
}
function leaseFields(context, input) {
    validateBefore(input.before);
    equal(input.pending, filename, 'pending filename');
    equal(input.target, {
        project: CONTRACT.project, host: `db.${CONTRACT.project}.supabase.co`, port: 5432, database: 'postgres', user: 'postgres', sslmode: 'verify-full', transport: 'direct'
    }, 'target');
    exact(input.artifact, ['artifact_id', 'artifact_digest', 'payload_sha256'], 'selected artifact tuple');
    exact(input.consumption, ['artifact_id', 'artifact_digest', 'binding_artifact_id', 'payload_sha256', 'action', 'incident_id', 'release_sha', 'parent_run_id'], 'consumption tuple');
    for (const tuple of [input.artifact, input.consumption]) {
        requireValue(/^[1-9][0-9]*$/.test(tuple.artifact_id) && /^[a-f0-9]{64}$/.test(tuple.artifact_digest) && /^[a-f0-9]{64}$/.test(tuple.payload_sha256), 'artifact identity missing');
    }
    requireValue(/^[1-9][0-9]*$/.test(input.consumption.binding_artifact_id) && input.consumption.action === 'production-deploy' && input.consumption.release_sha === context.releaseSha && input.consumption.parent_run_id === context.runId && input.consumption.incident_id === context.authorization.incident_id, 'receipt scope mismatch');
    return {
        schema_version: 1, evidence_type: 'maiprop-advisor-index-mutation-lease', scope: CONTRACT.scope, contract_sha256: digest(CONTRACT), repository: context.repository, release_sha: context.releaseSha, source_tree: context.sourceTree, ci: context.ci, run: {
            workflow: context.workflowPath, workflow_ref: context.workflowRef, workflow_sha: context.workflowSha, run_id: context.runId, run_attempt: context.runAttempt, actor: context.actor, triggering_actor: context.triggeringActor
        }, target: input.target, artifact: input.artifact, grant_snapshot_sha256: digest(context.grantSnapshot), authorization_sha256: releaseAuthorizationSha256(context.authorization), consumption: input.consumption, history_sha256: digest(input.before.history), catalog_sha256: digest(input.before.catalog), pending: filename, budgets: CONTRACT.budgets
    };
}
export function createLease(context, input, now = new Date()) {
    const issued = now.getTime(), expires = Math.min(issued + CONTRACT.budgets.lease_ms, Date.parse(context.grantSnapshot.captured_at) + CONTRACT.budgets.lease_ms, Date.parse(context.authorization.authorized_expires_at));
    const lease = {
        ...leaseFields(context, input), nonce: randomBytes(32).toString('hex'), issued_at: new Date(issued).toISOString(), expires_at: new Date(expires).toISOString()
    };
    validateLease(lease, context, input, now);
    return lease;
}
export function validateLease(lease, context, input, now = new Date()) {
    validateGrantSnapshot(context.grantSnapshot, context, now);
    const fields = leaseFields(context, input);
    exact(lease, [...Object.keys(fields), 'nonce', 'issued_at', 'expires_at'], 'lease');
    for (const [key, value] of Object.entries(fields))
        equal(lease[key], value, `lease ${key}`);
    requireValue(/^[a-f0-9]{64}$/.test(lease.nonce), 'lease nonce');
    const issued = Date.parse(lease.issued_at), expires = Date.parse(lease.expires_at), time = now.getTime();
    requireValue(Number.isFinite(issued) && Number.isFinite(expires) && Number.isFinite(time) && new Date(issued).toISOString() === lease.issued_at && new Date(expires).toISOString() === lease.expires_at && issued <= time && expires === Math.min(issued + CONTRACT.budgets.lease_ms, Date.parse(context.grantSnapshot.captured_at) + CONTRACT.budgets.lease_ms, Date.parse(context.authorization.authorized_expires_at)) && time + CONTRACT.budgets.process_ms < expires, 'lease expired, future, altered or insufficient attempt budget');
    return lease;
}
function manifest(context) { return {
    schema_version: 1, contract: CONTRACT, release_sha: context.releaseSha, source_tree: context.sourceTree, ci: context.ci, grant_snapshot: context.grantSnapshot, authorization: context.authorization
}; }
export function packageRelease(source, destination, context) {
    const sql = sourceSql(source);
    mkdirSync(destination);
    writeFileSync(join(destination, filename), sql, { flag: 'wx' });
    writeFileSync(join(destination, 'manifest.json'), `${JSON.stringify(manifest(context), null, 2)}\n`, { flag: 'wx' });
}
function evidenceName(kind, context) {
    if (kind === 'receipt')
        return consumptionArtifactName({
            action: 'production-deploy', releaseSha: context.releaseSha, incidentId: context.authorization.incident_id
        });
    requireValue(['selected', 'lease'].includes(kind), 'unsupported evidence kind');
    return `advisor-index-${kind}-${context.releaseSha}-${context.runId}`;
}
export function verifyEvidence(kind, payload, binding, context, get, env) {
    const name = evidenceName(kind, context);
    const verification = verifyReleaseArtifactBinding({
        binding, payloadRoot: payload, artifactMetadata: get(`repos/${CONTRACT.repository}/actions/artifacts/${binding.artifact.id}`), producerRun: get(`repos/${CONTRACT.repository}/actions/runs/${context.runId}`), signingKey: env.RELEASE_EVIDENCE_SIGNING_KEY, expectedKeyId: env.RELEASE_EVIDENCE_SIGNING_KEY_ID, expected: {
            ...context, artifactId: binding.artifact.id, artifactName: name, artifactDigest: binding.artifact.digest
        }, verificationMode: 'same-run', trustedCurrentRun: context
    });
    equal(verification.files.map(x => x.path).sort(), kind === 'selected' ? ['manifest.json', filename].sort() : [`${kind}.json`], 'fixed evidence file set');
    if (kind === 'selected') {
        equal(JSON.parse(regular(join(payload, 'manifest.json'))), manifest(context), 'selected manifest');
        equal(digest(regular(join(payload, filename))), CONTRACT.sql_sha256, 'packaged SQL');
    }
    return {
        artifact_id: verification.artifactId, artifact_digest: verification.artifactDigest, payload_sha256: digest(verification.files)
    };
}
function redacted(text, url) {
    let password = '';
    try {
        password = decodeURIComponent(new URL(url).password);
    }
    catch { }
    let output = String(text ?? '');
    if (url) output = output.replaceAll(url, '[DATABASE_URL]');
    output = output.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[DATABASE_URL]');
    if (password)
        output = output.replaceAll(password, '[PASSWORD]').replaceAll(encodeURIComponent(password), '[PASSWORD]');
    return output;
}
export function applyOnce({ directory, url, work, cli, boundary, invoke, now = () => new Date() }) {
    const attempt = join(directory, 'attempt.json');
    requireValue(!existsSync(attempt), 'attempt already started; inspect read-only, never replay');
    const lease = boundary();
    // Persist intent before launching. A client timeout is never proof of rollback.
    writeFileSync(attempt, JSON.stringify({
        state: 'ambiguous', lease_sha256: digest(lease), started_at: now().toISOString()
    }), { flag: 'wx' });
    requireValue(Number.isFinite(Date.parse(lease.expires_at)) && now().getTime() + CONTRACT.budgets.process_ms < Date.parse(lease.expires_at), 'insufficient live lease at provider boundary');
    const args = ['db', 'push', '--workdir', work, '--db-url', url, '--skip-vault', '--include-all', '--yes'];
    const result = invoke(args, { timeout: CONTRACT.budgets.process_ms, killSignal: 'SIGKILL' });
    writeFileSync(join(directory, 'apply.log'), redacted(`${result.stdout ?? ''}\n${result.stderr ?? ''}\nexit=${result.status}; signal=${result.signal ?? ''}\n`, url));
    requireValue(!result.error && result.status === 0, 'ambiguous CLI outcome; grant remains consumed; no retry or history repair');
    return { cli_exit: 0, cli };
}
export function snapshotSql() {
    return `BEGIN READ ONLY;
SELECT jsonb_build_object(
 'history',COALESCE((SELECT jsonb_agg(jsonb_build_object('version',version,'name',name,'statement_count',cardinality(statements),'statements_sha256',encode(sha256(convert_to(COALESCE(array_to_string(statements,E'\\x1f'),''),'UTF8')),'hex')) ORDER BY version) FROM supabase_migrations.schema_migrations),'[]'::jsonb),
 'catalog',jsonb_build_object(
  'table',(SELECT jsonb_build_object('schema','private','name',relname,'kind',relkind,'acl',relacl::text,'owner',pg_get_userbyid(relowner),'rls',relrowsecurity,'force_rls',relforcerowsecurity,'columns',(SELECT jsonb_agg(jsonb_build_object('name',attname,'type',format_type(atttypid,atttypmod),'not_null',attnotnull,'generated',attgenerated) ORDER BY attnum) FROM pg_attribute WHERE attrelid=c.oid AND attnum>0 AND NOT attisdropped)) FROM pg_class c WHERE oid='private.os_auction_duplicate_quarantine'::regclass),
  'constraints',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',conname,'type',contype,'definition',pg_get_constraintdef(c.oid),'validated',convalidated,'columns',(SELECT jsonb_agg(a.attname ORDER BY k.ordinality) FROM unnest(conkey) WITH ORDINALITY k(attnum,ordinality) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum),'target',(SELECT n.nspname||'.'||r.relname FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace WHERE r.oid=c.confrelid)) ORDER BY conname) FROM pg_constraint c WHERE conrelid='private.os_auction_duplicate_quarantine'::regclass),'[]'::jsonb),
  'indexes',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',ic.relname,'method',am.amname,'definition',pg_get_indexdef(ix.indexrelid),'valid',ix.indisvalid,'ready',ix.indisready,'live',ix.indislive,'nkeys',ix.indnkeyatts,'natts',ix.indnatts,'predicate',pg_get_expr(ix.indpred,ix.indrelid),'expressions',pg_get_expr(ix.indexprs,ix.indrelid),'keys',(SELECT jsonb_agg(pg_get_indexdef(ix.indexrelid,k,true) ORDER BY k) FROM generate_series(1,ix.indnkeyatts) k),'comment',obj_description(ix.indexrelid,'pg_class')) ORDER BY ic.relname) FROM pg_index ix JOIN pg_class ic ON ic.oid=ix.indexrelid JOIN pg_am am ON am.oid=ic.relam WHERE ix.indrelid='private.os_auction_duplicate_quarantine'::regclass),'[]'::jsonb),
  'collision',COALESCE((SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind) ORDER BY n.nspname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='idx_os_auction_duplicate_quarantine_canonical_listing_id'),'[]'::jsonb)),
 'metrics',jsonb_build_object('row_count',(SELECT count(*) FROM private.os_auction_duplicate_quarantine),'pages',pg_relation_size('private.os_auction_duplicate_quarantine')/8192,'server_version',current_setting('server_version'),'database',current_database(),'user',current_user));
COMMIT;`;
}
const jsonFile = path => JSON.parse(regular(path).toString());
const saveJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
function childEnvironment(env) { return Object.fromEntries(['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR'].filter(x => env[x] !== undefined).map(x => [x, env[x]])); }
export function execute(command, args = [], { env = process.env, adapters = defaultAdapters(), source = process.cwd() } = {}) {
    requireValue(typeof env.RUNNER_TEMP === 'string' && env.RUNNER_TEMP.length > 0, 'runner temporary root required');
    const root = join(env.RUNNER_TEMP, 'advisor-index'), evidence = join(root, 'evidence');
    mkdirSync(evidence, { recursive: true });
    const invoke = adapters.invoke ?? ((exe, argv, options) => spawnSync(exe, argv, {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024, env: childEnvironment(env), ...options
    }));
    const context = () => liveControl(env, adapters, command === 'package' ? undefined : jsonFile(join(root, 'selected', 'manifest.json')).grant_snapshot);
    const payload = kind => join(root, kind), bindingPath = kind => join(root, `${kind}-binding`, 'binding.json');
    const allArtifacts = () => completePages(page => adapters.get(`repos/${CONTRACT.repository}/actions/artifacts?per_page=100&page=${page}`), 'artifacts');
    const verifyKind = (kind, current) => {
        const binding = jsonFile(bindingPath(kind));
        const tuple = verifyEvidence(kind, payload(kind), binding, current, adapters.get, env);
        const matches = allArtifacts().filter(x => x.name === `${evidenceName(kind, current)}-binding`);
        const producer = adapters.get(`repos/${CONTRACT.repository}/actions/runs/${current.runId}`);
        requireValue(matches.length === 1 && matches[0].expired === false && /^[a-f0-9]{64}$/.test(String(matches[0].digest).replace(/^sha256:/, '')) && matches[0].workflow_run?.id === Number(current.runId) && matches[0].workflow_run?.head_sha === current.releaseSha && matches[0].workflow_run?.repository_id === producer.repository?.id && matches[0].workflow_run?.repository_id === matches[0].workflow_run?.head_repository_id, 'uploaded binding identity missing');
        return { ...tuple, binding_artifact_id: String(matches[0].id) };
    };
    const selected = current => { const { binding_artifact_id: unused, ...tuple } = verifyKind('selected', current); return tuple; };
    const receipt = current => {
        const identity = verifyKind('receipt', current), record = jsonFile(join(payload('receipt'), 'receipt.json'));
        validateConsumptionReceipt(record, {
            authorization: current.authorization, action: 'production-deploy', repository: current.repository, workflowRef: current.workflowRef, workflowSha: current.workflowSha, runId: current.runId, runAttempt: current.runAttempt
        }, { now: adapters.now() });
        validateReplay(allArtifacts(), evidenceName('receipt', current), identity.artifact_id);
        return consumptionTuple({
            receipt: record, payloadArtifact: { artifactId: identity.artifact_id, artifactDigest: identity.artifact_digest }, bindingArtifact: { artifactId: identity.binding_artifact_id }, payloadSha256: digest(regular(join(payload('receipt'), 'receipt.json')))
        });
    };
    const before = () => jsonFile(join(evidence, 'before.json'));
    const target = () => databaseTarget(env.TARGET_DB_URL);
    const input = current => ({
        artifact: selected(current), consumption: receipt(current), target: target().identity, before: before(), pending: validateDryRun(jsonFile(join(evidence, 'dry-run.json')))
    });
    const cli = join(source, 'node_modules/@supabase/cli-linux-x64/bin/supabase');
    const version = () => { const result = invoke(cli, ['--version'], { timeout: 10000, killSignal: 'SIGKILL' }); requireValue(!result.error && result.status === 0 && result.stdout.trim() === CONTRACT.cli, 'pinned CLI version required'); };
    const snapshot = (name, url) => {
        const result = invoke('psql', [url, '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '-qAt', '--command', snapshotSql()], { timeout: 10000, killSignal: 'SIGKILL' });
        writeFileSync(join(evidence, `${name}.log`), redacted(result.stderr, url));
        requireValue(!result.error && result.status === 0, 'read-only snapshot failed');
        const value = JSON.parse(result.stdout);
        writeFileSync(join(evidence, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
        return value;
    };
    if (command === 'package') {
        requireValue(args.length === 0, 'package arguments');
        const current = context();
        packageRelease(source, payload('selected'), current);
        return;
    }
    if (command === 'sign') {
        requireValue(args.length === 3, 'sign arguments');
        const [kind, id, artifactDigest] = args, current = context();
        evidenceName(kind, current);
        const binding = createReleaseArtifactBinding({
            ...current, payloadRoot: payload(kind), artifactId: id, artifactName: evidenceName(kind, current), artifactDigest, keyId: env.RELEASE_EVIDENCE_SIGNING_KEY_ID, signingKey: env.RELEASE_EVIDENCE_SIGNING_KEY, issuedAt: adapters.now().toISOString()
        });
        verifyEvidence(kind, payload(kind), binding, current, adapters.get, env);
        mkdirSync(join(root, `${kind}-binding`));
        saveJson(bindingPath(kind), binding);
        return;
    }
    requireValue(args.length === 0, 'unexpected command arguments');
    if (command === 'prepare-db') {
        const current = context();
        selected(current);
        sourceSql(source);
        const { url } = target();
        version();
        const initial = snapshot('before', url);
        validateBefore(initial);
        prepareDb(source, initial, join(root, 'dry-work'));
        const result = invoke(cli, ['db', 'push', '--workdir', join(root, 'dry-work'), '--db-url', url, '--skip-vault', '--include-all', '--dry-run'], { timeout: CONTRACT.budgets.process_ms, killSignal: 'SIGKILL' });
        const record = {
            stdout: redacted(result.stdout ?? '', url), stderr: redacted(result.stderr ?? '', url),
            status: result.status, signal: result.signal ?? null, error: Boolean(result.error)
        };
        saveJson(join(evidence, 'dry-run.json'), record);
        writeFileSync(join(evidence, 'dry-run.log'), record.stdout);
        writeFileSync(join(evidence, 'dry-run.stderr.log'), record.stderr);
        validateDryRun(record);
        // A fresh apply directory excludes mutable CLI cache files created by dry-run.
        prepareDb(source, initial, join(root, 'apply-work'));
        validateRecheck(initial, snapshot('prepared-recheck', url));
        return;
    }
    if (command === 'consume') {
        const current = context();
        selected(current);
        validateBefore(before());
        validateDryRun(jsonFile(join(evidence, 'dry-run.json')));
        validateRecheck(before(), jsonFile(join(evidence, 'prepared-recheck.json')));
        verifyPrepared(source, before(), join(root, 'apply-work'));
        validateReplay(allArtifacts(), evidenceName('receipt', current));
        const record = createConsumptionReceipt({
            authorization: current.authorization, repository: current.repository, workflowRef: current.workflowRef, workflowSha: current.workflowSha, runId: current.runId, runAttempt: current.runAttempt, consumedAt: adapters.now().toISOString(), nonce: randomBytes(32).toString('hex')
        });
        requireValue(typeof env.GITHUB_OUTPUT === 'string' && env.GITHUB_OUTPUT.length > 0, 'workflow output required');
        mkdirSync(payload('receipt'));
        saveJson(join(payload('receipt'), 'receipt.json'), record);
        appendFileSync(env.GITHUB_OUTPUT, `receipt_name=${evidenceName('receipt', current)}\n`);
        return;
    }
    if (command === 'issue-lease') {
        const current = context();
        const lease = createLease(current, input(current), adapters.now());
        mkdirSync(payload('lease'));
        saveJson(join(payload('lease'), 'lease.json'), lease);
        return;
    }
    if (command === 'apply') {
        const { url } = target();
        version();
        const boundary = () => {
            const current = context();
            verifyKind('lease', current);
            const lease = jsonFile(join(payload('lease'), 'lease.json'));
            const expected = input(current);
            validateLease(lease, current, expected, adapters.now());
            verifyPrepared(source, expected.before, join(root, 'apply-work'));
            validateRecheck(expected.before, snapshot('boundary-recheck', url));
            validateLease(lease, current, expected, adapters.now());
            return lease;
        };
        try {
            applyOnce({
                directory: evidence, url, work: join(root, 'apply-work'), cli, boundary, invoke: (argv, options) => invoke(cli, argv, options), now: adapters.now
            });
        }
        catch (error) {
            if (existsSync(join(evidence, 'attempt.json'))) {
                // Read-only reconciliation evidence only; never repair or repeat apply.
                try {
                    snapshot('after-failure', url);
                }
                catch {
                    writeFileSync(join(evidence, 'after-failure-unavailable.txt'), 'Read-only reconciliation unavailable; outcome remains ambiguous.\n');
                }
            }
            throw error;
        }
        const result = validateAfter(before(), snapshot('after', url));
        saveJson(join(evidence, 'result.json'), result);
        writeFileSync(join(evidence, 'attempt.json'), JSON.stringify({ state: 'verified', result }));
        return result;
    }
    fail('unknown command');
}
export function workflowViolations(workflow) {
    try {
        equal(Object.keys(workflow.on), ['workflow_dispatch'], 'workflow trigger');
        equal(Object.keys(workflow.on.workflow_dispatch.inputs).sort(), ['ci_run_id', 'confirm', 'incident_id', 'reason', 'release_sha'], 'dispatch inputs');
        for (const input of Object.values(workflow.on.workflow_dispatch.inputs))
            requireValue(input.required === true && input.type === 'string' && !Object.hasOwn(input, 'default'), 'dispatch input contract');
        equal(workflow.permissions, { contents: 'read', actions: 'read' }, 'workflow permissions');
        equal(workflow.concurrency, { group: 'maiprop-production-release', 'cancel-in-progress': false }, 'shared concurrency');
        equal(Object.keys(workflow.jobs), ['deploy'], 'single production job');
        const job = workflow.jobs.deploy;
        requireValue(job.environment === 'production' && job['timeout-minutes'] === 10 && job['runs-on'] === 'ubuntu-latest' && !job.permissions, 'protected finite job');
        equal(job.if, "github.ref == 'refs/heads/main' && github.run_attempt == 1 && github.actor == github.triggering_actor && vars.PRODUCTION_RELEASE_ENABLED == 'true'", 'production guard');
        equal(job.steps[0].run, [
            'set -euo pipefail',
            '[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]',
            'test "$GITHUB_REPOSITORY" = maiprop/maiprop-listing-site',
            'test "$RELEASE_SHA" = "$GITHUB_WORKFLOW_SHA"',
            'test "$RELEASE_SHA" = "$(gh api repos/maiprop/maiprop-listing-site/commits/main --jq .sha)"',
            ''
        ].join('\n'), 'trusted pre-checkout bootstrap');
        requireValue(!job.steps[0].if && !job.steps[0]['continue-on-error'], 'mandatory bootstrap');
        const commands = job.steps.slice(1).filter(step => step.run);
        equal(commands.map(step => step.run), [
            'npm ci --ignore-scripts --prefer-offline --no-audit',
            'node scripts/advisor-index-release.mjs package',
            'node scripts/advisor-index-release.mjs sign selected "$ARTIFACT_ID" "$ARTIFACT_DIGEST"',
            'bash scripts/advisor-index-db.sh prepare-db',
            'node scripts/advisor-index-release.mjs consume',
            'node scripts/advisor-index-release.mjs sign receipt "$ARTIFACT_ID" "$ARTIFACT_DIGEST"',
            'node scripts/advisor-index-release.mjs issue-lease',
            'node scripts/advisor-index-release.mjs sign lease "$ARTIFACT_ID" "$ARTIFACT_DIGEST"',
            'bash scripts/advisor-index-db.sh apply',
        ], 'bounded workflow command order');
        for (const step of commands)
            requireValue(!step.if && !step['continue-on-error'], 'mandatory control phase');
        equal(commands[1].env, Object.fromEntries(VARIABLE_NAMES.map(name => [name, `\${{ vars.${name} }}`])), 'explicit trusted configuration mapping');
        requireValue(!VARIABLE_NAMES.some(name => Object.hasOwn(job.env ?? {}, name)), 'configured values must be captured only at explicit step');
        for (const index of [3, 6, 8])
            equal(commands[index].env, { TARGET_DB_URL: '${{ secrets.SUPABASE_PRODUCTION_DB_URL }}' }, 'scoped database credential');
        requireValue(job.steps[1].uses === 'actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0' && job.steps[1].with.ref === '${{ inputs.release_sha }}' && job.steps[1].with['persist-credentials'] === false, 'exact source checkout');
        const actions = job.steps.filter(step => step.uses);
        equal(actions.map(step => step.uses), ['actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0', 'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e', ...Array(7).fill('actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a')], 'pinned bounded actions');
        for (const step of actions.slice(2, -1))
            requireValue(!step.if && step.with['if-no-files-found'] === 'error' && !step.with.overwrite, 'immutable required evidence upload');
        requireValue(actions.at(-1).if === 'always()', 'failure evidence preservation');
        return [];
    }
    catch (error) {
        return [`${WORKFLOW}: ${error.message}`];
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        execute(process.argv[2], process.argv.slice(3));
    }
    catch (error) {
        if (process.env.RUNNER_TEMP) {
            const evidence = join(process.env.RUNNER_TEMP, 'advisor-index', 'evidence');
            mkdirSync(evidence, {recursive:true});
            writeFileSync(join(evidence, 'failure.json'), JSON.stringify({phase:process.argv[2],error:redacted(error.message,process.env.TARGET_DB_URL??'')}));
        }
        process.stderr.write('Advisor index release stopped. Preserve evidence; do not retry or repair automatically.\n');
        process.exitCode = 1;
    }
}
