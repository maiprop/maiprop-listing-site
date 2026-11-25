import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Deterministic router for bounded Muse contributor tasks.
// Neither routeTask nor assertPatchWithinTask grants approval or deployment.
// All validation is strict: exact keys, no coercion, real booleans,
// finite safe integers within stated bounds.

const TASK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const TASK_KEYS = ['allowed_paths', 'facts', 'goal', 'limits', 'schema_version', 'task_id'];
const FACT_KEYS = [
  'contract_complete',
  'kind',
  'new_dependency',
  'production_change',
  'public_api_change',
  'root_cause_known',
  'schema_change',
  'security_sensitive',
  'uncertainty',
];
const LIMIT_KEYS = ['max_added_lines', 'max_corrections', 'max_deleted_lines', 'max_files'];
const CHANGE_KEYS = ['added_lines', 'deleted_lines', 'path'];
const KIND_SET = new Set(['mechanical', 'implementation', 'architecture', 'investigation']);

const WORKER_MODEL = 'muse-spark-1.3-contributor';
const WORKER_EFFORT = 'high';
const SUPERVISOR_MODEL = 'gpt-6.1-sol';
const SUPERVISOR_EFFORT = 'ultra';

// Static routing policy. The policy hash covers these floors, schema bounds,
// model settings and version, and is stable across calls.
const ROUTING_POLICY = Object.freeze({
  floors: Object.freeze({
    a1: Object.freeze(['api', 'architecture', 'contract', 'dependency', 'investigation', 'root-cause', 'schema', 'security', 'sensitive-path', 'uncertainty', 'unknown-path']),
    a2: Object.freeze(['control-path', 'production-change']),
    m0_kind: 'mechanical',
    m1_kind: 'implementation',
  }),
  limits: Object.freeze({
    max_added_lines: Object.freeze([1, 100000]),
    max_corrections: Object.freeze([0, 1]),
    max_deleted_lines: Object.freeze([0, 100000]),
    max_files: Object.freeze([1, 100]),
  }),
  models: Object.freeze({
    a2: Object.freeze({
      production_ready: false,
      review_required: true,
      supervisor_effort: SUPERVISOR_EFFORT,
      supervisor_model: SUPERVISOR_MODEL,
      worker_effort: null,
      worker_model: null,
    }),
    other: Object.freeze({
      production_ready: false,
      review_required: true,
      supervisor_effort: SUPERVISOR_EFFORT,
      supervisor_model: SUPERVISOR_MODEL,
      worker_effort: WORKER_EFFORT,
      worker_model: WORKER_MODEL,
    }),
  }),
  schema: Object.freeze({
    allowed_paths_max: 100,
    allowed_paths_min: 1,
    goal_max_length: 8000,
    schema_version: 1,
    task_id_pattern: TASK_ID_RE.source,
    uncertainty_max: 3,
    uncertainty_min: 0,
  }),
  version: 1,
});

const WINDOWS_RESERVED = new Set([
  'AUX', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'CON', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
  'NUL', 'PRN',
]);

const CONTROL_DIR_NAMES = new Set(['.agents', '.codex', '.github', '.muse', '.superpowers']);

// Basename allowlist for npm/runtime/tool configuration (matched case-insensitively).
const TOOL_CONFIG_EXACT = new Set([
  '.editorconfig', '.env', '.node-version', '.npmrc', '.nvmrc', '.tool-versions', '.yarnrc',
  '.yarnrc.yml', 'bun.lock', 'bun.lockb', 'jsconfig.json', 'npm-shrinkwrap.json',
  'package-lock.json', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
  'tsconfig.json', 'yarn.lock',
]);
const TOOL_CONFIG_PREFIXES = [
  '.babelrc', '.env.', '.eslintrc', '.prettierrc', 'babel.config.', 'eslint.config.',
  'jest.config.', 'playwright.config.', 'postcss.config.', 'prettier.config.',
  'rollup.config.', 'tailwind.config.', 'tsconfig.', 'vite.config.', 'vitest.',
  'webpack.config.', 'wrangler.',
];

const DOCKER_COMPOSE_FILES = new Set(['compose.yaml', 'compose.yml', 'docker-compose.yml', 'docker-compose.yaml']);
const WRANGLER_FILES = new Set(['wrangler.json', 'wrangler.jsonc', 'wrangler.toml']);
// Conservative case-insensitive sensitive substrings. Plain substring match on
// the lowercased path: embedded occurrences (ProtectedRoute, AdminRoute,
// BillingUsagePanel, CheckoutBanner, session tokens, etc.) still force A1.
const SENSITIVE_SUBSTRINGS = Object.freeze([
  'auth', 'admin', 'protected', 'billing', 'payment', 'checkout',
  'subscription', 'permission', 'security', 'session', 'token',
]);

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Strict plain own-data object: Object.prototype (or null) prototype, no
// symbols, no accessor properties. Plain JSON.parse output passes.
function assertPlainDataObject(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`invalid ${label}: plain object is required`);
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new Error(`invalid ${label}: plain prototype is required`);
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    throw new Error(`invalid ${label}: symbol properties are not allowed`);
  }
  const names = Object.getOwnPropertyNames(value);
  for (let i = 0; i < names.length; i += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, names[i]);
    if (!descriptor || descriptor.get !== undefined || descriptor.set !== undefined || !('value' in descriptor)) {
      throw new Error(`invalid ${label}: own data properties only, getters are not allowed`);
    }
    if (descriptor.enumerable !== true) {
      throw new Error(`invalid ${label}: hidden non-enumerable properties are not allowed`);
    }
  }
  return value;
}

// Strict plain array: Array.prototype prototype, no symbols, no extra own
// properties, no holes, no accessors. Callers must iterate by index and must
// not invoke caller instance methods on untrusted arrays.
function assertStrictArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`invalid ${label}: array is required`);
  }
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error(`invalid ${label}: plain Array prototype is required`);
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    throw new Error(`invalid ${label}: symbol properties are not allowed`);
  }
  const length = value.length;
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== length + 1) {
    throw new Error(`invalid ${label}: extra own properties are not allowed`);
  }
  for (let i = 0; i < length; i += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, String(i))) {
      throw new Error(`invalid ${label}: holes are not allowed`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || descriptor.get !== undefined || descriptor.set !== undefined || !('value' in descriptor)) {
      throw new Error(`invalid ${label}: own data properties only, getters are not allowed`);
    }
    if (descriptor.enumerable !== true) {
      throw new Error(`invalid ${label}: hidden non-enumerable properties are not allowed`);
    }
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (!lengthDescriptor || lengthDescriptor.get !== undefined || lengthDescriptor.set !== undefined) {
    throw new Error(`invalid ${label}: plain length is required`);
  }
  return value;
}

// Deep strict own-data validation. Accepts only JSON scalars (finite
// numbers, strings, booleans, null), strict arrays and plain or
// null-prototype objects with enumerable own data properties. Inspects
// descriptors via Reflect.ownKeys without invoking accessors, so getters
// never run during validation. Rejects symbols, accessors, hidden or
// non-enumerable own properties, custom prototypes, functions, repeated or
// cyclic references, sparse arrays and custom array own properties.
// Unrelated ordinary data fields are permitted; custom capabilities are not.
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

function canonicalStringify(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    let out = '[';
    for (let i = 0; i < value.length; i += 1) {
      if (i > 0) out += ',';
      out += canonicalStringify(value[i]);
    }
    return `${out}]`;
  }
  if (typeof value === 'object') {
    const body = Object.getOwnPropertyNames(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`)
      .join(',');
    return `{${body}}`;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  throw new Error('invalid value: only JSON scalars, arrays and objects are supported');
}

function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function assertExactKeys(obj, expectedSorted, label) {
  assertPlainDataObject(obj, label);
  const actual = Object.getOwnPropertyNames(obj).sort();
  if (actual.length !== expectedSorted.length || actual.some((key, i) => key !== expectedSorted[i])) {
    throw new Error(`invalid ${label}: exact keys [${expectedSorted.join(', ')}] are required`);
  }
}

function assertBoundedInt(value, min, max, label) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`invalid ${label}: safe integer ${min}..${max} is required`);
  }
}

function assertRealBoolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new Error(`invalid ${label}: real boolean is required`);
  }
}

// Canonical repository-relative file path. Rejects every ambiguous form:
// absolute, drive-letter, backslash, empty/dot/dotdot/.git components,
// control characters, percent encodings, colons, globs, trailing
// spaces/dots per component, and Windows reserved basenames.
function validateCanonicalPath(path, label) {
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error(`invalid ${label}: non-empty string path is required`);
  }
  if (path.includes('\\')) {
    throw new Error(`invalid ${label}: backslashes are not allowed`);
  }
  if (path.startsWith('/')) {
    throw new Error(`invalid ${label}: absolute paths are not allowed`);
  }
  if (/^[A-Za-z]:/.test(path)) {
    throw new Error(`invalid ${label}: drive-letter paths are not allowed`);
  }
  if (path.includes(':')) {
    throw new Error(`invalid ${label}: colons are not allowed`);
  }
  if (path.includes('%')) {
    throw new Error(`invalid ${label}: percent encodings are not allowed`);
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(path)) {
    throw new Error(`invalid ${label}: control characters are not allowed`);
  }
  if (/[*?[\]{}]/.test(path)) {
    throw new Error(`invalid ${label}: glob characters are not allowed`);
  }
  const components = path.split('/');
  for (const component of components) {
    if (component === '') {
      throw new Error(`invalid ${label}: empty path components are not allowed`);
    }
    if (component === '.' || component === '..') {
      throw new Error(`invalid ${label}: dot components are not allowed`);
    }
    if (component.toLowerCase() === '.git') {
      throw new Error(`invalid ${label}: .git components are not allowed`);
    }
    if (component.endsWith(' ') || component.endsWith('.')) {
      throw new Error(`invalid ${label}: trailing spaces/dots are not allowed`);
    }
    const stem = component.split('.')[0].toUpperCase();
    if (WINDOWS_RESERVED.has(stem)) {
      throw new Error(`invalid ${label}: Windows reserved names are not allowed`);
    }
  }
  return path;
}

function validateAllowedPaths(value) {
  assertStrictArray(value, 'allowed_paths');
  if (value.length < 1 || value.length > 100) {
    throw new Error('invalid allowed_paths: array of 1..100 paths is required');
  }
  const seen = new Set();
  const seenLower = new Set();
  for (let i = 0; i < value.length; i += 1) {
    const entry = value[i];
    validateCanonicalPath(entry, 'allowed_paths entry');
    if (seen.has(entry)) {
      throw new Error('invalid allowed_paths: duplicate paths are not allowed');
    }
    seen.add(entry);
    const lower = entry.toLowerCase();
    if (seenLower.has(lower)) {
      throw new Error('invalid allowed_paths: case collisions are not allowed');
    }
    seenLower.add(lower);
  }
  return value;
}

function validateTask(task) {
  assertDeepOwnData(task, 'task');
  assertPlainDataObject(task, 'task');
  assertExactKeys(task, TASK_KEYS, 'task');
  if (task.schema_version !== 1) {
    throw new Error('invalid task.schema_version: 1 is required');
  }
  if (typeof task.task_id !== 'string' || !TASK_ID_RE.test(task.task_id)) {
    throw new Error('invalid task.task_id: ASCII alphanumeric start, [A-Za-z0-9_-], max 64');
  }
  if (typeof task.goal !== 'string' || task.goal.length === 0 || task.goal.length > 8000 || task.goal.trim().length === 0) {
    throw new Error('invalid task.goal: nonblank text of max 8000 chars is required');
  }
  validateAllowedPaths(task.allowed_paths);
  assertPlainDataObject(task.facts, 'task.facts');
  assertExactKeys(task.facts, FACT_KEYS, 'task.facts');
  if (typeof task.facts.kind !== 'string' || !KIND_SET.has(task.facts.kind)) {
    throw new Error('invalid task.facts.kind: mechanical/implementation/architecture/investigation is required');
  }
  for (const key of ['root_cause_known', 'contract_complete', 'security_sensitive', 'schema_change', 'public_api_change', 'new_dependency', 'production_change']) {
    assertRealBoolean(task.facts[key], `task.facts.${key}`);
  }
  assertBoundedInt(task.facts.uncertainty, 0, 3, 'task.facts.uncertainty');
  assertPlainDataObject(task.limits, 'task.limits');
  assertExactKeys(task.limits, LIMIT_KEYS, 'task.limits');
  assertBoundedInt(task.limits.max_files, 1, 100, 'task.limits.max_files');
  assertBoundedInt(task.limits.max_added_lines, 1, 100000, 'task.limits.max_added_lines');
  assertBoundedInt(task.limits.max_deleted_lines, 0, 100000, 'task.limits.max_deleted_lines');
  assertBoundedInt(task.limits.max_corrections, 0, 1, 'task.limits.max_corrections');
  return task;
}

function splitLower(path) {
  return path.toLowerCase().split('/');
}

function hasWindow(components, ...window) {
  for (let i = 0; i + window.length <= components.length; i += 1) {
    if (window.every((segment, offset) => components[i + offset] === segment)) {
      return true;
    }
  }
  return false;
}

// A2 control-path floor. Classification is case-insensitive; admission
// elsewhere still requires exact path equality.
function isControlPath(path) {
  const lower = path.toLowerCase();
  const components = lower.split('/');
  const basename = components[components.length - 1];
  if (components.some((component) => CONTROL_DIR_NAMES.has(component))) {
    return true;
  }
  if (components[0] === 'scripts') {
    return true;
  }
  if (hasWindow(components, 'docs', 'governance')) {
    return true;
  }
  if (lower === 'package.json' || lower === 'package-lock.json') {
    return true;
  }
  if (TOOL_CONFIG_EXACT.has(basename)) {
    return true;
  }
  if (TOOL_CONFIG_PREFIXES.some((prefix) => basename.startsWith(prefix))) {
    return true;
  }
  if (basename === 'dockerfile' || basename.startsWith('dockerfile.')) {
    return true;
  }
  if (DOCKER_COMPOSE_FILES.has(basename)) {
    return true;
  }
  if (basename === 'containerfile' || basename.startsWith('containerfile.') || basename === '.dockerignore') {
    return true;
  }
  if (WRANGLER_FILES.has(basename) || basename.startsWith('cloudflare')) {
    return true;
  }
  if (basename === '_routes.json' || basename === '_headers' || basename === '_redirects') {
    return true;
  }
  if (hasWindow(components, 'src', 'components', 'ui')) {
    return true;
  }
  return false;
}

// A1 sensitive-path floor (case-insensitive conservative substrings).
function isSensitivePath(path) {
  const lower = path.toLowerCase();
  const components = lower.split('/');
  if (components[0] === 'supabase' || components[0] === 'functions') {
    return true;
  }
  if (hasWindow(components, 'src', 'integrations')) {
    return true;
  }
  for (let i = 0; i < SENSITIVE_SUBSTRINGS.length; i += 1) {
    if (lower.includes(SENSITIVE_SUBSTRINGS[i])) {
      return true;
    }
  }
  return false;
}

// Only anchored ordinary prefixes docs/guides/,
// src/components/marketing/ and src/components/presentation/ can reach
// M0/M1. Classification is case-insensitive. Every other path defaults to
// A1 or above; control and sensitive floors still win.
function isKnownOrdinaryPath(path) {
  const lower = path.toLowerCase();
  if (isControlPath(path) || isSensitivePath(path)) {
    return false;
  }
  if (lower.startsWith('docs/guides/')) {
    return true;
  }
  if (lower.startsWith('src/components/marketing/')) {
    return true;
  }
  if (lower.startsWith('src/components/presentation/')) {
    return true;
  }
  return false;
}

function bindingsFor(route) {
  if (route === 'A2') {
    return {
      production_ready: false,
      review_required: true,
      supervisor_effort: SUPERVISOR_EFFORT,
      supervisor_model: SUPERVISOR_MODEL,
      worker_effort: null,
      worker_model: null,
    };
  }
  return {
    production_ready: false,
    review_required: true,
    supervisor_effort: SUPERVISOR_EFFORT,
    supervisor_model: SUPERVISOR_MODEL,
    worker_effort: WORKER_EFFORT,
    worker_model: WORKER_MODEL,
  };
}

// Policy fingerprint covers the actual routing rules/logic: this complete
// module's source bytes (control sets, regexes/substrings, classification,
// validation, bounds, model/version settings) hashed ONCE at import. Any
// change to an actual rule literal (including '.github') changes the digest.
// No stored self-referential literal digest.
const POLICY_SOURCE_SHA256 = createHash('sha256')
  .update(readFileSync(fileURLToPath(import.meta.url)))
  .digest('hex');

function policySha256() {
  return POLICY_SOURCE_SHA256;
}

export function routeTask(task) {
  validateTask(task);
  const reasons = [];
  let route;
  if (task.facts.production_change === true) {
    route = 'A2';
    reasons.push('production-change: production_change floor forces supervisor-owned A2');
  } else {
    const controlHits = [];
    for (let i = 0; i < task.allowed_paths.length; i += 1) {
      if (isControlPath(task.allowed_paths[i])) controlHits.push(task.allowed_paths[i]);
    }
    if (controlHits.length > 0) {
      route = 'A2';
      reasons.push(`control-path: supervisor-owned path (${controlHits[0]})`);
    } else {
      const floors = [];
      if (task.facts.security_sensitive === true) floors.push('security: security_sensitive floor forces A1');
      if (task.facts.schema_change === true) floors.push('schema: schema_change floor forces A1');
      if (task.facts.public_api_change === true) floors.push('api: public_api_change floor forces A1');
      if (task.facts.new_dependency === true) floors.push('dependency: new_dependency floor forces A1');
      if (task.facts.root_cause_known !== true) floors.push('root-cause: unknown root cause floor forces A1');
      if (task.facts.contract_complete !== true) floors.push('contract: incomplete contract floor forces A1');
      if (task.facts.uncertainty !== 0) floors.push('uncertainty: nonzero uncertainty floor forces A1');
      if (task.facts.kind === 'architecture') floors.push('architecture: architecture kind floor forces A1');
      if (task.facts.kind === 'investigation') floors.push('investigation: investigation kind floor forces A1');
      const sensitiveHits = [];
      for (let i = 0; i < task.allowed_paths.length; i += 1) {
        if (isSensitivePath(task.allowed_paths[i])) sensitiveHits.push(task.allowed_paths[i]);
      }
      if (sensitiveHits.length > 0) {
        floors.push(`sensitive-path: sensitive path (${sensitiveHits[0]}) forces A1`);
      }
      const unknownHits = [];
      for (let i = 0; i < task.allowed_paths.length; i += 1) {
        if (!isKnownOrdinaryPath(task.allowed_paths[i])) unknownHits.push(task.allowed_paths[i]);
      }
      if (unknownHits.length > 0) {
        floors.push(`unknown-path: unknown path (${unknownHits[0]}) defaults to A1`);
      }
      if (floors.length > 0) {
        route = 'A1';
        reasons.push(...floors);
      } else if (task.facts.kind === 'mechanical') {
        route = 'M0';
        reasons.push('mechanical: known ordinary paths with complete facts and zero risk');
      } else if (task.facts.kind === 'implementation') {
        route = 'M1';
        reasons.push('implementation: known ordinary paths with complete facts and zero risk');
      } else {
        route = 'A1';
        reasons.push('unknown-path: kind cannot reach Muse routes');
      }
    }
  }
  const taskSha256 = sha256Hex(canonicalStringify(task));
  const policySha256Value = policySha256();
  return {
    hashes: {
      policy_sha256: policySha256Value,
      task_sha256: taskSha256,
    },
    policy_sha256: policySha256Value,
    production_ready: false,
    reasons,
    review_required: true,
    route,
    schema_version: 1,
    supervisor_effort: SUPERVISOR_EFFORT,
    supervisor_model: SUPERVISOR_MODEL,
    task_id: task.task_id,
    task_sha256: taskSha256,
    worker_effort: bindingsFor(route).worker_effort,
    worker_model: bindingsFor(route).worker_model,
  };
}

// Validates reported diff metadata against the task contract. It does not
// prove that metadata came from Git, nor signature identity or review
// completion. A2 tasks cannot be Muse patches even when explicitly allowed.
export function assertPatchWithinTask(task, changes) {
  const routed = routeTask(task);
  assertDeepOwnData(changes, 'changes');
  assertStrictArray(changes, 'changes');
  if (changes.length === 0) {
    throw new Error('invalid changes: non-empty array is required');
  }
  const seen = new Set();
  const seenLower = new Set();
  let addedTotal = 0;
  let deletedTotal = 0;
  for (let i = 0; i < changes.length; i += 1) {
    const change = changes[i];
    assertPlainDataObject(change, 'changes entry');
    assertExactKeys(change, CHANGE_KEYS, 'changes entry');
    validateCanonicalPath(change.path, 'changes entry path');
    if (typeof change.added_lines !== 'number' || !Number.isSafeInteger(change.added_lines) || change.added_lines < 0) {
      throw new Error('invalid changes entry added_lines: safe nonnegative integer is required');
    }
    if (typeof change.deleted_lines !== 'number' || !Number.isSafeInteger(change.deleted_lines) || change.deleted_lines < 0) {
      throw new Error('invalid changes entry deleted_lines: safe nonnegative integer is required');
    }
    if (seen.has(change.path)) {
      throw new Error('invalid changes: duplicate paths are not allowed');
    }
    seen.add(change.path);
    const lower = change.path.toLowerCase();
    if (seenLower.has(lower)) {
      throw new Error('invalid changes: case collisions are not allowed');
    }
    seenLower.add(lower);
    addedTotal += change.added_lines;
    deletedTotal += change.deleted_lines;
    if (!Number.isSafeInteger(addedTotal) || !Number.isSafeInteger(deletedTotal)) {
      throw new Error('invalid changes: aggregate line counts overflow safe integers');
    }
  }
  const allowed = new Set(task.allowed_paths);
  for (const path of seen) {
    if (!allowed.has(path)) {
      throw new Error('invalid changes: every path must be exactly allowed');
    }
  }
  if (seen.size > task.limits.max_files) {
    throw new Error('invalid changes: file count exceeds task limits');
  }
  if (addedTotal > task.limits.max_added_lines) {
    throw new Error('invalid changes: added lines exceed task limits');
  }
  if (deletedTotal > task.limits.max_deleted_lines) {
    throw new Error('invalid changes: deleted lines exceed task limits');
  }
  if (routed.route === 'A2') {
    throw new Error('invalid changes: A2 tasks cannot be Muse patches');
  }
  return {
    added_lines: addedTotal,
    deleted_lines: deletedTotal,
    files: seen.size,
    hashes: routed.hashes,
    policy_sha256: routed.policy_sha256,
    production_ready: false,
    review_required: true,
    route: routed.route,
    task_sha256: routed.task_sha256,
    schema_version: 1,
    status: 'within_contract_pending_review',
    supervisor_effort: routed.supervisor_effort,
    supervisor_model: routed.supervisor_model,
    task_id: routed.task_id,
    worker_effort: routed.worker_effort,
    worker_model: routed.worker_model,
  };
}
