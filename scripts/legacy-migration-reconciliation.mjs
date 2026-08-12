import { createHash } from "node:crypto";

const SHA256 = /^[0-9a-f]{64}$/;
const VERSION = /^\d{14}$/;
const NAME = /^[A-Za-z0-9_.-]+$/;

const PRODUCTION_PROJECT_REF = "qvvicunqcrwpioqnvzxf";
const STAGING_PROJECT_REF = "xsiehskfgeoqyazcgauv";
const RECONCILIATION_ID = "production-history-v1";
const MANIFEST_TYPE = "maiprop-legacy-migration-history-reconciliation";
const FILE_DIGEST_CANONICALIZATION = "utf8-lf";
const SCHEMA_EVIDENCE_TYPE = "maiprop-legacy-migration-schema-evidence";
const CUTOVER_NAME = "reconcile_legacy_migration_effects";

const EXPECTED_LEGACY_ANOMALIES = new Map([
  [
    "20260418120000",
    ["invitation_requests_extended", "admin_audit_log", false],
  ],
  ["20260529000000", ["featured_ads_expiry", "firesale_interest_queue", false]],
  [
    "20260602032000",
    ["index_remaining_foreign_keys", "index_remaining_foreign_keys", true],
  ],
  [
    "20260602033000",
    [
      "restrict_plan_limit_helper_rpcs",
      "restrict_plan_limit_helper_rpcs",
      true,
    ],
  ],
  [
    "20260602034000",
    [
      "restrict_agent_data_input_submit_rpcs",
      "service_role_switch_audit_rpc",
      true,
    ],
  ],
  [
    "20260602035000",
    [
      "restrict_professional_review_helper_rpc",
      "restrict_professional_review_helper_rpc",
      true,
    ],
  ],
  [
    "20260602036000",
    [
      "restrict_unused_public_role_group_helpers",
      "restrict_unused_public_role_group_helpers",
      true,
    ],
  ],
  [
    "20260602037000",
    [
      "add_service_role_switch_audit_rpc",
      "add_service_role_switch_audit_rpc",
      true,
    ],
  ],
  [
    "20260602038000",
    [
      "restrict_legacy_role_switch_audit_rpc",
      "restrict_legacy_role_switch_audit_rpc",
      true,
    ],
  ],
  [
    "20260602039000",
    [
      "add_service_ai_quota_reservation_rpc",
      "add_service_ai_quota_reservation_rpc",
      true,
    ],
  ],
  [
    "20260602040000",
    [
      "restrict_legacy_reserve_ai_quota_rpc",
      "restrict_legacy_reserve_ai_quota_rpc",
      true,
    ],
  ],
]);

function fail(message) {
  throw new Error(`Legacy migration reconciliation ${message}`);
}

export function canonicalSqlFileSha256(sql) {
  return createHash("sha256")
    .update(String(sql).replace(/\r\n?/g, "\n"), "utf8")
    .digest("hex");
}

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function text(value, label, pattern) {
  const normalized = String(value ?? "").trim();
  if (!pattern.test(normalized)) fail(`${label} is invalid.`);
  return normalized;
}

function digest(value, label) {
  return text(value, label, SHA256).toLowerCase();
}

function evidenceDigest(value, label) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) {
    fail(`${label} is invalid.`);
  }
  return normalized;
}

function positiveInteger(value, label) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 1) {
    fail(`${label} must be a positive integer.`);
  }
  return normalized;
}

function migration(value, label, { file = false, execution = false } = {}) {
  const input = record(value, label);
  const normalized = {
    version: text(input.version, `${label} version`, VERSION),
    name: text(input.name, `${label} name`, NAME),
  };
  if (file)
    normalized.file_sha256 = digest(input.file_sha256, `${label} file digest`);
  if (execution) {
    normalized.statements_sha256 = digest(
      input.statements_sha256,
      `${label} executed SQL digest`,
    );
    normalized.statement_count = positiveInteger(
      input.statement_count,
      `${label} statement count`,
    );
    if (typeof input.statement_marker_only !== "boolean") {
      fail(`${label} marker flag must be boolean.`);
    }
    normalized.statement_marker_only = input.statement_marker_only;
  }
  return normalized;
}

function inventory(values, label, options) {
  if (!Array.isArray(values) || values.length === 0) {
    fail(`${label} must be a non-empty array.`);
  }
  const normalized = values
    .map((value, index) =>
      migration(value, `${label} record ${index + 1}`, options),
    )
    .sort((left, right) => left.version.localeCompare(right.version));
  if (
    new Set(normalized.map(({ version }) => version)).size !== normalized.length
  ) {
    fail(`${label} contains duplicate versions.`);
  }
  return normalized;
}

function key(value) {
  return `${value.version}_${value.name}`;
}

function sameExecution(left, right) {
  return (
    left.statements_sha256 === right.statements_sha256 &&
    left.statement_count === right.statement_count &&
    left.statement_marker_only === right.statement_marker_only
  );
}

function validateManifest(value, candidate, staging) {
  const manifest = record(value, "manifest");
  if (
    manifest.schema_version !== 1 ||
    manifest.evidence_type !== MANIFEST_TYPE ||
    manifest.reconciliation_id !== RECONCILIATION_ID ||
    manifest.file_digest_canonicalization !== FILE_DIGEST_CANONICALIZATION
  ) {
    fail(
      "manifest schema, evidence type, reconciliation ID, or file digest canonicalization is invalid.",
    );
  }
  if (
    manifest.production_project_ref !== PRODUCTION_PROJECT_REF ||
    manifest.staging_project_ref !== STAGING_PROJECT_REF
  ) {
    fail(
      "manifest project refs do not identify the fixed production and staging targets.",
    );
  }
  const cutover = migration(
    record(manifest.cutover, "manifest cutover"),
    "manifest cutover",
    {
      file: true,
    },
  );
  if (cutover.name !== CUTOVER_NAME) {
    fail(`manifest cutover must be named ${CUTOVER_NAME}.`);
  }
  const candidateCutover = candidate.find(
    ({ version }) => version === cutover.version,
  );
  const stagingCutover = staging.find(
    ({ version }) => version === cutover.version,
  );
  if (
    !candidateCutover ||
    !stagingCutover ||
    key(candidateCutover) !== key(cutover) ||
    key(stagingCutover) !== key(cutover) ||
    candidateCutover.file_sha256 !== cutover.file_sha256 ||
    stagingCutover.file_sha256 !== cutover.file_sha256 ||
    stagingCutover.statement_marker_only
  ) {
    fail("cutover migration is not the exact staged candidate anchor.");
  }
  if (!Array.isArray(manifest.anomalies)) {
    fail("manifest anomalies must be an array.");
  }
  if (
    manifest.anomalies.length !== EXPECTED_LEGACY_ANOMALIES.size ||
    new Set(manifest.anomalies.map(({ version }) => String(version))).size !==
      EXPECTED_LEGACY_ANOMALIES.size
  ) {
    fail("manifest must contain the exact legacy anomaly set.");
  }
  const anomalies = new Map();
  for (const raw of manifest.anomalies) {
    const anomaly = record(raw, "manifest anomaly");
    const version = text(anomaly.version, "manifest anomaly version", VERSION);
    const expected = EXPECTED_LEGACY_ANOMALIES.get(version);
    if (!expected || version >= cutover.version) {
      fail(
        "manifest must contain the exact legacy anomaly set before the cutover.",
      );
    }
    const production = migration(
      {
        version,
        ...record(anomaly.production, `${version} production evidence`),
      },
      `${version} production evidence`,
      { execution: true },
    );
    const canonical = migration(
      {
        version,
        ...record(anomaly.canonical, `${version} canonical evidence`),
      },
      `${version} canonical evidence`,
      { file: true, execution: true },
    );
    const [expectedProductionName, expectedCanonicalName, expectedMarker] =
      expected;
    if (
      production.name !== expectedProductionName ||
      canonical.name !== expectedCanonicalName ||
      production.statement_marker_only !== expectedMarker ||
      canonical.statement_marker_only
    ) {
      fail(`${version} does not match the exact legacy anomaly set.`);
    }
    const candidateRecord = candidate.find(
      (entry) => entry.version === version,
    );
    const stagingRecord = staging.find((entry) => entry.version === version);
    if (
      !candidateRecord ||
      !stagingRecord ||
      key(candidateRecord) !== key(canonical) ||
      key(stagingRecord) !== key(canonical) ||
      candidateRecord.file_sha256 !== canonical.file_sha256 ||
      stagingRecord.file_sha256 !== canonical.file_sha256 ||
      !sameExecution(stagingRecord, canonical)
    ) {
      fail(`${version} canonical staged evidence does not match the manifest.`);
    }
    anomalies.set(version, { production, canonical });
  }
  if (
    [...EXPECTED_LEGACY_ANOMALIES.keys()].some(
      (version) => !anomalies.has(version),
    )
  ) {
    fail("manifest must contain the exact legacy anomaly set.");
  }
  return { cutover, anomalies };
}

export function reconcileMigrationHistories({
  candidate: candidateValues,
  staging: stagingValues,
  production: productionValues,
  manifest: manifestValue,
}) {
  const candidate = inventory(candidateValues, "candidate inventory", {
    file: true,
  });
  const staging = inventory(stagingValues, "staging inventory", {
    file: true,
    execution: true,
  });
  const production = inventory(productionValues, "production inventory", {
    execution: true,
  });
  if (candidate.length !== staging.length) {
    fail("staging inventory is not the exact candidate inventory.");
  }
  for (let index = 0; index < candidate.length; index += 1) {
    if (
      key(candidate[index]) !== key(staging[index]) ||
      candidate[index].file_sha256 !== staging[index].file_sha256 ||
      staging[index].statement_marker_only
    ) {
      fail("staging inventory is not the exact candidate inventory.");
    }
  }
  const { cutover, anomalies } = validateManifest(
    manifestValue,
    candidate,
    staging,
  );
  if (production.length > staging.length) {
    fail("production contains migrations outside the staged candidate.");
  }
  const observedAnomalies = new Set();
  let cutoverApplied = false;
  for (let index = 0; index < production.length; index += 1) {
    const actual = production[index];
    const expected = staging[index];
    if (!expected || actual.version !== expected.version) {
      fail("production history is not an exact staged version prefix.");
    }
    const anomaly = anomalies.get(actual.version);
    if (anomaly) {
      observedAnomalies.add(actual.version);
      if (
        key(actual) !== key(anomaly.production) ||
        !sameExecution(actual, anomaly.production)
      ) {
        fail(
          `${actual.version} legacy anomaly evidence does not match the manifest.`,
        );
      }
    } else {
      if (actual.name !== expected.name) {
        fail(`${actual.version} is an unapproved version-name alias.`);
      }
      if (actual.statement_marker_only) {
        fail(
          `${actual.version} is an unapproved filename-only migration marker.`,
        );
      }
    }
    if (actual.version >= cutover.version) {
      if (actual.name !== expected.name || !sameExecution(actual, expected)) {
        fail(`${actual.version} post-cutover executed SQL fingerprint drift.`);
      }
      if (actual.version === cutover.version) cutoverApplied = true;
    }
  }
  if (
    [...anomalies.keys()].some((version) => !observedAnomalies.has(version))
  ) {
    fail("production does not contain the exact legacy anomaly set.");
  }
  const pending = staging.slice(production.length);
  return {
    reconciliation_id: RECONCILIATION_ID,
    legacy_anomaly_count: anomalies.size,
    cutover_applied: cutoverApplied,
    cutover,
    candidate,
    staging,
    production,
    pending,
    pending_files: pending.map(({ version, name }) => `${version}_${name}.sql`),
  };
}

export function validateLegacyMigrationSchemaEvidence(value) {
  const evidence = record(value, "schema evidence");
  if (
    evidence.schema_version !== 1 ||
    evidence.evidence_type !== SCHEMA_EVIDENCE_TYPE ||
    evidence.reconciliation_id !== RECONCILIATION_ID ||
    evidence.ok !== true
  ) {
    fail("schema evidence header is invalid or not successful.");
  }
  if (!Array.isArray(evidence.checks) || evidence.checks.length === 0) {
    fail("schema evidence checks must be a non-empty array.");
  }
  const names = new Set();
  let previous = "";
  for (const raw of evidence.checks) {
    const check = record(raw, "schema check");
    const name = text(check.name, "schema check name", NAME);
    if (names.has(name) || name.localeCompare(previous) < 0) {
      fail("schema checks must be unique and sorted by name.");
    }
    names.add(name);
    previous = name;
    if (check.ok !== true) fail(`${name} failed schema check.`);
    evidenceDigest(check.fingerprint, `${name} schema fingerprint`);
  }
  return evidence;
}
