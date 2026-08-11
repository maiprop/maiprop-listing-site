import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const workflowPath = resolve(
  ".github/workflows/verify-stripe-live-readiness.yml",
);
const checkerPath = resolve("scripts/check-stripe-live-migration.mjs");

describe("Stripe live readiness producer workflow", () => {
  it("produces an exact-SHA attempt-one HMAC-bound read-only artifact", () => {
    expect(existsSync(workflowPath), "Stripe readiness workflow is missing").toBe(true);
    const source = readFileSync(workflowPath, "utf8");
    const parsed = yaml.load(source);
    const job = parsed.jobs["verify-stripe-readiness"];

    expect(Object.keys(parsed.on)).toEqual(["workflow_dispatch"]);
    expect(parsed.on.workflow_dispatch.inputs.release_sha).toMatchObject({
      required: true,
      type: "string",
    });
    expect(parsed.permissions).toEqual({ actions: "read", contents: "read" });
    expect(job.name).toBe("Verify exact-SHA Stripe live catalogue");
    expect(job.permissions).toEqual({ actions: "read", contents: "read" });
    expect(source).toContain("github.ref != 'refs/heads/main'");
    expect(source).toContain("github.run_attempt != 1");
    expect(source).toContain("github.actor != github.triggering_actor");
    expect(source).toContain("^[0-9a-f]{40}$");
    expect(source).toContain("repos/${GITHUB_REPOSITORY}/branches/main");
    expect(source).toContain('ACTUAL_SHA="$(git rev-parse HEAD)"');
    expect(source).toContain("STRIPE_RESTRICTED_KEY: ${{ secrets.STRIPE_RESTRICTED_KEY }}");
    expect(source).toContain("VITE_SUPABASE_PUBLISHABLE_KEY");
    expect(source).toContain("scripts/check-stripe-live-migration.mjs --evidence-json");
    expect(source).toContain("scripts/verify-stripe-live-migration-evidence.mjs");
    expect(source).toContain(
      "stripe-live-readiness-${{ inputs.release_sha }}-${{ github.run_id }}-${{ github.run_attempt }}",
    );
    expect(source).toContain("scripts/create-release-artifact-binding.mjs");
    expect(source).toContain("scripts/verify-release-artifact-binding.mjs");
    expect(source).toContain("--same-run");
    expect(source).toContain("-binding");
    expect(source).not.toContain("STRIPE_SECRET_KEY: ${{ secrets.");
    expect(source).not.toMatch(/stripe\s+products\s+create|stripe\s+prices\s+create/i);
    expect(source).not.toMatch(/curl[^\n]+(?:-X|--request)\s+(?:POST|PUT|PATCH|DELETE)/i);
  });

  it("keeps provider verification read-only and unprivileged", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    const checker = readFileSync(checkerPath, "utf8");

    expect(checker).not.toMatch(/\bmethod\s*:/);
    expect(checker).toContain("VITE_SUPABASE_PUBLISHABLE_KEY");
    expect(checker).toContain("is forbidden for the read-only Stripe readiness producer");
    expect(workflow).not.toMatch(/SUPABASE_(?:SERVICE_ROLE|SECRET)_KEY|SB_SERVICE_ROLE_KEY/);
    expect(workflow).not.toMatch(/STRIPE_(?:SECRET|API|READ_ONLY)_KEY/);
  });
});
