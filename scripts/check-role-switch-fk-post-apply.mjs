import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED = {
  constraint_name: "profiles_role_switch_audit_id_fkey",
  constraint_type: "f",
  key_columns: ["role_switch_audit_id"],
  referenced_columns: ["id"],
  delete_action: "SET NULL",
  update_action: "NO ACTION",
  match_type: "SIMPLE",
};

function fail(message) {
  throw new Error(`Role-switch foreign-key post-apply ${message}`);
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function exactStringArray(value, expected, label) {
  if (
    !Array.isArray(value) ||
    value.length !== expected.length ||
    value.some((entry, index) => entry !== expected[index])
  ) {
    fail(`${label} does not match the required ordered columns.`);
  }
  return [...value];
}

export function assessRoleSwitchForeignKeyPostApply({
  state,
  releaseSha,
  capturedAt = new Date().toISOString(),
}) {
  const normalized = object(state, "state");
  if (
    normalized.schema_version !== 2 ||
    normalized.evidence_type !== "maiprop-role-switch-foreign-key-state"
  ) {
    fail("state schema or evidence type is invalid.");
  }
  const normalizedSha = String(releaseSha ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalizedSha)) {
    fail("release SHA must be a full Git SHA.");
  }
  for (const field of [
    "exists",
    "validated",
    "on_expected_table",
    "references_expected_table",
    "deferrable",
    "initially_deferred",
  ]) {
    if (typeof normalized[field] !== "boolean") {
      fail(`${field} must be boolean.`);
    }
  }
  if (
    normalized.constraint_name !== EXPECTED.constraint_name ||
    normalized.exists !== true ||
    normalized.validated !== true ||
    normalized.constraint_type !== EXPECTED.constraint_type ||
    normalized.on_expected_table !== true ||
    normalized.references_expected_table !== true ||
    normalized.delete_action !== EXPECTED.delete_action ||
    normalized.update_action !== EXPECTED.update_action ||
    normalized.match_type !== EXPECTED.match_type ||
    normalized.deferrable !== false ||
    normalized.initially_deferred !== false ||
    typeof normalized.definition !== "string" ||
    normalized.definition.trim() === ""
  ) {
    fail("constraint does not match the exact validated production contract.");
  }

  const constraint = {
    constraint_name: normalized.constraint_name,
    exists: normalized.exists,
    validated: normalized.validated,
    constraint_type: normalized.constraint_type,
    on_expected_table: normalized.on_expected_table,
    references_expected_table: normalized.references_expected_table,
    key_columns: exactStringArray(
      normalized.key_columns,
      EXPECTED.key_columns,
      "key_columns",
    ),
    referenced_columns: exactStringArray(
      normalized.referenced_columns,
      EXPECTED.referenced_columns,
      "referenced_columns",
    ),
    delete_action: normalized.delete_action,
    update_action: normalized.update_action,
    match_type: normalized.match_type,
    deferrable: normalized.deferrable,
    initially_deferred: normalized.initially_deferred,
    definition: normalized.definition,
  };

  return {
    schema_version: 2,
    evidence_type: "maiprop-role-switch-foreign-key-post-apply",
    release_sha: normalizedSha,
    constraint,
    ok: true,
    captured_at: capturedAt,
  };
}

function readFlag(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function main() {
  const statePath = readFlag("--state");
  const outPath = readFlag("--out");
  if (!statePath || !outPath) {
    fail("requires --state and --out.");
  }
  const evidence = assessRoleSwitchForeignKeyPostApply({
    state: JSON.parse(readFileSync(resolve(statePath), "utf8")),
    releaseSha: readFlag("--release-sha") ?? process.env.RELEASE_SHA,
  });
  writeFileSync(resolve(outPath), `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(
    `Role-switch foreign-key post-apply passed for ${evidence.release_sha}.\n`,
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
