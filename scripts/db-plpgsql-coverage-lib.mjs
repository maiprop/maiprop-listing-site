import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const hashFile = (path) => sha256(readFileSync(path));
export const expectedSegments = (name) => name === 'open_house_listing_boundary_test.sql' ? 2 : 1;

export function assertInventoryStable(before, after) {
  if (JSON.stringify(before.migrations) !== JSON.stringify(after.migrations)
    || JSON.stringify(before.suites) !== JSON.stringify(after.suites)
    || JSON.stringify(before.hashes) !== JSON.stringify(after.hashes)) {
    throw new Error('migration, suite, supporting SQL, or measurement input drift');
  }
}

export function assessRun({ percent, initialStatus, finalStatus, requestedThreshold = 80 }) {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error('invalid coverage percentage');
  const diagnosticThreshold = requestedThreshold !== 80;
  const dirty = Boolean(initialStatus || finalStatus);
  const accepted = percent >= 80 && !dirty && !diagnosticThreshold;
  return {
    status: accepted ? 'valid-target-met' : dirty ? 'valid-diagnostic-dirty'
      : diagnosticThreshold ? 'valid-diagnostic-threshold' : 'valid-below-target',
    accepted, exitCode: accepted ? 0 : 2, requiredThreshold: 80,
    requestedThreshold, diagnosticThreshold, dirty,
  };
}

export function assertDisposableName(name) {
  if (!/^maiprop_d0_[a-z0-9_]{6,48}$/.test(name ?? '')) {
    throw new Error('explicit disposable database name must match maiprop_d0_[a-z0-9_]{6,48}');
  }
  return name;
}

export function assertRepoPath(root, path, prefix, pattern) {
  const rel = relative(resolve(root), resolve(path)).split(sep).join('/');
  if (!rel.startsWith(`${prefix}/`) || rel.includes('..') || !pattern.test(rel.slice(prefix.length + 1))) {
    throw new Error(`unexpected input path: ${rel}`);
  }
  return rel;
}

// psql uses tuples-only, unaligned output. Every TAP segment has its own
// plan/finish, and only the one reviewed split file may contain two segments.
export function parseTap(raw, tests) {
  const expected = new Map(tests.map(({ name, hash }) => [name, { hash, segments: expectedSegments(name) }]));
  const seen = new Map();
  let current = null;
  let segment = null;
  let assertions = 0;
  const closeSegment = () => {
    if (!segment || segment.plan === null || segment.count !== segment.plan || !segment.finished) {
      throw new Error(`incomplete TAP segment in ${current}`);
    }
    assertions += segment.count;
    seen.get(current).segments++;
    segment = null;
  };
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    const start = /^D0_START_TEST ([a-z0-9_]+_test\.sql)$/.exec(line);
    const end = /^D0_END_TEST ([a-z0-9_]+_test\.sql)$/.exec(line);
    if (start) {
      if (current || !expected.has(start[1]) || seen.has(start[1])) throw new Error(`unexpected TAP suite ${start[1]}`);
      current = start[1];
      seen.set(current, { segments: 0, assertions: 0 });
      continue;
    }
    if (end) {
      if (current !== end[1]) throw new Error(`unpaired TAP suite ${end[1]}`);
      if (segment) closeSegment();
      if (seen.get(current).segments !== expected.get(current).segments) throw new Error(`TAP segment count mismatch: ${current}`);
      seen.get(current).assertions = assertions;
      current = null; assertions = 0;
      continue;
    }
    if (!current) continue;
    if (/^(?:Bail out!|not ok\b|# Looks like you failed)/i.test(line)) throw new Error(`TAP failure in ${current}: ${line}`);
    const plan = /^1\.\.(\d+)$/.exec(line);
    const ok = /^ok (\d+)(?:\s|$)/.exec(line);
    if (line.includes('SELECT * FROM finish();')) {
      if (!segment) throw new Error(`TAP finish without segment in ${current}`);
      segment.finished = true;
    } else if ((plan || ok) && segment?.finished && segment.plan !== null && segment.count === segment.plan) {
      closeSegment();
      if (plan) segment = { plan: null, count: 0, finished: false };
    }
    if (plan) {
      if (!segment) segment = { plan: null, count: 0, finished: false };
      if (segment.plan !== null) throw new Error(`duplicate TAP plan in ${current}`);
      segment.plan = Number(plan[1]);
    } else if (ok) {
      if (!segment) segment = { plan: null, count: 0, finished: false };
      if (Number(ok[1]) !== segment.count + 1) throw new Error(`TAP numbering mismatch in ${current}`);
      segment.count++;
    }
  }
  if (current || seen.size !== expected.size) throw new Error('TAP suite inventory mismatch');
  return { suites: seen.size, segments: [...seen.values()].reduce((n, x) => n + x.segments, 0), assertions: [...seen.values()].reduce((n, x) => n + x.assertions, 0), detail: Object.fromEntries(seen) };
}

export function parseCsv(raw) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (quoted) {
      if (c === '"' && raw[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (quoted) throw new Error('unterminated CSV quote');
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...data] = rows;
  if (!header || new Set(header).size !== header.length) throw new Error('missing/duplicate CSV header');
  return data.filter((r) => r.length && !(r.length === 1 && r[0] === '')).map((r) => {
    if (r.length !== header.length) throw new Error('CSV column count mismatch');
    return Object.fromEntries(header.map((name, index) => [name, r[index]]));
  });
}

export function validateEffectiveSchema(objects, events, migrationNames) {
  if (!objects.length || !events.length) throw new Error('empty effective schema evidence');
  const objectKeys = new Map();
  for (const object of objects) {
    const key = `${object.catalog_class}:${object.catalog_oid}`;
    if (objectKeys.has(key) || !/^[1-9]\d*$/.test(object.catalog_oid)
      || !object.object_identity || !object.object_kind || !object.canonical_definition
      || sha256(object.canonical_definition) !== object.definition_sha256) {
      throw new Error(`invalid or duplicate final object ${key}`);
    }
    objectKeys.set(key,object);
  }
  const allowedMigrations = new Set(migrationNames);
  let last = 0;
  for (const event of events) {
    const sequence = Number(event.sequence);
    if (!Number.isSafeInteger(sequence) || sequence <= last || !allowedMigrations.has(event.migration)) throw new Error('invalid lineage sequence or migration');
    last = sequence;
    if (!['current_object','dropped_object','nonaddressable_ddl_event','superseded_or_unmapped'].includes(event.lineage_status)) throw new Error('invalid lineage status');
    const key = `${event.class_name}:${event.objid}`;
    if (event.lineage_status === 'current_object') {
      const object = objectKeys.get(key);
      if (!object || event.final_identity !== object.object_identity
        || event.final_definition_sha256 !== object.definition_sha256) {
        throw new Error(`unbound or stale current object ${key}`);
      }
    } else if (event.final_definition_sha256) throw new Error(`non-current event has final definition ${key}`);
  }
  return {
    objects: objects.length, events: events.length,
    policies: objects.filter((o) => o.object_kind === 'policy').length,
    defaultAcls: objects.filter((o) => o.object_kind === 'default_acl').length,
    unresolved: events.filter((e) => e.lineage_status === 'nonaddressable_ddl_event' || e.lineage_status === 'superseded_or_unmapped').length,
  };
}

export function assertStatementIdentitySet(before, after) {
  const identity = (s) => [s.signature,s.schema_name,s.definition_sha256,s.stmtid,s.lineno,s.stmtname].join('\0');
  const collect = (rows) => {
    const found = new Set();
    for (const row of rows) {
      const key = identity(row);
      if (found.has(key)) throw new Error(`duplicate profiler identity ${row.signature} stmt ${row.stmtid}`);
      found.add(key);
    }
    return found;
  };
  const a = collect(before), b = collect(after);
  if (a.size !== b.size || [...a].some((key) => !b.has(key))) throw new Error('pre/post suite official statement identity drift');
  const afterByIdentity = new Map(after.map((row) => [identity(row), row]));
  return before.map((row) => ({ ...row,
    exec_stmts: afterByIdentity.get(identity(row)).exec_stmts,
    exec_stmts_err: afterByIdentity.get(identity(row)).exec_stmts_err,
  }));
}

export function aggregateStatements(routines, statements) {
  const bySignature = new Map();
  for (const r of routines) {
    if (!['public', 'private'].includes(r.schema_name) || !/^[a-f0-9]{64}$/.test(r.definition_sha256) || !r.signature) throw new Error('invalid routine inventory');
    if (bySignature.has(r.signature)) throw new Error(`duplicate routine ${r.signature}`);
    bySignature.set(r.signature, r);
  }
  if (!bySignature.size) throw new Error('empty routine inventory');
  const identities = new Map(); const statementIds = new Set(); const routineCounts = new Map([...bySignature].map(([k]) => [k, { hit: 0, total: 0 }]));
  for (const s of statements) {
    const r = bySignature.get(s.signature);
    if (!r || s.definition_sha256 !== r.definition_sha256 || s.schema_name !== r.schema_name) throw new Error(`stale or unknown statement routine ${s.signature}`);
    if (!/^(0|[1-9]\d*)$/.test(s.stmtid) || !/^(0|[1-9]\d*)$/.test(s.lineno) || !s.stmtname || !/^(0|[1-9]\d*)$/.test(s.exec_stmts) || !/^(0|[1-9]\d*)$/.test(s.exec_stmts_err)) throw new Error(`malformed profiler row ${s.signature}`);
    const key = [s.signature, s.definition_sha256, s.stmtid, s.lineno, s.stmtname].join('\0');
    const statementId = [s.signature, s.stmtid].join('\0');
    if (identities.has(key)) throw new Error(`duplicate profiler identity ${s.signature} stmt ${s.stmtid}`);
    if (statementIds.has(statementId)) throw new Error(`conflicting profiler statement id ${s.signature} stmt ${s.stmtid}`);
    identities.set(key, s);
    statementIds.add(statementId);
    const count = routineCounts.get(s.signature); count.total++; if (BigInt(s.exec_stmts) > 0n) count.hit++;
  }
  for (const [signature, count] of routineCounts) if (!count.total) throw new Error(`missing profiler statements for ${signature}`);
  const total = identities.size;
  const hit = [...routineCounts.values()].reduce((n, x) => n + x.hit, 0);
  const percent = 100 * hit / total;
  return { routines: bySignature.size, zeroHitRoutines: [...routineCounts.values()].filter((x) => x.hit === 0).length, hit, total, percent, requiredThreshold: 80, meetsTarget: percent >= 80, routineCounts: Object.fromEntries(routineCounts) };
}
