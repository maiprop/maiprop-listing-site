import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/compliance-evidence.yml"), "utf8");

const step = (name, nextName) => {
  const start = workflow.indexOf(`      - name: ${name}`);
  const end = nextName ? workflow.indexOf(`      - name: ${nextName}`, start + 1) : workflow.length;
  return workflow.slice(start, end);
};

describe("standards evidence workflow", () => {
  it("captures each provider independently before the strict rollup", () => {
    expect(step("Capture Supabase live security evidence", "Capture Sentry live telemetry status")).toContain(
      "continue-on-error: true",
    );
    expect(step("Capture Sentry live telemetry status", "Capture Cloudflare admin posture")).toContain(
      "continue-on-error: true",
    );
    expect(step("Capture Cloudflare admin posture", "Check ECAS live evidence rollup")).toContain(
      "continue-on-error: true",
    );
    expect(step("Check ECAS live evidence rollup", "Upload standards evidence")).toContain("if: always()");
    expect(step("Upload standards evidence", null)).toContain("if: always()");
  });
});
