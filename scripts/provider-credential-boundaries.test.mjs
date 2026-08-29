import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const workflow = (name) =>
  readFileSync(resolve(root, ".github", "workflows", name), "utf8");
const parsedWorkflow = (name) => yaml.load(workflow(name));
const source = (path) => readFileSync(resolve(root, path), "utf8");

describe("provider credential boundaries", () => {
  it("scopes hotfix Management credentials to the exact ephemeral resolver steps", () => {
    const hotfix = parsedWorkflow("deploy-catalogue-performance-hotfix.yml");
    expect(hotfix.jobs.staging.env.SUPABASE_ACCESS_TOKEN).toBeUndefined();
    expect(hotfix.jobs.production.env.SUPABASE_ACCESS_TOKEN).toBeUndefined();
    const scoped = Object.values(hotfix.jobs).flatMap((job) =>
      (job.steps ?? []).filter((step) => Object.hasOwn(step.env ?? {}, "SUPABASE_ACCESS_TOKEN")),
    );
    expect(scoped.map((step) => step.name)).toEqual([
      "Resolve current staging public API key",
      "Mint temporary staging database login",
      "Mint temporary production database login",
    ]);
    for (const step of scoped) {
      expect(step.env).toEqual({
        SUPABASE_ACCESS_TOKEN: "${{ secrets.SUPABASE_ACCESS_TOKEN }}",
      });
    }
  });

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

  it("keeps reusable release safety secretless and live credentials in trusted provider jobs", () => {
    const releaseSafety = workflow("reusable-release-safety.yml");
    const staging = workflow("reusable-supabase-staging.yml");
    const productionDatabase = workflow("deploy-supabase-production-db.yml");
    const productionCloudflare = workflow(
      "reusable-cloudflare-production-deploy.yml",
    );

    expect(releaseSafety).toContain(
      "npm ci --ignore-scripts --prefer-offline --no-audit",
    );
    expect(releaseSafety).not.toContain("secrets.");
    expect(staging).toContain("secrets.SUPABASE_STAGING_DB_URL");
    expect(productionDatabase).toContain(
      "secrets.SUPABASE_PRODUCTION_DB_URL",
    );
    expect(productionCloudflare).toContain(
      "secrets.CLOUDFLARE_PAGES_EDIT_TOKEN",
    );
  });

  it("classifies every stage-release job as staging-scoped or unscoped", () => {
    const stageRelease = parsedWorkflow("stage-release.yml");
    const classifications = Object.fromEntries(
      Object.entries(stageRelease.jobs).map(([jobId, job]) => [
        jobId,
        job.environment ?? null,
      ]),
    );

    expect(classifications).toEqual({
      "validate-source": null,
      "capture-production-n-minus-one": "staging",
      "cloudflare-staging-preflight": "staging",
      "supabase-staging": null,
      "staging-n-minus-one-compatibility": "staging",
      "cloudflare-staging": "staging",
      "staging-business-proofs": "staging",
      "staging-stripe-payment": "staging",
      "staging-live-security": "staging",
      "staging-catalogue-performance": "staging",
      "release-candidate-attested": "staging",
    });
  });

  it("applies staging scope inside the reusable Supabase consumer", () => {
    const stageRelease = parsedWorkflow("stage-release.yml");
    const reusableSupabase = parsedWorkflow("reusable-supabase-staging.yml");
    const caller = stageRelease.jobs["supabase-staging"];
    const consumer = reusableSupabase.jobs["deploy-supabase-staging"];

    expect(caller.uses).toBe(
      "./.github/workflows/reusable-supabase-staging.yml",
    );
    expect(caller.environment).toBeUndefined();
    expect(consumer.environment).toBe("staging");
    expect(Object.keys(reusableSupabase.jobs)).toEqual([
      "deploy-supabase-staging",
    ]);
    expect(Object.keys(caller.secrets).sort()).toEqual([
      "RELEASE_EVIDENCE_SIGNING_KEY",
      "STAGING_SUPABASE_PROJECT_ID",
      "STAGING_SUPABASE_PUBLISHABLE_KEY",
      "STAGING_SUPABASE_URL",
      "SUPABASE_ACCESS_TOKEN",
      "SUPABASE_STAGING_DB_URL",
    ]);
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

  it("verifies Stripe account identity before every non-webhook billing path", () => {
    const billingPaths = [
      "supabase/functions/apply-data-input-credit/index.ts",
      "supabase/functions/check-subscription/index.ts",
      "supabase/functions/create-checkout/index.ts",
      "supabase/functions/create-investor-payment/index.ts",
      "supabase/functions/create-stripe-price/index.ts",
      "supabase/functions/customer-portal/index.ts",
      "supabase/functions/delete-account/index.ts",
      "supabase/functions/get-invoices/index.ts",
      "supabase/functions/log-role-switch/index.ts",
      "supabase/functions/reconcile-role-switch-billing/index.ts",
      "supabase/functions/sync-stripe-pricing/index.ts",
    ];

    for (const path of billingPaths) {
      const billingSource = source(path);
      expect(billingSource, path).toContain("createVerifiedStripeClient");
      expect(billingSource, path).not.toMatch(/\bcreateStripeClient\(/);
    }
  });
});
