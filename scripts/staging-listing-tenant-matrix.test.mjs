import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(import.meta.dirname, "staging-listing-tenant-matrix.mjs"),
  "utf8",
);

describe("staging listing tenant fixtures", () => {
  it("provisions paid organization plans through the service-controlled path", () => {
    expect(source).toContain(
      'const SERVICE_ROLE_KEY = required("STAGING_SUPABASE_SERVICE_ROLE_KEY")',
    );
    expect(source).toContain('plan: "internal"');
    expect(source).toContain("await createPaidOrganization(developerA");
    expect(source).toContain("await createPaidOrganization(developerB");
  });

  it("uses run-unique organizations and removes them after success or failure", () => {
    expect(source).toContain(
      "const organizationA = globalThis.crypto.randomUUID()",
    );
    expect(source).toContain(
      "const organizationB = globalThis.crypto.randomUUID()",
    );
    expect(source).toContain("async function cleanupOrganizations()");
    expect(source).toContain("await cleanupFixtures()");
    expect(source).toContain(
      'record("service-controlled tenant fixture cleanup")',
    );
    expect(source).toContain("`listings?organization_id=eq.${id}`");
    expect(source).toContain('method: "DELETE"');
  });

  it("establishes one occupied free-seller slot before racing for the final slot", () => {
    expect(source).toContain('serviceRest("rpc/get_listing_limit"');
    expect(source).toContain("sellerFreeLimit !== 2");
    expect(source).toContain("Seller Free occupied-slot fixture creation");
    expect(source).toContain("`${quotaFixtureTitlePrefix} occupied slot`");
    expect(source).toContain("`${quotaFixtureTitlePrefix} contender A`");
    expect(source).toContain("`${quotaFixtureTitlePrefix} contender B`");
  });

  it("cleans current and legacy seller quota proof rows", () => {
    expect(source).toContain("async function cleanupQuotaFixtures()");
    expect(source).toContain("title.eq.ECAS tenant matrix concurrent seller A");
    expect(source).toContain("title.eq.ECAS tenant matrix concurrent seller B");
    expect(source).toContain("`title.like.${quotaFixtureTitlePrefix}*`");
    expect(source).toContain("await cleanupQuotaFixtures()");
  });
});
