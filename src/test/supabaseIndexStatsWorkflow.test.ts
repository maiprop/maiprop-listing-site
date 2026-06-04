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
});
