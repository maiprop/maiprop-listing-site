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
  it("resolves a distinct revealed staging service key for storage cleanup", () => {
    const step = workflow.jobs["staging-business-proofs"].steps.find(
      (candidate) => candidate.name === "Run staged storage cleanup proof",
    );

    expect(step.run).toContain("/api-keys?reveal=true");
    expect(step.run).toContain('(.type // "") == "secret"');
    expect(step.run).toContain('(.type // "") != "publishable"');
    expect(step.run).toContain(
      'sort_by(if (.type // "") == "secret" then 0 else 1 end)',
    );
    expect(step.run).toContain(
      '[ -z "$service_role_key" ] || [ "$service_role_key" = "$STAGING_SUPABASE_ANON_KEY" ]',
    );
  });

  it("passes a distinct revealed service key to authoritative project cleanup", () => {
    const step = workflow.jobs["staging-business-proofs"].steps.find(
      (candidate) => candidate.name === "Run staged project tenant proof",
    );

    expect(step.env.SUPABASE_ACCESS_TOKEN).toBeTruthy();
    expect(step.run).toContain("/api-keys?reveal=true");
    expect(step.run).toContain('(.type // "") != "publishable"');
    expect(step.run).toContain('(.type // "") == "secret"');
    expect(step.run).toContain(
      'STAGING_SUPABASE_SERVICE_ROLE_KEY="$service_role_key"',
    );
  });

  it("passes a distinct revealed service key to the promotion entitlement proof", () => {
    const step = workflow.jobs["staging-business-proofs"].steps.find(
      (candidate) => candidate.name === "Run staged promotion entitlement proof",
    );

    expect(step.env.SUPABASE_ACCESS_TOKEN).toBeTruthy();
    expect(step.run).toContain("/api-keys?reveal=true");
    expect(step.run).toContain('(.type // "") != "publishable"');
    expect(step.run).toContain('(.type // "") == "secret"');
    expect(step.run).toContain(
      'STAGING_SUPABASE_SERVICE_ROLE_KEY="$service_role_key"',
    );
    expect(step.run).not.toContain(
      '-H "Authorization: Bearer $service_role_key"',
    );
  });

  it("selects exactly the intended described Stripe payment test", () => {
    const stripeSteps = workflow.jobs["staging-stripe-payment"].steps;
    const attestationStep = workflow.jobs["cloudflare-staging"].steps.find(
      (candidate) => candidate.name === "Create Cloudflare staging attestation",
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
    expect(step.run).toContain("staging_catalog_initialized_by_stage_release");
    expect(step.run).toContain("/functions/v1/create-stripe-price");
    expect(step.run).toContain('then .[0].id else empty end');
    expect(step.run).toContain("grant_type=password");
    expect(step.run).toContain("role == \"admin\"");
    expect(step.run).not.toContain("is_platform_admin");
    expect(step.run).toContain("repair_marked_catalog=true");
    expect(step.run).toContain('.metadata.staging_catalog_initialized_by_stage_release == true');
    expect(step.run).toContain('if [ "$repair_marked_catalog" = "true" ]');
    expect(step.run).toContain("Existing unmarked staging pro catalog is not checkout-ready and was not overwritten");
    expect(step.run).toContain(".metadata.stripe_product_id == $created[0].product_id");
    expect(step.run).toContain(".metadata.stripe_price_id_monthly == $created[0].price_id");
    expect(step.run).not.toContain("pricing_configs?key=eq.pro&metadata=cs.");
    expect(step.env.STAGING_ADMIN_EMAIL).toBe("${{ secrets.E2E_ADMIN_EMAIL }}");
    expect(step.env.STAGING_ADMIN_PASSWORD).toBe("${{ secrets.E2E_ADMIN_PASSWORD }}");
    expect(step.env.STRIPE_RESTRICTED_KEY).toBeUndefined();
    expect(step.run).not.toContain("VITE_STRIPE_PRICE_PARTICIPANT_MONTHLY");
    expect(step.run).toContain("/api-keys?reveal=true");
    expect(step.run).toContain('(.type // "") == "secret"');
    expect(step.run).toContain(
      'sort_by(if (.type // "") == "secret" then 0 else 1 end)',
    );
    expect(step.run).toContain(
      '[ -z "$service_role_key" ] || [ "$service_role_key" = "$STAGING_SUPABASE_PUBLISHABLE_KEY" ]',
    );
    expect(step.run).toContain('-H "apikey: $service_role_key"');
    expect(step.run).not.toContain(
      '-H "Authorization: Bearer $service_role_key"',
    );
    expect(step.run).toContain('-H "Authorization: Bearer $admin_token"');
    expect(step.run).toMatch(
      /admin_profile="\$\(curl -fsS --retry 3 \\\n\s+-H "apikey: \$STAGING_SUPABASE_PUBLISHABLE_KEY" \\\n\s+-H "Authorization: Bearer \$admin_token" \\\n\s+"\$STAGING_SUPABASE_URL\/rest\/v1\/profiles\?select=user_id,role&user_id=eq\.\$admin_user_id"\)"/,
    );
    expect(attestationStep.run).not.toContain("stripe_price_binding_sha256");
    expect(attestationStep.run).not.toContain("participantMonthlyPrice");

    const markedRowBranch = step.run.indexOf(
      ".metadata.staging_catalog_initialized_by_stage_release == true",
    );
    const markedRepairAssignment = step.run.indexOf(
      "repair_marked_catalog=true",
      markedRowBranch,
    );
    const repairBlock = step.run.indexOf(
      'if [ "$repair_marked_catalog" = "true" ]',
      markedRepairAssignment,
    );
    const deployedMutation = step.run.indexOf(
      "/functions/v1/create-stripe-price",
      repairBlock,
    );
    const finalMetadataVerification = step.run.indexOf(
      ".metadata.stripe_product_id == $created[0].product_id",
      deployedMutation,
    );
    expect(markedRowBranch).toBeGreaterThan(-1);
    expect(markedRepairAssignment).toBeGreaterThan(markedRowBranch);
    expect(repairBlock).toBeGreaterThan(markedRepairAssignment);
    expect(deployedMutation).toBeGreaterThan(repairBlock);
    expect(finalMetadataVerification).toBeGreaterThan(deployedMutation);
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
