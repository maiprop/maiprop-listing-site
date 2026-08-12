import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROLE_SWITCH_INDEX_THRESHOLD_BYTES = 128 * 1024 * 1024;
export const ROLE_SWITCH_FINALIZATION_MIGRATION =
  "20260812102338_finalize_role_switch_audit_integrity.sql";
const EXPECTED_INDEXES = {
  profiles: {
    access_method: "btree",
    unique: false,
    attribute_count: 1,
    key_attribute_count: 1,
    key_columns: ["role_switch_audit_id"],
    predicate: "role_switch_audit_id IS NOT NULL",
    definition:
      "CREATE INDEX idx_profiles_role_switch_audit_id ON public.profiles USING btree (role_switch_audit_id) WHERE (role_switch_audit_id IS NOT NULL)",
  },
  role_switch_history: {
    access_method: "btree",
    unique: false,
    attribute_count: 3,
    key_attribute_count: 3,
    key_columns: [
      "billing_reconciliation_next_attempt_at",
      "billing_reconciliation_attempt_count",
      "switched_at",
    ],
    predicate: "billing_reconciliation_required = true",
    definition:
      "CREATE INDEX idx_role_switch_history_reconciliation_due ON public.role_switch_history USING btree (billing_reconciliation_next_attempt_at, billing_reconciliation_attempt_count, switched_at) WHERE (billing_reconciliation_required = true)",
  },
  agent_data_inputs: {
    access_method: "btree",
    unique: false,
    attribute_count: 2,
    key_attribute_count: 2,
    key_columns: ["user_id", "discount_invoice_id"],
    predicate: "discount_invoice_id IS NOT NULL",
    definition:
      "CREATE INDEX idx_agent_data_inputs_user_discount_invoice ON public.agent_data_inputs USING btree (user_id, discount_invoice_id) WHERE (discount_invoice_id IS NOT NULL)",
  },
};

function fail(message) {
  throw new Error(`Role-switch index preflight ${message}`);
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function normalizeRelation(value, label) {
  const relation = object(value, label);
  const index = object(relation.index, `${label}.index`);
  if (relation.relation_exists !== true) {
    fail(`${label} must exist before production promotion.`);
  }
  for (const field of [
    "exists",
    "valid",
    "ready",
    "live",
    "unique",
    "on_expected_table",
  ]) {
    if (typeof index[field] !== "boolean") {
      fail(`${label}.index.${field} must be boolean.`);
    }
  }
  if (!Array.isArray(index.key_columns) ||
      index.key_columns.some((value) => typeof value !== "string")) {
    fail(`${label}.index.key_columns must be an array of strings.`);
  }
  for (const field of ["access_method", "predicate", "definition"]) {
    if (index[field] !== null && typeof index[field] !== "string") {
      fail(`${label}.index.${field} must be a string or null.`);
    }
  }
  if (index.exists && !String(index.definition ?? "").trim()) {
    fail(`${label}.index.definition is required for an existing index.`);
  }
  return {
    heap_bytes: nonNegativeInteger(relation.heap_bytes, `${label}.heap_bytes`),
    index: {
      exists: index.exists,
      valid: index.valid,
      ready: index.ready,
      live: index.live,
      unique: index.unique,
      on_expected_table: index.on_expected_table,
      access_method: index.access_method,
      attribute_count: nonNegativeInteger(
        index.attribute_count,
        `${label}.index.attribute_count`,
      ),
      key_attribute_count: nonNegativeInteger(
        index.key_attribute_count,
        `${label}.index.key_attribute_count`,
      ),
      key_columns: [...index.key_columns],
      predicate: index.predicate,
      definition: index.definition,
    },
  };
}

function indexIsReady(index, expected) {
  return index.exists &&
    index.valid &&
    index.ready &&
    index.live &&
    index.on_expected_table &&
    index.unique === expected.unique &&
    index.access_method === expected.access_method &&
    index.attribute_count === expected.attribute_count &&
    index.key_attribute_count === expected.key_attribute_count &&
    index.attribute_count === index.key_attribute_count &&
    index.predicate === expected.predicate &&
    index.definition === expected.definition &&
    index.key_columns.length === expected.key_columns.length &&
    index.key_columns.every(
      (column, position) => column === expected.key_columns[position],
    );
}

export function assessRoleSwitchIndexPreflight({
  state,
  plan,
  releaseSha,
  requireFinalized = false,
  capturedAt = new Date().toISOString(),
}) {
  const normalizedState = object(state, "state");
  if (
    normalizedState.schema_version !== 4 ||
    normalizedState.evidence_type !== "maiprop-role-switch-index-state"
  ) {
    fail("state schema or evidence type is invalid.");
  }
  const normalizedPlan = object(plan, "migration plan");
  if (!Array.isArray(normalizedPlan.pending_files)) {
    fail("migration plan pending_files must be an array.");
  }
  const normalizedSha = String(releaseSha ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalizedSha)) {
    fail("release SHA must be a full Git SHA.");
  }

  const profiles = normalizeRelation(normalizedState.profiles, "profiles");
  const history = normalizeRelation(
    normalizedState.role_switch_history,
    "role_switch_history",
  );
  const agentInputs = normalizeRelation(
    normalizedState.agent_data_inputs,
    "agent_data_inputs",
  );
  const finalizationMigrationPending = normalizedPlan.pending_files.includes(
    ROLE_SWITCH_FINALIZATION_MIGRATION,
  );
  const relations = [
    ["profiles", profiles],
    ["role_switch_history", history],
    ["agent_data_inputs", agentInputs],
  ];
  const invalidIndexes = relations
    .filter(([name, relation]) =>
      relation.index.exists &&
      !indexIsReady(relation.index, EXPECTED_INDEXES[name]))
    .map(([name]) => name);
  const missingIndexes = relations
    .filter(([name, relation]) =>
      !relation.index.exists &&
      !indexIsReady(relation.index, EXPECTED_INDEXES[name]))
    .map(([name]) => name);
  const onlinePrebuildRequired = requireFinalized ? [] : missingIndexes;
  const largeRelations = relations
    .filter(([, relation]) =>
      relation.heap_bytes > ROLE_SWITCH_INDEX_THRESHOLD_BYTES)
    .map(([name]) => name);
  const missingAfterFinalization = requireFinalized ? missingIndexes : [];
  const ok = invalidIndexes.length === 0 && missingAfterFinalization.length === 0;
  const evidence = {
    schema_version: 4,
    evidence_type: "maiprop-role-switch-index-preflight",
    release_sha: normalizedSha,
    verification_phase: requireFinalized ? "post_apply" : "pre_apply",
    finalization_migration: ROLE_SWITCH_FINALIZATION_MIGRATION,
    finalization_migration_pending: finalizationMigrationPending,
    threshold_bytes: ROLE_SWITCH_INDEX_THRESHOLD_BYTES,
    profiles,
    role_switch_history: history,
    agent_data_inputs: agentInputs,
    invalid_indexes: invalidIndexes,
    large_relations: largeRelations,
    online_prebuild_required: onlinePrebuildRequired,
    missing_after_finalization: missingAfterFinalization,
    ok,
    captured_at: capturedAt,
  };

  if (!ok) {
    if (invalidIndexes.length > 0) {
      fail(`found invalid or misplaced indexes: ${invalidIndexes.join(", ")}.`);
    }
    fail(
      `online finalization is incomplete for: ${missingAfterFinalization.join(", ")}.`,
    );
  }

  return evidence;
}

function readFlag(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function main() {
  const statePath = readFlag("--state");
  const planPath = readFlag("--plan");
  const outPath = readFlag("--out");
  if (!statePath || !planPath || !outPath) {
    fail("requires --state, --plan, and --out.");
  }
  const evidence = assessRoleSwitchIndexPreflight({
    state: JSON.parse(readFileSync(resolve(statePath), "utf8")),
    plan: JSON.parse(readFileSync(resolve(planPath), "utf8")),
    releaseSha: readFlag("--release-sha") ?? process.env.RELEASE_SHA,
    requireFinalized: process.argv.includes("--require-finalized"),
  });
  writeFileSync(resolve(outPath), `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(
    `Role-switch index preflight passed for ${evidence.release_sha}.\n`,
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
