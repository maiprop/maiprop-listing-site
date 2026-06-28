import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationNames = () =>
  new Set(readdirSync(resolve(process.cwd(), "supabase/migrations")));

describe("Supabase production migration history compatibility", () => {
  it("keeps local migration versions aligned with production-applied history", () => {
    const names = migrationNames();

    const productionAppliedVersions = [
      "20260614083852_split_project_select_policy.sql",
      "20260614091438_add_open_house_transaction_type.sql",
      "20260614145537_revoke_future_public_default_grants.sql",
      "20260614145554_dedupe_project_select_policies.sql",
      "20260628193711_reconcile_remote_migration_history.sql",
      "20260628203708_reconcile_remote_migration_history.sql",
    ];

    const staleLocalAliases = [
      "20260614083000_split_project_select_policy.sql",
      "20260614090000_add_open_house_transaction_type.sql",
      "20260614153000_revoke_future_public_default_grants.sql",
      "20260614154000_dedupe_project_select_policies.sql",
    ];

    for (const version of productionAppliedVersions) {
      expect(names.has(version), `${version} must exist locally`).toBe(true);
    }

    for (const alias of staleLocalAliases) {
      expect(names.has(alias), `${alias} must not replace the production-applied version`).toBe(false);
    }
  });

  it("keeps remote-only reconciliation migrations schema-free", () => {
    const reconciliationMigrations = [
      "20260628193711_reconcile_remote_migration_history.sql",
      "20260628203708_reconcile_remote_migration_history.sql",
    ];

    for (const migration of reconciliationMigrations) {
      const sql = readFileSync(resolve(process.cwd(), "supabase/migrations", migration), "utf8");
      const executableSql = sql
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*--.*$/gm, "")
        .trim();

      expect(executableSql, `${migration} should only reconcile Supabase migration history`).toBe("");
    }
  });
});
