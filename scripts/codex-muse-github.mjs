import { createHash } from 'node:crypto';

// Read-only GitHub Actions metadata observer for MaiProp CI evidence.
// No mutation endpoints, shell commands, signing, token provisioning,
// dispatch, merge, deployment, or artifact downloads. Output is metadata
// observation only: never a CI authorization substitute for the
// framework's local-ci SSH path or MaiProp's existing HMAC chain.

const TASK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const HEX64_RE = /^[0-9a-f]{64}$/;
const HEX40_RE = /^[0-9a-f]{40}$/;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const STRICT_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const REQUEST_KEYS = [
  'artifact_digest', 'artifact_id', 'base_sha', 'candidate_sha256', 'commit_sha',
  'contract_sha256', 'expires_at', 'issued_at', 'nonce', 'review_sha256',
  'run_attempt', 'run_id', 'schema_version', 'task_id', 'tree_sha', 'workflow_blob_sha',
];
const RECORD_KEYS = [
  'artifacts', 'branch', 'commit', 'jobs', 'repository', 'run', 'workflow', 'workflow_source',
];

const PINNED = Object.freeze({
  artifactNamePrefix: 'production-release-candidate-',
  branch: 'main',
  ownerId: 182603068,
  ownerLogin: 'maiprop',
  repoDefaultBranch: 'main',
  repoFullName: 'maiprop/maiprop-listing-site',
  repoId: 1179072210,
  workflowId: 262230414,
  workflowName: 'CI',
  workflowPath: '.github/workflows/ci.yml',
  workflowState: 'active',
});

const REQUIRED_JOBS = Object.freeze([
  'Build / Lint / Test',
  'Release Safety Inventory / Release Safety Inventory',
  'E2E Tests',
  'Validate Supabase migrations',
  'Lighthouse CI',
  'Immutable release candidate built',
]);

const API_BASE = 'https://api.github.com';
const FETCH_TIMEOUT_MS = 30000;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_COUNT = 1000;
const MAX_PAGES = 10;
const PAGE_SIZE = 100;

const BINDING_NOTE = 'contract/candidate/review digests are caller-provided bindings, not proof of review, content, or signer enrollment. This observation is read-only provider metadata: it is not a CI authorization, merge, deployment, or artifact-use approval, is not a substitute for the framework local-ci SSH path or the MaiProp HMAC chain, and does not verify signatures, source binding, or production readiness.';

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

// Deep strict own-data validation. Accepts only JSON scalars (finite
// numbers, strings, booleans, null), strict arrays and plain or
// null-prototype objects with enumerable own data properties. Inspects
// descriptors via Reflect.ownKeys without invoking accessors, so getters
// never run during validation. Rejects symbols, accessors, hidden or
// non-enumerable own properties, custom prototypes, functions, repeated or
// cyclic references, sparse arrays and custom array own properties.
// Unrelated ordinary provider data fields are permitted; custom
// capabilities are not.
function assertDeepOwnData(value, label, seen) {
  if (value === null) return value;
  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'boolean') return value;
  if (valueType === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`invalid ${label}: only finite JSON numbers are allowed`);
    }
    return value;
  }
  if (valueType !== 'object') {
    throw new Error(`invalid ${label}: only JSON scalars, arrays and plain objects are allowed`);
  }
  const refs = seen === undefined ? new Set() : seen;
  if (refs.has(value)) {
    throw new Error(`invalid ${label}: cyclic or shared references are not allowed`);
  }
  refs.add(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw new Error(`invalid ${label}: plain Array prototype is required`);
    }
    const keys = Reflect.ownKeys(value);
    for (const key of keys) {
      if (typeof key === 'symbol') {
        throw new Error(`invalid ${label}: symbol properties are not allowed`);
      }
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (!lengthDescriptor || lengthDescriptor.get !== undefined || lengthDescriptor.set !== undefined || !('value' in lengthDescriptor)) {
      throw new Error(`invalid ${label}: plain length is required`);
    }
    const length = lengthDescriptor.value;
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new Error(`invalid ${label}: plain length is required`);
    }
    if (keys.length !== length + 1) {
      throw new Error(`invalid ${label}: extra own properties are not allowed`);
    }
    for (let i = 0; i < length; i += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || descriptor.get !== undefined || descriptor.set !== undefined || !('value' in descriptor)) {
        throw new Error(`invalid ${label}: own data properties only, getters are not allowed`);
      }
      if (descriptor.enumerable !== true) {
        throw new Error(`invalid ${label}: hidden non-enumerable properties are not allowed`);
      }
      assertDeepOwnData(descriptor.value, `${label}[${i}]`, refs);
    }
    return value;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new Error(`invalid ${label}: plain prototype is required`);
  }
  const keys = Reflect.ownKeys(value);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (typeof key === 'symbol') {
      throw new Error(`invalid ${label}: symbol properties are not allowed`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get !== undefined || descriptor.set !== undefined || !('value' in descriptor)) {
      throw new Error(`invalid ${label}: own data properties only, getters are not allowed`);
    }
    if (descriptor.enumerable !== true) {
      throw new Error(`invalid ${label}: hidden non-enumerable properties are not allowed`);
    }
    assertDeepOwnData(descriptor.value, `${label}.${String(key)}`, refs);
  }
  return value;
}

function assertExactKeys(obj, expectedSorted, label) {
  if (!isPlainObject(obj)) {
    throw new Error(`invalid ${label}: object is required`);
  }
  if (Object.getOwnPropertySymbols(obj).length !== 0) {
    throw new Error(`invalid ${label}: symbol properties are not allowed`);
  }
  const actual = Object.getOwnPropertyNames(obj).sort();
  if (actual.length !== expectedSorted.length || actual.some((key, i) => key !== expectedSorted[i])) {
    throw new Error(`invalid ${label}: exact keys are required`);
  }
}

function assertPositiveSafeInt(value, label) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`invalid ${label}: positive safe integer is required`);
  }
}

function assertHex(value, length, label) {
  const re = length === 64 ? HEX64_RE : HEX40_RE;
  if (typeof value !== 'string' || !re.test(value)) {
    throw new Error(`invalid ${label}: lowercase hex${length} is required`);
  }
}

function daysInMonth(year, month) {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

// Strict real UTC second timestamp YYYY-MM-DDTHH:mm:ssZ. Returns epoch ms.
function parseStrictTimestamp(value, label) {
  if (typeof value !== 'string' || !STRICT_TS_RE.test(value)) {
    throw new Error(`invalid ${label}: strict UTC second timestamp YYYY-MM-DDTHH:mm:ssZ is required`);
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  const second = Number(value.slice(17, 19));
  if (month < 1 || month > 12) throw new Error(`invalid ${label}: month out of range`);
  if (day < 1 || day > daysInMonth(year, month)) throw new Error(`invalid ${label}: day out of range`);
  if (hour > 23 || minute > 59 || second > 59) throw new Error(`invalid ${label}: time out of range`);
  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  const roundTrip = new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  if (roundTrip !== value) {
    throw new Error(`invalid ${label}: not a real UTC timestamp`);
  }
  return ms;
}

function requestSha256(request) {
  const sorted = Object.fromEntries(Object.getOwnPropertyNames(request).sort().map((k) => [k, request[k]]));
  return sha256Hex(JSON.stringify(sorted));
}

function toStrictSecondsIso(iso) {
  return String(iso).replace(/\.\d{3}Z$/, 'Z');
}

function validateRequest(request, nowIso) {
  assertDeepOwnData(request, 'request');
  assertExactKeys(request, REQUEST_KEYS, 'request');
  if (request.schema_version !== 1) {
    throw new Error('invalid request.schema_version: 1 is required');
  }
  if (typeof request.task_id !== 'string' || !TASK_ID_RE.test(request.task_id)) {
    throw new Error('invalid request.task_id: bounded ID is required');
  }
  assertHex(request.contract_sha256, 64, 'request.contract_sha256');
  assertHex(request.candidate_sha256, 64, 'request.candidate_sha256');
  assertHex(request.review_sha256, 64, 'request.review_sha256');
  assertHex(request.nonce, 64, 'request.nonce');
  assertHex(request.base_sha, 40, 'request.base_sha');
  assertHex(request.commit_sha, 40, 'request.commit_sha');
  assertHex(request.tree_sha, 40, 'request.tree_sha');
  assertHex(request.workflow_blob_sha, 40, 'request.workflow_blob_sha');
  assertPositiveSafeInt(request.run_id, 'request.run_id');
  assertPositiveSafeInt(request.artifact_id, 'request.artifact_id');
  if (request.run_attempt !== 1) {
    throw new Error('invalid request.run_attempt: 1 is required');
  }
  if (typeof request.artifact_digest !== 'string' || !DIGEST_RE.test(request.artifact_digest)) {
    throw new Error("invalid request.artifact_digest: 'sha256:' + lowercase hex64 is required");
  }
  const issuedMs = parseStrictTimestamp(request.issued_at, 'request.issued_at');
  const expiresMs = parseStrictTimestamp(request.expires_at, 'request.expires_at');
  const nowMs = parseStrictTimestamp(nowIso, 'nowIso');
  if (!(issuedMs <= nowMs && nowMs < expiresMs)) {
    throw new Error('invalid request window: issued<=now<expires is required');
  }
  const ttlMs = expiresMs - issuedMs;
  if (!(ttlMs > 0 && ttlMs <= 3600 * 1000)) {
    throw new Error('invalid request TTL: 0<TTL<=3600sec is required');
  }
  return { expiresMs, issuedMs, nowMs };
}

function nonBlankString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`invalid ${label}: nonblank string is required`);
  }
  return value;
}

function checkRepository(record) {
  if (!isPlainObject(record)) throw new Error('invalid records.repository: object is required');
  if (record.full_name !== PINNED.repoFullName) throw new Error('invalid records.repository: pinned full_name mismatch');
  if (record.id !== PINNED.repoId) throw new Error('invalid records.repository: pinned id mismatch');
  if (!isPlainObject(record.owner)) throw new Error('invalid records.repository.owner: object is required');
  if (record.owner.id !== PINNED.ownerId) throw new Error('invalid records.repository.owner: pinned id mismatch');
  if (record.owner.login !== PINNED.ownerLogin) throw new Error('invalid records.repository.owner: pinned login mismatch');
  if (record.default_branch !== PINNED.repoDefaultBranch) throw new Error('invalid records.repository: pinned default branch mismatch');
}

function checkBranch(record, request) {
  if (!isPlainObject(record)) throw new Error('invalid records.branch: object is required');
  if (record.name !== PINNED.branch) throw new Error('invalid records.branch: pinned branch mismatch');
  if (!isPlainObject(record.commit)) throw new Error('invalid records.branch.commit: object is required');
  if (record.commit.sha !== request.commit_sha) throw new Error('invalid records.branch: commit mismatch');
}

function checkCommit(record, request) {
  if (!isPlainObject(record)) throw new Error('invalid records.commit: object is required');
  if (record.sha !== request.commit_sha) throw new Error('invalid records.commit: sha mismatch');
  if (!isPlainObject(record.commit) || !isPlainObject(record.commit.tree)) {
    throw new Error('invalid records.commit: tree is required');
  }
  if (record.commit.tree.sha !== request.tree_sha) throw new Error('invalid records.commit: tree mismatch');
  if (!Array.isArray(record.parents) || record.parents.length !== 1) {
    throw new Error('invalid records.commit: exactly one direct parent is required');
  }
  if (!isPlainObject(record.parents[0]) || record.parents[0].sha !== request.base_sha) {
    throw new Error('invalid records.commit: parent mismatch');
  }
}

function checkWorkflow(record) {
  if (!isPlainObject(record)) throw new Error('invalid records.workflow: object is required');
  if (record.id !== PINNED.workflowId) throw new Error('invalid records.workflow: pinned id mismatch');
  if (record.path !== PINNED.workflowPath) throw new Error('invalid records.workflow: pinned path mismatch');
  if (record.name !== PINNED.workflowName) throw new Error('invalid records.workflow: pinned name mismatch');
  if (record.state !== PINNED.workflowState) throw new Error('invalid records.workflow: pinned state mismatch');
}

function checkNestedRepoShape(value, label) {
  if (!isPlainObject(value)) throw new Error(`invalid ${label}: object is required`);
  if (value.full_name !== PINNED.repoFullName) throw new Error(`invalid ${label}: pinned full_name mismatch`);
  if (value.id !== PINNED.repoId) throw new Error(`invalid ${label}: pinned id mismatch`);
  if (!isPlainObject(value.owner)) throw new Error(`invalid ${label}.owner: object is required`);
  if (value.owner.id !== PINNED.ownerId) throw new Error(`invalid ${label}.owner: pinned id mismatch`);
  if (value.owner.login !== PINNED.ownerLogin) throw new Error(`invalid ${label}.owner: pinned login mismatch`);
  // Nested run repository shapes may omit default_branch; never invent it,
  // but a supplied value must still match the pinned branch.
  if (Object.prototype.hasOwnProperty.call(value, 'default_branch') && value.default_branch !== PINNED.repoDefaultBranch) {
    throw new Error(`invalid ${label}: pinned default branch mismatch`);
  }
}

function checkWorkflowSource(record, request) {
  if (!isPlainObject(record)) throw new Error('invalid records.workflow_source: object is required');
  // Normalized observation shape carries path, sha and commit_sha; a raw
  // GitHub Contents type is absent here. When type is supplied, only file
  // is valid. Raw type=file enforcement lives in the collector.
  if (Object.prototype.hasOwnProperty.call(record, 'type') && record.type !== 'file') {
    throw new Error('invalid records.workflow_source: only file contents are accepted');
  }
  if (record.path !== PINNED.workflowPath) throw new Error('invalid records.workflow_source: pinned path mismatch');
  if (record.sha !== request.workflow_blob_sha) throw new Error('invalid records.workflow_source: blob sha mismatch');
  // Collector provenance from the exact requested ?ref= endpoint; never a
  // provider-selected value used to make a match.
  if (record.commit_sha !== request.commit_sha) throw new Error('invalid records.workflow_source: commit provenance mismatch');
}

function checkRun(record, request) {
  if (!isPlainObject(record)) throw new Error('invalid records.run: object is required');
  if (record.id !== request.run_id) throw new Error('invalid records.run: id mismatch');
  if (record.head_sha !== request.commit_sha) throw new Error('invalid records.run: head_sha mismatch');
  if (record.run_attempt !== 1) throw new Error('invalid records.run: only original attempt 1 is accepted');
  const workflowId = record.workflow_id !== undefined ? record.workflow_id : record.workflow?.id;
  if (workflowId === undefined) throw new Error('invalid records.run: workflow id is required');
  if (workflowId !== PINNED.workflowId) throw new Error('invalid records.run: pinned workflow id mismatch');
  if (record.path !== PINNED.workflowPath) throw new Error('invalid records.run: pinned workflow path mismatch');
  if (record.event !== 'push') throw new Error('invalid records.run: only post-main push events are accepted');
  if (record.head_branch !== PINNED.branch) throw new Error('invalid records.run: pinned head branch mismatch');
  if (record.status !== 'completed') throw new Error('invalid records.run: status must be completed');
  if (record.conclusion !== 'success') throw new Error('invalid records.run: conclusion must be success');
  if (!isPlainObject(record.actor) || !isPlainObject(record.triggering_actor)) {
    throw new Error('invalid records.run: actor and triggering_actor are required');
  }
  assertPositiveSafeInt(record.actor.id, 'records.run.actor.id');
  assertPositiveSafeInt(record.triggering_actor.id, 'records.run.triggering_actor.id');
  if (record.triggering_actor.id !== record.actor.id) {
    throw new Error('invalid records.run: actor and triggering_actor must be identical');
  }
  nonBlankString(record.actor.login, 'records.run.actor.login');
  nonBlankString(record.triggering_actor.login, 'records.run.triggering_actor.login');
  if (record.triggering_actor.login !== record.actor.login) {
    throw new Error('invalid records.run: actor logins must be equal');
  }
  checkNestedRepoShape(record.repository, 'records.run.repository');
  checkNestedRepoShape(record.head_repository, 'records.run.head_repository');
  // Observer only accepts original post-main push: pull_requests must be an
  // empty array; nonempty, missing, or null is invalid. No old-green fallback.
  if (!Array.isArray(record.pull_requests) || record.pull_requests.length !== 0) {
    throw new Error('invalid records.run: pull_requests must be an empty array');
  }
}

function checkJobs(jobs, request) {
  if (!Array.isArray(jobs)) throw new Error('invalid records.jobs: array is required');
  const seenIds = new Set();
  const nameCounts = new Map();
  for (const job of jobs) {
    if (!isPlainObject(job)) throw new Error('invalid records.jobs entry: object is required');
    assertPositiveSafeInt(job.id, 'records.jobs entry.id');
    if (seenIds.has(job.id)) throw new Error('invalid records.jobs: duplicate ids are rejected');
    seenIds.add(job.id);
    if (typeof job.name !== 'string') throw new Error('invalid records.jobs entry.name: string is required');
    nameCounts.set(job.name, (nameCounts.get(job.name) ?? 0) + 1);
  }
  for (const name of REQUIRED_JOBS) {
    if ((nameCounts.get(name) ?? 0) !== 1) {
      throw new Error('invalid records.jobs: each required job must appear exactly once');
    }
  }
  for (const job of jobs) {
    if (!REQUIRED_JOBS.includes(job.name)) continue;
    if (job.run_id !== request.run_id) throw new Error('invalid records.jobs: run binding mismatch');
    if (job.run_attempt !== 1) throw new Error('invalid records.jobs: only attempt 1 is accepted');
    if (job.head_sha !== request.commit_sha) throw new Error('invalid records.jobs: head_sha mismatch');
    if (job.status !== 'completed') throw new Error('invalid records.jobs: status must be completed');
    if (job.conclusion !== 'success') throw new Error('invalid records.jobs: conclusion must be success');
  }
}

function checkArtifacts(artifacts, request, nowMs) {
  if (!Array.isArray(artifacts)) throw new Error('invalid records.artifacts: array is required');
  const seenIds = new Set();
  for (const artifact of artifacts) {
    if (!isPlainObject(artifact)) throw new Error('invalid records.artifacts entry: object is required');
    assertPositiveSafeInt(artifact.id, 'records.artifacts entry.id');
    if (seenIds.has(artifact.id)) throw new Error('invalid records.artifacts: duplicate ids are rejected');
    seenIds.add(artifact.id);
  }
  const selected = artifacts.filter((artifact) => artifact.id === request.artifact_id);
  if (selected.length === 0) throw new Error('invalid records.artifacts: selected artifact is missing');
  if (selected.length !== 1) throw new Error('invalid records.artifacts: duplicate selected artifacts are rejected');
  const item = selected[0];
  const expectedName = `${PINNED.artifactNamePrefix}${request.commit_sha}-1`;
  if (item.name !== expectedName) throw new Error('invalid records.artifacts: selected name mismatch');
  if (item.digest !== request.artifact_digest) throw new Error('invalid records.artifacts: digest mismatch');
  if (item.expired !== false) throw new Error('invalid records.artifacts: selected artifact must be unexpired');
  if (typeof item.expires_at !== 'string') throw new Error('invalid records.artifacts: expiry is required');
  const expiryMs = Date.parse(item.expires_at);
  if (!Number.isFinite(expiryMs)) throw new Error('invalid records.artifacts: expiry must be a valid timestamp');
  if (!(expiryMs > nowMs)) throw new Error('invalid records.artifacts: expiry must be in the future');
  if (!isPlainObject(item.workflow_run)) throw new Error('invalid records.artifacts: workflow_run is required');
  if (item.workflow_run.id !== request.run_id) throw new Error('invalid records.artifacts: workflow_run id mismatch');
  if (item.workflow_run.head_sha !== request.commit_sha) throw new Error('invalid records.artifacts: workflow_run sha mismatch');
}

export function verifyMaiPropCiEvidence(request, records, nowIso) {
  if (typeof nowIso !== 'string') {
    throw new Error('invalid nowIso: strict UTC second timestamp is required');
  }
  const { nowMs } = validateRequest(request, nowIso);
  assertDeepOwnData(records, 'records');
  assertExactKeys(records, RECORD_KEYS, 'records');
  checkRepository(records.repository);
  checkBranch(records.branch, request);
  checkCommit(records.commit, request);
  checkWorkflow(records.workflow);
  checkWorkflowSource(records.workflow_source, request);
  checkRun(records.run, request);
  checkJobs(records.jobs, request);
  checkArtifacts(records.artifacts, request, nowMs);
  return {
    artifact_digest: request.artifact_digest,
    artifact_id: request.artifact_id,
    candidate_sha256: request.candidate_sha256,
    commit_sha: request.commit_sha,
    contract_sha256: request.contract_sha256,
    evidence_type: 'maiprop-github-ci-observation',
    hmac_verified_locally: false,
    mutation_authorized: false,
    note: BINDING_NOTE,
    observed_at: nowIso,
    production_ready: false,
    provider: 'github-actions',
    repository: PINNED.repoFullName,
    request_sha256: requestSha256(request),
    review_sha256: request.review_sha256,
    run_attempt: 1,
    run_id: request.run_id,
    signature_verified: false,
    source_binding_verified: false,
    task_id: request.task_id,
    tree_sha: request.tree_sha,
  };
}

function defaultGetJson() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (typeof token === 'string' && token.length > 0) {
    headers.Authorization = `Bearer ${token}`;
  }
  return async (path) => {
    if (typeof path !== 'string' || !path.startsWith('/')) {
      throw new Error('invalid api path: fixed repository path is required');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        headers,
        method: 'GET',
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`github request failed with status ${response.status}`);
      }
      const declaredLength = typeof response.headers?.get === 'function'
        ? response.headers.get('content-length')
        : null;
      if (declaredLength !== null && declaredLength !== undefined) {
        const declared = Number(declaredLength);
        if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
          throw new Error('github response exceeds the 8MiB bound');
        }
      }
      // Enforce the 8MiB bound DURING streaming: count each chunk and cancel
      // immediately on excess so an unbounded body is never consumed.
      if (!response.body || typeof response.body.getReader !== 'function') {
        throw new Error('github response body is not streamable');
      }
      const reader = response.body.getReader();
      const chunks = [];
      let bytes = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const size = value ? (value.byteLength ?? value.length ?? 0) : 0;
          bytes += size;
          if (bytes > MAX_BODY_BYTES) {
            try { await reader.cancel(); } catch { /* cancel is best-effort */ }
            throw new Error('github response exceeds the 8MiB bound');
          }
          chunks.push(value);
        }
      } catch (error) {
        if (error && error.message === 'github response exceeds the 8MiB bound') throw error;
        try { await reader.cancel(); } catch { /* cancel is best-effort */ }
        try { reader.releaseLock(); } catch { /* release is best-effort */ }
        throw error;
      }
      try { reader.releaseLock(); } catch { /* release is best-effort */ }
      const text = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
      try {
        return JSON.parse(text);
      } catch {
        throw new Error('github response is not valid JSON');
      }
    } finally {
      clearTimeout(timer);
    }
  };
}

function assertPageShape(page, key, label) {
  if (!isPlainObject(page)) {
    throw new Error(`invalid ${label}: page object is required`);
  }
  if (typeof page.total_count !== 'number' || !Number.isSafeInteger(page.total_count) || page.total_count < 0 || page.total_count > MAX_TOTAL_COUNT) {
    throw new Error(`invalid ${label}: consistent total_count 0..1000 is required`);
  }
  if (!Array.isArray(page[key])) {
    throw new Error(`invalid ${label}: array collection is required`);
  }
}

async function collectPaginated(getJson, prefix, key, label) {
  const first = await getJson(`${prefix}1`);
  assertDeepOwnData(first, `records.${label} page`);
  assertPageShape(first, key, label);
  const total = first.total_count;
  const expectedPages = total === 0 ? 1 : Math.ceil(total / PAGE_SIZE);
  if (expectedPages > MAX_PAGES) {
    throw new Error(`invalid ${label}: result exceeds page bound`);
  }
  const expectedFirstLength = expectedPages === 1 ? total : PAGE_SIZE;
  if (first[key].length !== expectedFirstLength) {
    throw new Error(`invalid ${label}: truncated or unbounded page results are rejected`);
  }
  const combined = [...first[key]];
  for (let page = 2; page <= expectedPages; page += 1) {
    const next = await getJson(`${prefix}${page}`);
    assertDeepOwnData(next, `records.${label} page`);
    assertPageShape(next, key, label);
    if (next.total_count !== total) {
      throw new Error(`invalid ${label}: changing total_count across pages is rejected`);
    }
    const remaining = total - PAGE_SIZE * (page - 1);
    const expectedLength = page < expectedPages ? PAGE_SIZE : remaining;
    if (next[key].length !== expectedLength) {
      throw new Error(`invalid ${label}: truncated or unbounded page results are rejected`);
    }
    combined.push(...next[key]);
  }
  if (combined.length !== total) {
    throw new Error(`invalid ${label}: incomplete collection is rejected`);
  }
  const seenIds = new Set();
  for (const item of combined) {
    if (!isPlainObject(item) || typeof item.id !== 'number' || !Number.isSafeInteger(item.id) || item.id < 1) {
      throw new Error(`invalid ${label}: positive unique ids are required`);
    }
    if (seenIds.has(item.id)) {
      throw new Error(`invalid ${label}: duplicate ids are rejected`);
    }
    seenIds.add(item.id);
  }
  return combined;
}

export async function collectMaiPropCiEvidence(request, options = {}) {
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw new Error('invalid options: object is required');
  }
  const optionsProto = Object.getPrototypeOf(options);
  if (optionsProto !== Object.prototype && optionsProto !== null) {
    throw new Error('invalid options: plain prototype is required');
  }
  const optionKeys = Reflect.ownKeys(options);
  for (const optionKey of optionKeys) {
    if (typeof optionKey === 'symbol') {
      throw new Error('invalid options: symbol properties are not allowed');
    }
    const optionDescriptor = Object.getOwnPropertyDescriptor(options, optionKey);
    if (!optionDescriptor || optionDescriptor.get !== undefined || optionDescriptor.set !== undefined || !('value' in optionDescriptor)) {
      throw new Error('invalid options: own data properties only, getters are not allowed');
    }
    if (optionDescriptor.enumerable !== true) {
      throw new Error('invalid options: hidden non-enumerable properties are not allowed');
    }
    if (optionKey !== 'getJson' && optionKey !== 'nowIso') {
      throw new Error('invalid options: only getJson and nowIso are allowed');
    }
  }
  const optionsGetJson = Object.getOwnPropertyDescriptor(options, 'getJson');
  if (optionsGetJson !== undefined && typeof optionsGetJson.value !== 'function') {
    throw new Error('invalid getJson: function is required');
  }
  const optionsNowIso = Object.getOwnPropertyDescriptor(options, 'nowIso');
  if (optionsNowIso !== undefined && typeof optionsNowIso.value !== 'string') {
    throw new Error('invalid nowIso: string is required');
  }
  const repoPrefix = '/repos/maiprop/maiprop-listing-site';
  // A trusted injected nowIso is the explicit synthetic test clock and is
  // reused at completion. Default real-time collection revalidates request
  // freshness at completion with a fresh clock.
  const injectedNow = options.nowIso !== undefined ? options.nowIso : null;
  const startNow = injectedNow !== undefined && injectedNow !== null
    ? injectedNow
    : toStrictSecondsIso(new Date().toISOString());
  // Validate the request BEFORE any network access.
  validateRequest(request, startNow);
  const fetcher = options.getJson !== undefined ? options.getJson : defaultGetJson();
  if (typeof fetcher !== 'function') {
    throw new Error('invalid getJson: function is required');
  }
  const commitSha = request.commit_sha;
  const runId = request.run_id;
  const repository = await fetcher(`${repoPrefix}`);
  assertDeepOwnData(repository, 'records.repository');
  const branch = await fetcher(`${repoPrefix}/branches/main`);
  assertDeepOwnData(branch, 'records.branch');
  const commit = await fetcher(`${repoPrefix}/commits/${commitSha}`);
  assertDeepOwnData(commit, 'records.commit');
  const workflow = await fetcher(`${repoPrefix}/actions/workflows/262230414`);
  assertDeepOwnData(workflow, 'records.workflow');
  const workflowSourceRaw = await fetcher(`${repoPrefix}/contents/.github/workflows/ci.yml?ref=${commitSha}`);
  assertDeepOwnData(workflowSourceRaw, 'records.workflow_source');
  // The raw GitHub Contents response must be type=file; commit_sha below
  // comes from the exact queried ref, never a provider-selected value.
  if (!isPlainObject(workflowSourceRaw) || workflowSourceRaw.type !== 'file') {
    throw new Error('invalid records.workflow_source: only file contents are accepted');
  }
  const run = await fetcher(`${repoPrefix}/actions/runs/${runId}`);
  assertDeepOwnData(run, 'records.run');
  const jobs = await collectPaginated(fetcher, `${repoPrefix}/actions/runs/${runId}/attempts/1/jobs?per_page=100&page=`, 'jobs', 'jobs');
  const artifacts = await collectPaginated(fetcher, `${repoPrefix}/actions/runs/${runId}/artifacts?per_page=100&page=`, 'artifacts', 'artifacts');
  const workflow_source = isPlainObject(workflowSourceRaw)
    ? { ...workflowSourceRaw, commit_sha: commitSha }
    : workflowSourceRaw;
  const records = { artifacts, branch, commit, jobs, repository, run, workflow, workflow_source };
  const endNow = injectedNow !== undefined && injectedNow !== null
    ? injectedNow
    : toStrictSecondsIso(new Date().toISOString());
  const observation = verifyMaiPropCiEvidence(request, records, endNow);
  return { observation, records };
}
