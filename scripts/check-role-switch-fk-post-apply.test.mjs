import { describe, expect, it } from "vitest";
import { assessRoleSwitchForeignKeyPostApply } from "./check-role-switch-fk-post-apply.mjs";

const releaseSha = "a".repeat(40);

function state(overrides = {}) {
  return {
    schema_version: 2,
    evidence_type: "maiprop-role-switch-foreign-key-state",
    constraint_name: "profiles_role_switch_audit_id_fkey",
    exists: true,
    validated: true,
    constraint_type: "f",
    on_expected_table: true,
    references_expected_table: true,
    key_columns: ["role_switch_audit_id"],
    referenced_columns: ["id"],
    delete_action: "SET NULL",
    update_action: "NO ACTION",
    match_type: "SIMPLE",
    deferrable: false,
    initially_deferred: false,
    definition:
      "FOREIGN KEY (role_switch_audit_id) REFERENCES role_switch_history(id) ON DELETE SET NULL",
    ...overrides,
  };
}

describe("role-switch foreign-key post-apply verification", () => {
  it("accepts the exact validated foreign key", () => {
    const result = assessRoleSwitchForeignKeyPostApply({
      state: state(),
      releaseSha,
      capturedAt: "2026-08-12T00:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    expect(result.release_sha).toBe(releaseSha);
    expect(result.constraint.validated).toBe(true);
  });

  it.each([
    ["missing", { exists: false }],
    ["not validated", { validated: false }],
    ["wrong type", { constraint_type: "u" }],
    ["wrong source table", { on_expected_table: false }],
    ["wrong referenced table", { references_expected_table: false }],
    ["wrong source key", { key_columns: ["user_id"] }],
    ["wrong referenced key", { referenced_columns: ["user_id"] }],
    ["wrong delete action", { delete_action: "NO ACTION" }],
    ["wrong update action", { update_action: "CASCADE" }],
    ["wrong match type", { match_type: "FULL" }],
    ["deferrable", { deferrable: true }],
    ["initially deferred", { initially_deferred: true }],
    ["missing definition", { definition: null }],
  ])("rejects a foreign key that is %s", (_label, overrides) => {
    expect(() => assessRoleSwitchForeignKeyPostApply({
      state: state(overrides),
      releaseSha,
    })).toThrow(/foreign-key post-apply/i);
  });

  it("rejects malformed evidence and non-full release SHAs", () => {
    expect(() => assessRoleSwitchForeignKeyPostApply({
      state: { ...state(), schema_version: 1 },
      releaseSha,
    })).toThrow(/schema or evidence type/i);
    expect(() => assessRoleSwitchForeignKeyPostApply({
      state: state(),
      releaseSha: "abc",
    })).toThrow(/full Git SHA/i);
  });
});
