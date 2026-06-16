import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const typesPath = resolve(process.cwd(), "src/integrations/supabase/types.ts");
const generatedTypes = readFileSync(typesPath, "utf8");

describe("generated Supabase types enterprise contract", () => {
  it("contains the enterprise, SSO, procurement, and trial tables deployed to production", () => {
    [
      "organizations",
      "organization_memberships",
      "organization_domains",
      "organization_sso_providers",
      "procurement_evidence",
      "subscription_trial_claims",
    ].forEach((tableName) => {
      expect(generatedTypes).toContain(`${tableName}: {`);
    });
  });
});
