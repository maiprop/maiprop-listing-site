import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkEcasHardeningContracts,
  checkModuleSizeBudget,
  checkSensitiveMutationBoundaries,
} from "./check-ecas-hardening-contracts.mjs";

const makeFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "maiprop-ecas-hardening-"));
  for (const dir of ["docs/governance", "docs/performance", "src/hooks", "src/pages"]) {
    mkdirSync(join(root, dir), { recursive: true });
  }

  writeFileSync(
    join(root, "docs", "governance", "module-size-budget.json"),
    JSON.stringify({
      version: 1,
      defaultMaxBytes: 35000,
      generatedExemptions: [],
      legacyExceptions: [{
        path: "src/pages/LargePage.tsx",
        allowedMaxBytes: 50000,
        owner: "app-web",
        targetPackage: "apps/web",
        refactorStrategy: "Split route sections.",
        reviewBy: "2026-07-31",
      }],
    }),
  );
  writeFileSync(join(root, "src", "pages", "LargePage.tsx"), "x".repeat(40000));
  writeFileSync(join(root, "src", "pages", "SmallPage.tsx"), "export const ok = true;\n");
  writeFileSync(
    join(root, "docs", "governance", "sensitive-mutation-boundaries.json"),
    JSON.stringify({
      version: 1,
      blockedDirectTables: ["pricing_configs", "organization_memberships"],
      allowedBrowserMutations: [{
        file: "src/hooks/useSavedSearches.ts",
        table: "saved_searches",
        operations: ["insert"],
        boundary: "rls-scoped-browser",
        owner: "data-access",
        rationale: "User-owned saved search rows are scoped by user_id.",
      }],
    }),
  );
  writeFileSync(
    join(root, "src", "hooks", "useSavedSearches.ts"),
    "supabase.from('saved_searches').insert(payload);\n",
  );
  writeFileSync(
    join(root, "docs", "governance", "LIVE_GITHUB_ADMIN_SETTINGS.md"),
    [
      "allowed_actions: selected",
      "sha_pinning_required: true",
      "patterns_allowed",
      "Branch protection API result: blocked",
      "Upgrade to GitHub Pro or make this repository public",
      "Environment approvals: pending repository admin",
      "Push protection: pending repository admin",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "docs", "performance", "LOAD_TEST_PROOF.md"),
    [
      "ECAS_LOAD_PROFILE=baseline_100",
      "ECAS_LOAD_PROFILE=growth_10x",
      "LOAD_TEST_APPROVED_PRODUCTION=true",
      "load-test-summary.json",
      "approved time window",
    ].join("\n"),
  );
  return root;
};

describe("ECAS hardening contracts", () => {
  it("accepts a fixture with module budgets, mutation inventory, and live-admin evidence", () => {
    const result = checkEcasHardeningContracts(makeFixture());

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails when an oversized module has no budget entry", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "docs", "governance", "module-size-budget.json"),
      JSON.stringify({ version: 1, defaultMaxBytes: 35000, generatedExemptions: [], legacyExceptions: [] }),
    );

    const result = checkModuleSizeBudget(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("src/pages/LargePage.tsx");
  });

  it("fails when a browser mutation touches a blocked table", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "src", "hooks", "useSavedSearches.ts"),
      "supabase.from('pricing_configs').upsert(payload);\n",
    );

    const result = checkSensitiveMutationBoundaries(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("blocked table pricing_configs");
  });
});
