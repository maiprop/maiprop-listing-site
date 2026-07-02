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

  it("exposes tenant ownership on first-class listing and project resources", () => {
    const listingsBlock = generatedTypes.slice(
      generatedTypes.indexOf("listings: {"),
      generatedTypes.indexOf("marketing_leads: {"),
    );
    const projectsBlock = generatedTypes.slice(
      generatedTypes.indexOf("projects: {"),
      generatedTypes.indexOf("properties: {"),
    );

    expect(listingsBlock).toContain("organization_id: string | null");
    expect(projectsBlock).toContain("organization_id: string | null");
    expect(generatedTypes).toContain('foreignKeyName: "listings_organization_id_fkey"');
    expect(generatedTypes).toContain('foreignKeyName: "projects_organization_id_fkey"');
  });
});
