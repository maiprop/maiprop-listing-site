import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkEcasHardeningContracts,
  checkFunctionInvocationBoundaryEvidence,
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
    join(root, "docs", "governance", "function-invocation-boundaries.json"),
    JSON.stringify({
      version: 1,
      reviewedFunctionBodies: [{
        function: "ai-search",
        boundary: "edge-schema-validated",
        owner: "domain",
        reviewBy: "2026-07-31",
        rationale: "AI search request bodies are schema-normalized by the Edge Function before provider calls.",
      }],
    }),
  );
  writeFileSync(
    join(root, "src", "hooks", "useAiSearch.ts"),
    "await supabase.functions.invoke('ai-search', { body: { query } });\n",
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
      "ECAS_LOAD_PROFILE=enterprise_soak",
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

  it("measures module budgets consistently when a Windows checkout uses CRLF", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "src", "pages", "WindowsPage.tsx"),
      "x\r\n".repeat(12_000),
    );

    const result = checkModuleSizeBudget(root);

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("rejects malformed and expired module-size exception review dates", () => {
    const malformedRoot = makeFixture();
    const malformedBudgetPath = join(
      malformedRoot,
      "docs",
      "governance",
      "module-size-budget.json",
    );
    const malformedBudget = JSON.parse(readFileSync(malformedBudgetPath, "utf8"));
    malformedBudget.legacyExceptions[0].reviewBy = "2026-02-30";
    writeFileSync(malformedBudgetPath, JSON.stringify(malformedBudget));

    const malformed = checkModuleSizeBudget(malformedRoot, {
      now: new Date("2026-07-29T12:00:00.000Z"),
    });

    expect(malformed.ok).toBe(false);
    expect(malformed.failures.join("\n")).toContain("reviewBy must be a real ISO date");

    const expiredRoot = makeFixture();
    writeFileSync(join(expiredRoot, "src", "pages", "LargePage.tsx"), "export const nowSmall = true;\n");
    const expired = checkModuleSizeBudget(expiredRoot, {
      now: new Date("2026-08-01T00:00:00.000Z"),
    });

    expect(expired.ok).toBe(false);
    expect(expired.failures.join("\n")).toContain("reviewBy 2026-07-31 has expired");
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

  it("keeps one-time trial claim ledger rows behind the service boundary", () => {
    const root = process.cwd();
    const result = checkSensitiveMutationBoundaries(root);
    const inventory = JSON.parse(
      readFileSync(join(root, "docs", "governance", "sensitive-mutation-boundaries.json"), "utf8"),
    );

    expect(inventory.blockedDirectTables).toContain("subscription_trial_claims");
    expect(result.ok).toBe(true);
  });

  it("fails when a function request body has no boundary review", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "src", "hooks", "useAiSearch.ts"),
      "await supabase.functions.invoke('unreviewed-ai', { body: { query } });\n",
    );

    const result = checkFunctionInvocationBoundaryEvidence(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("unreviewed-ai");
  });

  it("detects typed function request bodies with boundary review", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "src", "hooks", "useAiSearch.ts"),
      "await supabase.functions.invoke<SearchResponse>('ai-search', { body: { query } });\n",
    );

    const result = checkFunctionInvocationBoundaryEvidence(root);

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("detects multiline typed function request bodies with boundary review", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "src", "hooks", "useAiSearch.ts"),
      [
        "await supabase.functions.invoke<{",
        "  data: string[];",
        "  error?: string;",
        "}>('ai-search', {",
        "  body: { query },",
        "});",
      ].join("\n"),
    );

    const result = checkFunctionInvocationBoundaryEvidence(root);

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails when function boundary evidence points to a stale function", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "docs", "governance", "function-invocation-boundaries.json"),
      JSON.stringify({
        version: 1,
        reviewedFunctionBodies: [{
          function: "stale-ai",
          boundary: "edge-schema-validated",
          owner: "domain",
          reviewBy: "2026-07-31",
          rationale: "This stale entry should fail when no source invokes the reviewed function.",
        }],
      }),
    );

    const result = checkFunctionInvocationBoundaryEvidence(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("stale-ai");
  });
});
