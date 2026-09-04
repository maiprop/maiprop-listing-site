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
    const step = workflow.jobs["staging-stripe-payment"].steps.find(
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
  });

  it("seeds guarded auction fixtures before the live catalogue proof and always cleans them afterward", () => {
    const steps = workflow.jobs["staging-catalogue-performance"].steps;
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
    expect(seedIndex).toBeGreaterThan(-1);
    expect(seedIndex).toBeLessThan(proofIndex);
    expect(cleanupIndex).toBeGreaterThan(proofIndex);
    expect(steps[seedIndex].run).toContain(
      "scripts/staging-auction-fixtures.mjs seed",
    );
    expect(steps[cleanupIndex].if).toBe("always()");
    expect(steps[cleanupIndex].run).toContain(
      "scripts/staging-auction-fixtures.mjs cleanup",
    );
  });
});
