import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const workflow = yaml.load(
  readFileSync(
    resolve(process.cwd(), ".github/workflows/stage-release.yml"),
    "utf8",
  ),
);

describe("stage release Stripe and auction proof wiring", () => {
  it("selects exactly the intended described Stripe payment test", () => {
    const stripeSteps = workflow.jobs["staging-stripe-payment"].steps;
    const attestationStep = workflow.jobs["cloudflare-staging"].steps.find(
      (candidate) => candidate.name === "Create Cloudflare staging attestation",
    );
    const downloadStep = stripeSteps.find(
      (candidate) =>
        candidate.name === "Download exact Cloudflare staging attestation",
    );
    const step = stripeSteps.find(
      (candidate) =>
        candidate.name ===
        "Complete one Stripe test-mode subscription and cleanup",
    );
    const grep = /--grep '([^']+)'/.exec(step.run)?.[1];
    const fullTitles = [
      "Stripe test payment completion completes test-card subscription checkout and observes synced entitlement",
      "Stripe test payment completion completes test-card monthly subscription checkout via create-checkout",
      "Stripe test payment completion declined test-card add-on checkout does not deliver credits",
    ];
    expect(grep).toBeTruthy();
    expect(fullTitles.filter((title) => new RegExp(grep).test(title))).toEqual([
      fullTitles[0],
    ]);
    expect(step.run).toContain("VITE_STRIPE_PRICE_PARTICIPANT_MONTHLY");
    expect(step.run).toContain("staging_release_fixture: true");
    expect(step.run).toContain("trap cleanup_stripe_fixture EXIT");
    expect(step.run).toContain("metadata=cs.%7B%22staging_release_fixture%22%3Atrue%7D");
    expect(step.run).toContain("stripe_price_binding_sha256");
    expect(step.run).toContain("monthly_price_sha256");
    expect(step.run).toContain("--retry-all-errors --request DELETE");
    expect(step.run).toContain("Temporary staging Stripe pricing fixture cleanup could not be verified");
    expect(step.run).not.toContain(">/dev/null || true");
    expect(step.env.STAGING_CF_READ_TOKEN).toBeTruthy();
    expect(downloadStep.with.name).toContain(
      "needs.cloudflare-staging.outputs.attestation_artifact",
    );
    expect(attestationStep.run).toContain(
      "stripe_price_binding_sha256",
    );
    expect(attestationStep.run).toContain(
      "VITE_STRIPE_PRICE_PARTICIPANT_MONTHLY",
    );
  });

  it("seeds guarded auction fixtures before the live catalogue proof and always cleans them afterward", () => {
    const steps = workflow.jobs["staging-catalogue-performance"].steps;
    const resolveIndex = steps.findIndex(
      (step) => step.name === "Resolve IPv4 staging auction database endpoint",
    );
    const seedIndex = steps.findIndex(
      (step) => step.name === "Seed exact-SHA staging auction proof fixtures",
    );
    const proofIndex = steps.findIndex(
      (step) => step.name === "Run endpoint, route, CWV, and query proofs",
    );
    const cleanupIndex = steps.findIndex(
      (step) =>
        step.name === "Cleanup exact-SHA staging auction proof fixtures",
    );
    expect(resolveIndex).toBeGreaterThan(-1);
    expect(resolveIndex).toBeLessThan(seedIndex);
    expect(steps[resolveIndex].run).toContain(
      "SUPABASE_STAGING_EFFECTIVE_DB_URL",
    );
    expect(steps[resolveIndex].run).toContain(
      "scripts/assert-staging-mutation-target.mjs",
    );
    expect(steps[resolveIndex].run).toContain(".pooler.supabase.com");
    expect(steps[resolveIndex].env.SUPABASE_ACCESS_TOKEN).toBeTruthy();
    expect(seedIndex).toBeGreaterThan(-1);
    expect(seedIndex).toBeLessThan(proofIndex);
    expect(cleanupIndex).toBeGreaterThan(proofIndex);
    expect(steps[seedIndex].run).toContain(
      "scripts/staging-auction-fixtures.mjs seed",
    );
    expect(steps[seedIndex].env.SUPABASE_STAGING_DB_URL).toBeUndefined();
    expect(steps[cleanupIndex].if).toBe("always()");
    expect(steps[cleanupIndex].run).toContain(
      "scripts/staging-auction-fixtures.mjs cleanup",
    );
    expect(steps[cleanupIndex].env.SUPABASE_STAGING_DB_URL).toBeUndefined();
  });
});
