import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const workflow = (name) =>
  readFileSync(resolve(root, ".github", "workflows", name), "utf8");
const parsedWorkflow = (name) => yaml.load(workflow(name));

describe("provider credential boundaries", () => {
  it("keeps the scheduled live smoke unauthenticated and read-only", () => {
    const source = workflow("live-operational-smoke.yml");

    expect(source).not.toContain("actions/checkout@");
    expect(source).not.toContain("secrets.");
    expect(source).not.toMatch(/method:\s*["']?(?:POST|PUT|PATCH|DELETE)/i);
    expect(source).toContain('method: "HEAD"');
    expect(source).toContain('method: "GET"');
  });

  it("keeps standalone staging scale mutations fail-closed", () => {
    const source = workflow("staging-scale-proof.yml");

    expect(source).not.toContain("secrets.");
    expect(source).not.toContain("actions/checkout@");
    expect(source).toContain("Reject standalone staging mutations");
    expect(source).toMatch(/exit 1/);
  });

  it("runs live release-safety probes only for trusted main pushes", () => {
    const parsed = parsedWorkflow("reusable-release-safety.yml");
    const source = workflow("reusable-release-safety.yml");
    const liveSteps = parsed.jobs["release-safety"].steps.filter((step) =>
      JSON.stringify(step.env ?? {}).includes("secrets."),
    );

    expect(source).toContain(
      "npm ci --ignore-scripts --prefer-offline --no-audit",
    );
    expect(liveSteps.length).toBeGreaterThan(0);
    for (const step of liveSteps) {
      expect(step.if, step.name).toBe(
        "github.event_name == 'push' && github.ref == 'refs/heads/main'",
      );
    }
  });

  it("binds the weekly Supabase advisor report to the current main SHA", () => {
    const parsed = parsedWorkflow("supabase-advisor-report.yml");
    const source = workflow("supabase-advisor-report.yml");
    const verify = parsed.jobs["verify-current-main"];
    const report = parsed.jobs["advisor-report"];
    const checkout = report.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
    const capture = report.steps.find(
      (step) => step.name === "Capture Supabase evidence from current main",
    );

    expect(verify).toBeDefined();
    expect(verify.env).toEqual({ GH_TOKEN: "${{ github.token }}" });
    expect(report.needs).toBe("verify-current-main");
    expect(report.env).toBeUndefined();
    expect(checkout.with.ref).toBe(
      "${{ needs.verify-current-main.outputs.main_sha }}",
    );
    expect(checkout.with["persist-credentials"]).toBe(false);
    expect(source).toContain(
      "npm ci --ignore-scripts --prefer-offline --no-audit",
    );
    expect(capture.env.GH_TOKEN).toBe("${{ github.token }}");
    expect(capture.env.SUPABASE_ACCESS_TOKEN).toBe(
      "${{ secrets.SUPABASE_ACCESS_TOKEN }}",
    );
    expect(capture.run).toContain("assert_current_main");
    expect(capture.run.match(/assert_current_main/g)).toHaveLength(3);
  });
});
