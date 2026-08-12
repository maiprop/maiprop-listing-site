import { describe, expect, it } from "vitest";
import {
  assessRoleSwitchIndexPreflight,
  ROLE_SWITCH_FINALIZATION_MIGRATION,
  ROLE_SWITCH_INDEX_THRESHOLD_BYTES,
} from "./check-role-switch-index-preflight.mjs";

const releaseSha = "a".repeat(40);
const readyIndex = {
  exists: true,
  valid: true,
  ready: true,
  live: true,
  unique: false,
  on_expected_table: true,
  access_method: "btree",
  attribute_count: 1,
  key_attribute_count: 1,
  key_columns: ["role_switch_audit_id"],
  predicate: "role_switch_audit_id IS NOT NULL",
  definition:
    "CREATE INDEX idx_profiles_role_switch_audit_id ON public.profiles USING btree (role_switch_audit_id) WHERE (role_switch_audit_id IS NOT NULL)",
};
const missingIndex = {
  exists: false,
  valid: false,
  ready: false,
  live: false,
  unique: false,
  on_expected_table: false,
  access_method: null,
  attribute_count: 0,
  key_attribute_count: 0,
  key_columns: [],
  predicate: null,
  definition: null,
};
const readyHistoryIndex = {
  ...readyIndex,
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
};
const readyInvoiceIndex = {
  ...readyIndex,
  attribute_count: 2,
  key_attribute_count: 2,
  key_columns: ["user_id", "discount_invoice_id"],
  predicate: "discount_invoice_id IS NOT NULL",
  definition:
    "CREATE INDEX idx_agent_data_inputs_user_discount_invoice ON public.agent_data_inputs USING btree (user_id, discount_invoice_id) WHERE (discount_invoice_id IS NOT NULL)",
};

function state({
  profilesBytes = 49_152,
  historyBytes = 8_192,
  agentInputsBytes = 8_192,
  profilesIndex = missingIndex,
  historyIndex = missingIndex,
  invoiceIndex = missingIndex,
} = {}) {
  return {
    schema_version: 4,
    evidence_type: "maiprop-role-switch-index-state",
    profiles: { relation_exists: true, heap_bytes: profilesBytes, index: profilesIndex },
    role_switch_history: { relation_exists: true, heap_bytes: historyBytes, index: historyIndex },
    agent_data_inputs: { relation_exists: true, heap_bytes: agentInputsBytes, index: invoiceIndex },
  };
}

function plan(pending = [ROLE_SWITCH_FINALIZATION_MIGRATION]) {
  return { pending_files: pending };
}

describe("role-switch production index preflight", () => {
  it("allows missing indexes into the guarded online finalization phase", () => {
    const result = assessRoleSwitchIndexPreflight({
      state: state(),
      plan: plan(),
      releaseSha,
      capturedAt: "2026-08-12T00:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    expect(result.finalization_migration_pending).toBe(true);
    expect(result.online_prebuild_required).toEqual([
      "profiles",
      "role_switch_history",
      "agent_data_inputs",
    ]);
  });

  it("supports large relations without a blocking transactional build", () => {
    const result = assessRoleSwitchIndexPreflight({
      state: state({
        profilesBytes: ROLE_SWITCH_INDEX_THRESHOLD_BYTES + 1,
        agentInputsBytes: ROLE_SWITCH_INDEX_THRESHOLD_BYTES + 1,
      }),
      plan: plan(),
      releaseSha,
    });

    expect(result.ok).toBe(true);
    expect(result.large_relations).toEqual(["profiles", "agent_data_inputs"]);
    expect(result.online_prebuild_required).toContain("profiles");
    expect(result.online_prebuild_required).toContain("agent_data_inputs");
  });

  it("allows an idempotent online repair when migrations are already recorded", () => {
    const result = assessRoleSwitchIndexPreflight({
      state: state(),
      plan: plan([]),
      releaseSha,
    });

    expect(result.ok).toBe(true);
    expect(result.finalization_migration_pending).toBe(false);
    expect(result.online_prebuild_required).toEqual([
      "profiles",
      "role_switch_history",
      "agent_data_inputs",
    ]);
  });

  it("rejects an existing index that is invalid or not ready", () => {
    expect(() => assessRoleSwitchIndexPreflight({
      state: state({ profilesIndex: { ...readyIndex, valid: false } }),
      plan: plan(),
      releaseSha,
    })).toThrow(/invalid or misplaced indexes: profiles/i);
  });

  it.each([
    ["wrong access method", { access_method: "hash" }],
    ["unique", { unique: true }],
    ["wrong key order", { key_columns: ["switched_at"] }],
    ["wrong predicate", { predicate: "role_switch_audit_id IS NULL" }],
    ["not live", { live: false }],
    ["included column", { attribute_count: 2 }],
    ["wrong canonical definition", { definition: "CREATE INDEX unexpected" }],
  ])("rejects a same-name profiles index with %s", (_label, change) => {
    expect(() => assessRoleSwitchIndexPreflight({
      state: state({ profilesIndex: { ...readyIndex, ...change } }),
      plan: plan(),
      releaseSha,
    })).toThrow(/invalid or misplaced indexes: profiles/i);
  });

  it("requires all exact indexes during post-apply verification", () => {
    expect(() => assessRoleSwitchIndexPreflight({
      state: state(),
      plan: plan(),
      releaseSha,
      requireFinalized: true,
    })).toThrow(/online finalization is incomplete/i);

    const result = assessRoleSwitchIndexPreflight({
      state: state({
        profilesIndex: readyIndex,
        historyIndex: readyHistoryIndex,
        invoiceIndex: readyInvoiceIndex,
      }),
      plan: plan(),
      releaseSha,
      requireFinalized: true,
      capturedAt: "2026-08-12T00:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    expect(result.online_prebuild_required).toEqual([]);
    expect(result.verification_phase).toBe("post_apply");
  });

  it("rejects a same-name invoice index with the wrong predicate", () => {
    expect(() => assessRoleSwitchIndexPreflight({
      state: state({
        invoiceIndex: {
          ...readyInvoiceIndex,
          predicate: "discount_invoice_id IS NULL",
        },
      }),
      plan: plan(),
      releaseSha,
    })).toThrow(/invalid or misplaced indexes: agent_data_inputs/i);
  });
});
