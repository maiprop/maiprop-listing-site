import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = resolve(process.cwd(), "supabase/migrations");
const migrationFiles = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
const cutoverFloor = "20260811231659";

const retiredUnappliedFiles = [
  "20260805175433_enforce_role_switch_audit_integrity.sql",
  "20260805175434_finalize_role_switch_audit_integrity.sql",
  "20260806155517_reconcile_agent_data_input_invoice_credits.sql",
  "20260811231659_reconcile_legacy_migration_effects.sql",
];

const replacementSuffixes = [
  "enforce_role_switch_audit_integrity.sql",
  "finalize_role_switch_audit_integrity.sql",
  "reconcile_agent_data_input_invoice_credits.sql",
  "reconcile_legacy_migration_effects.sql",
];

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sha256Lf(path: string) {
  const normalized = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalized).digest("hex");
}

function replacement(suffix: string) {
  const matches = migrationFiles.filter((name) => name.endsWith(suffix));
  expect(matches, suffix).toHaveLength(1);
  const [name] = matches;
  expect(BigInt(name.slice(0, 14))).toBeGreaterThan(BigInt(cutoverFloor));
  return name;
}

describe("ECAS migration identity", () => {
  it("reissues unapplied ECAS migrations without rewriting migration history", () => {
    for (const name of retiredUnappliedFiles) {
      expect(migrationFiles).not.toContain(name);
    }
    for (const suffix of replacementSuffixes) {
      replacement(suffix);
    }
  });

  it("binds the legacy reconciliation manifest to the exact replacement", () => {
    const name = replacement("reconcile_legacy_migration_effects.sql");
    const manifest = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "supabase/reconciliation/production-history-v1.json"),
        "utf8",
      ),
    ) as {
      cutover: { version: string; name: string; file_sha256: string };
    };

    expect(manifest.cutover).toEqual({
      version: name.slice(0, 14),
      name: name.slice(15, -4),
      file_sha256: sha256(resolve(migrationsDir, name)),
    });
  });

  it("keeps the previously committed catalogue migration byte-identical", () => {
    expect(
      sha256Lf(
        resolve(
          migrationsDir,
          "20260728123058_materialize_public_catalogue_snapshots.sql",
        ),
      ),
    ).toBe("3faf0f0f40ba318ce071de48828bf514d3d9b4e5f2dde403f3b0e77d3816e369");
  });
});
