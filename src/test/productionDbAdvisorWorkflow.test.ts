import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/deploy-supabase-production-db.yml", "utf8");

describe("production DB advisor workflow", () => {
  it("lets advisor-fix migrations apply before the hard advisor gate", () => {
    const preDryRunAdvisor = workflow.indexOf("- name: Check Supabase advisors before dry-run");
    const applyStep = workflow.indexOf("- name: Apply production migrations");
    const postApplyStats = workflow.indexOf("- name: Capture Supabase index stats after apply");
    const postApplyAdvisor = workflow.indexOf("- name: Check Supabase advisors after apply");

    expect(preDryRunAdvisor).toBeGreaterThan(-1);
    expect(workflow).toContain("if: inputs.dry_run == true");
    expect(applyStep).toBeGreaterThan(-1);
    expect(postApplyStats).toBeGreaterThan(applyStep);
    expect(postApplyAdvisor).toBeGreaterThan(postApplyStats);
    expect(workflow).toContain("if: inputs.dry_run != true");
    expect(workflow).toContain("npm run check:supabase-advisor -- --fail-on-error --fail-on-unknown");
  });
});
