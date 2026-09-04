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
    expect(source).toContain("await cleanupOrganizations()");
    expect(source).toContain(
      'record("service-controlled organization fixture cleanup")',
    );
    expect(source).toContain("`listings?organization_id=eq.${id}`");
    expect(source).toContain('method: "DELETE"');
  });
});
