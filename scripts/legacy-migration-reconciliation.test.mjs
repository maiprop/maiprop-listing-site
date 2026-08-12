import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  canonicalSqlFileSha256,
  reconcileMigrationHistories,
  validateLegacyMigrationSchemaEvidence,
} from "./legacy-migration-reconciliation.mjs";

const sha = (character) => character.repeat(64);
const CUTOVER_VERSION = "20260812023000";
const CUTOVER_NAME = "reconcile_legacy_migration_effects";

const LEGACY = [
  ["20260418120000", "invitation_requests_extended", "admin_audit_log", false],
  ["20260529000000", "featured_ads_expiry", "firesale_interest_queue", false],
  [
    "20260602032000",
    "index_remaining_foreign_keys",
    "index_remaining_foreign_keys",
    true,
  ],
  [
    "20260602033000",
    "restrict_plan_limit_helper_rpcs",
    "restrict_plan_limit_helper_rpcs",
    true,
  ],
  [
    "20260602034000",
    "restrict_agent_data_input_submit_rpcs",
    "service_role_switch_audit_rpc",
    true,
  ],
  [
    "20260602035000",
    "restrict_professional_review_helper_rpc",
    "restrict_professional_review_helper_rpc",
    true,
  ],
  [
    "20260602036000",
    "restrict_unused_public_role_group_helpers",
    "restrict_unused_public_role_group_helpers",
    true,
  ],
  [
    "20260602037000",
    "add_service_role_switch_audit_rpc",
    "add_service_role_switch_audit_rpc",
    true,
  ],
  [
    "20260602038000",
    "restrict_legacy_role_switch_audit_rpc",
    "restrict_legacy_role_switch_audit_rpc",
    true,
  ],
  [
    "20260602039000",
    "add_service_ai_quota_reservation_rpc",
    "add_service_ai_quota_reservation_rpc",
    true,
  ],
  [
    "20260602040000",
    "restrict_legacy_reserve_ai_quota_rpc",
    "restrict_legacy_reserve_ai_quota_rpc",
    true,
  ],
];

function fixture() {
  const prefix = {
    version: "20260301000000",
    name: "ordinary_history",
    file_sha256: sha("1"),
    statements_sha256: sha("2"),
    statement_count: 2,
    statement_marker_only: false,
  };
  const canonical = LEGACY.map(([version, , name], index) => ({
    version,
    name,
    file_sha256: sha(((index + 3) % 10).toString()),
    statements_sha256: sha(((index + 4) % 10).toString()),
    statement_count: index + 2,
    statement_marker_only: false,
  }));
  const cutover = {
    version: CUTOVER_VERSION,
    name: CUTOVER_NAME,
    file_sha256: sha("a"),
    statements_sha256: sha("b"),
    statement_count: 4,
    statement_marker_only: false,
  };
  const after = {
    version: "20260812024000",
    name: "post_cutover_change",
    file_sha256: sha("c"),
    statements_sha256: sha("d"),
    statement_count: 3,
    statement_marker_only: false,
  };
  const staging = [prefix, ...canonical, cutover, after];
  const candidate = staging.map(
    ({
      statements_sha256: _digest,
      statement_count: _count,
      statement_marker_only: _marker,
      ...record
    }) => record,
  );
  const production = [
    {
      ...prefix,
      statements_sha256: sha("f"),
      statement_count: 1,
    },
    ...canonical.map((record, index) => ({
      version: record.version,
      name: LEGACY[index][1],
      statements_sha256: sha(((index + 5) % 10).toString()),
      statement_count: LEGACY[index][3] ? 1 : index + 5,
      statement_marker_only: LEGACY[index][3],
    })),
  ];
  const manifest = {
    schema_version: 1,
    evidence_type: "maiprop-legacy-migration-history-reconciliation",
    reconciliation_id: "production-history-v1",
    file_digest_canonicalization: "utf8-lf",
    production_project_ref: "qvvicunqcrwpioqnvzxf",
    staging_project_ref: "xsiehskfgeoqyazcgauv",
    cutover: {
      version: cutover.version,
      name: cutover.name,
      file_sha256: cutover.file_sha256,
    },
    anomalies: canonical.map((record, index) => ({
      version: record.version,
      production: {
        name: LEGACY[index][1],
        statements_sha256: production[index + 1].statements_sha256,
        statement_count: production[index + 1].statement_count,
        statement_marker_only: production[index + 1].statement_marker_only,
      },
      canonical: {
        name: record.name,
        file_sha256: record.file_sha256,
        statements_sha256: record.statements_sha256,
        statement_count: record.statement_count,
        statement_marker_only: false,
      },
    })),
  };
  return { candidate, staging, production, manifest, cutover, after };
}

describe("legacy migration history reconciliation", () => {
  it("uses the same canonical SQL digest for LF and CRLF checkouts", () => {
    const lf = "SELECT 1;\nSELECT 2;\n";
    const crlf = lf.replace(/\n/g, "\r\n");

    expect(canonicalSqlFileSha256(crlf)).toBe(canonicalSqlFileSha256(lf));
  });

  it("binds the checked-in manifest to the canonical SQL and forward cutover", () => {
    const manifest = JSON.parse(
      readFileSync(
        "supabase/reconciliation/production-history-v1.json",
        "utf8",
      ),
    );
    const fileDigest = (path) =>
      canonicalSqlFileSha256(readFileSync(path, "utf8"));
    const staging = manifest.anomalies.map(({ version, canonical }) => ({
      version,
      ...canonical,
    }));
    staging.push({
      ...manifest.cutover,
      statements_sha256: sha("e"),
      statement_count: 1,
      statement_marker_only: false,
    });
    const candidate = staging.map(
      ({
        statements_sha256: _statements,
        statement_count: _count,
        statement_marker_only: _marker,
        ...record
      }) => record,
    );
    const production = manifest.anomalies.map(
      ({ version, production: evidence }) => ({
        version,
        ...evidence,
      }),
    );

    for (const record of candidate) {
      expect(
        fileDigest(`supabase/migrations/${record.version}_${record.name}.sql`),
      ).toBe(record.file_sha256);
    }
    expect(
      reconcileMigrationHistories({
        candidate,
        staging,
        production,
        manifest,
      }),
    ).toMatchObject({
      reconciliation_id: "production-history-v1",
      legacy_anomaly_count: LEGACY.length,
      cutover_applied: false,
      pending_files: [
        `${manifest.cutover.version}_${manifest.cutover.name}.sql`,
      ],
    });
  });

  it("accepts only the fixed legacy anomalies and keeps the cutover pending", () => {
    const value = fixture();

    expect(reconcileMigrationHistories(value)).toMatchObject({
      reconciliation_id: "production-history-v1",
      legacy_anomaly_count: LEGACY.length,
      cutover_applied: false,
      pending_files: [
        `${CUTOVER_VERSION}_${CUTOVER_NAME}.sql`,
        "20260812024000_post_cutover_change.sql",
      ],
    });
  });

  it("accepts exact execution fingerprints after the cutover is applied", () => {
    const value = fixture();
    value.production.push(
      ...value.staging
        .slice(value.production.length)
        .map(({ file_sha256: _file, ...record }) => record),
    );

    expect(reconcileMigrationHistories(value)).toMatchObject({
      cutover_applied: true,
      pending_files: [],
    });
  });

  it("rejects any filename-only marker outside the fixed anomaly set", () => {
    const value = fixture();
    value.production[0].statement_marker_only = true;

    expect(() => reconcileMigrationHistories(value)).toThrow(
      /unapproved filename-only/i,
    );
  });

  it("rejects modified legacy evidence and new version-name aliases", () => {
    const changedDigest = fixture();
    changedDigest.production[3].statements_sha256 = sha("e");
    expect(() => reconcileMigrationHistories(changedDigest)).toThrow(
      /legacy anomaly evidence/i,
    );

    const changedName = fixture();
    changedName.production[1].name = "another_alias";
    expect(() => reconcileMigrationHistories(changedName)).toThrow(
      /legacy anomaly evidence/i,
    );
  });

  it("rejects execution drift at or after the cutover", () => {
    const value = fixture();
    value.production.push({
      version: value.cutover.version,
      name: value.cutover.name,
      statements_sha256: sha("e"),
      statement_count: value.cutover.statement_count,
      statement_marker_only: false,
    });

    expect(() => reconcileMigrationHistories(value)).toThrow(
      /post-cutover executed SQL fingerprint/i,
    );
  });

  it("requires the immutable complete anomaly manifest", () => {
    const value = fixture();
    value.manifest.anomalies.pop();

    expect(() => reconcileMigrationHistories(value)).toThrow(
      /exact legacy anomaly set/i,
    );
  });
});

describe("legacy migration schema evidence", () => {
  it("requires every deterministic postcondition check to pass", () => {
    const evidence = {
      schema_version: 1,
      evidence_type: "maiprop-legacy-migration-schema-evidence",
      reconciliation_id: "production-history-v1",
      ok: true,
      checks: [
        {
          name: "admin_audit_log",
          ok: true,
          fingerprint: `sha256:${sha("1")}`,
        },
        {
          name: "service_rpc_grants",
          ok: true,
          fingerprint: `sha256:${sha("2")}`,
        },
      ],
    };

    expect(validateLegacyMigrationSchemaEvidence(evidence)).toEqual(evidence);
    expect(() =>
      validateLegacyMigrationSchemaEvidence({
        ...evidence,
        checks: [evidence.checks[0], { ...evidence.checks[1], ok: false }],
      }),
    ).toThrow(/failed schema check/i);
    expect(() =>
      validateLegacyMigrationSchemaEvidence({
        ...evidence,
        checks: [{ ...evidence.checks[0], fingerprint: sha("1") }],
      }),
    ).toThrow(/schema fingerprint is invalid/i);
  });

  it("accepts namespaced dotted schema check names", () => {
    const evidence = {
      schema_version: 1,
      evidence_type: "maiprop-legacy-migration-schema-evidence",
      reconciliation_id: "production-history-v1",
      ok: true,
      checks: [
        {
          name: "function.public.get_listing_limit",
          ok: true,
          fingerprint: `sha256:${sha("1")}`,
        },
        {
          name: "policy.public.agent_data_inputs_insert_blocked",
          ok: true,
          fingerprint: `sha256:${sha("2")}`,
        },
      ],
    };

    expect(validateLegacyMigrationSchemaEvidence(evidence)).toEqual(evidence);
  });

  it("reapplies every canonical function body that differs before cutover", () => {
    const migration = readFileSync(
      "supabase/migrations/20260812102342_reconcile_legacy_migration_effects.sql",
      "utf8",
    );
    const canonicalFunctions = [
      "can_review_professional",
      "check_listing_quota",
      "get_agent_monthly_input_count",
      "get_auction_alert_limit",
      "get_auction_listing_visible_limit",
      "get_contact_monthly_limit",
      "get_listing_limit",
      "get_open_house_rsvp_monthly_limit",
      "get_professionals_per_category_limit",
      "get_saved_search_limit",
      "get_search_alert_limit",
      "get_valuation_monthly_limit",
      "has_buy_side_role",
      "has_sell_side_role",
      "reserve_ai_quota_for_user",
      "submit_agent_data_input",
    ];

    for (const functionName of canonicalFunctions) {
      expect(migration).toContain(
        `CREATE OR REPLACE FUNCTION public.${functionName}`,
      );
    }
    expect(migration).toContain(
      "DROP FUNCTION IF EXISTS public.submit_agent_data_input(",
    );
  });
});
