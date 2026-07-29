import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const productionWorkflow = readFileSync(".github/workflows/deploy-supabase-production-db.yml", "utf8");
const stagingWorkflow = readFileSync(".github/workflows/reusable-supabase-staging.yml", "utf8");

describe("production DB advisor workflow", () => {
  it("keeps production disabled while making staging migrations pass the hard advisor gate", () => {
    const applyStep = stagingWorkflow.indexOf("- name: Apply database migrations to staging");
    const postApplyStats = stagingWorkflow.indexOf("- name: Capture staging Supabase index stats");
    const postApplyAdvisor = stagingWorkflow.indexOf("- name: Check staging Supabase advisors");

    expect(productionWorkflow).toContain("Production database deployment disabled");
    expect(productionWorkflow).toContain("Production database mutations are disabled");
    expect(productionWorkflow).toContain("if: ${{ false }}");
    expect(applyStep).toBeGreaterThan(-1);
    expect(postApplyStats).toBeGreaterThan(applyStep);
    expect(postApplyAdvisor).toBeGreaterThan(postApplyStats);
    expect(stagingWorkflow).toContain("node scripts/assert-staging-mutation-target.mjs");
    expect(stagingWorkflow).toContain("npm run check:supabase-advisor -- --fail-on-error --fail-on-unknown");
  });
});
