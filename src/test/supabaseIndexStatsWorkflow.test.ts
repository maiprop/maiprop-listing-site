import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const releaseSafetyWorkflow = readFileSync(
  ".github/workflows/reusable-release-safety.yml",
  "utf8",
);

const advisorReportWorkflow = readFileSync(
  ".github/workflows/supabase-advisor-report.yml",
  "utf8",
);

const advisorScript = readFileSync(
  "scripts/check-supabase-advisor.mjs",
  "utf8",
);

describe("Supabase index stats workflow wiring", () => {
  it("passes a direct production DB URL to clean-checkout index-stat captures", () => {
    for (const workflow of [releaseSafetyWorkflow, advisorReportWorkflow]) {
      expect(workflow).toContain(
        "SUPABASE_PRODUCTION_DB_URL: ${{ secrets.SUPABASE_PRODUCTION_DB_URL }}",
      );
      expect(workflow).toContain(
        "SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}",
      );
      expect(workflow).toContain(
        "npm run capture:supabase-index-stats -- --out",
      );
      expect(workflow).toContain(
        "--allow-empty-when-unconfigured",
      );
    }
  });

  it("allows transient advisor unavailability only in release-safety inventory", () => {
    expect(releaseSafetyWorkflow).toContain("--allow-transient-unavailable");
    expect(advisorReportWorkflow).not.toContain("--allow-transient-unavailable");
  });

  it("records transient Supabase advisor timeouts without weakening real advisor debt gates", () => {
    expect(advisorScript).toContain("allowTransientUnavailable");
    expect(advisorScript).toContain("function isTransientAdvisorFailure");
    expect(advisorScript).toContain("status === 544");
    expect(advisorScript).toContain("transient_advisor_unavailable");
    expect(advisorScript).toContain("throw new Error");
    expect(advisorScript).toContain("failOnError && failingLintCount > 0");
    expect(advisorScript).toContain("assertAdvisorDebtIsActionable(advisorDebt)");
  });
});
