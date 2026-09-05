import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(import.meta.dirname, "staging-project-tenant-matrix.mjs"),
  "utf8",
);

describe("staging project tenant actors", () => {
  it("uses the Developer Pro actor for Project B after Organization B grants membership", () => {
    expect(source).toMatch(
      /organization_id: ids\.organizationB,\s+user_id: developerA\.userId,\s+role: "member"/,
    );
    expect(source).toContain(
      "createProject(developerA, ids.projectB, ids.organizationB, \"B\")",
    );
    expect(source).toContain("projectB.owner_id !== developerA.userId");
  });

  it("proves Organization B isolation before membership and after suspension", () => {
    expect(source).toContain("Unauthorized Organization B project creation");
    expect(source).toMatch(
      /organization_id=eq\.\$\{ids\.organizationB\}&user_id=eq\.\$\{developerA\.userId\}[\s\S]*?body: \{ status: "suspended" \}/,
    );
    expect(source).toContain("Suspended stale-token Project B update");
  });

  it("preallocates and cleans every negative project-create probe", () => {
    expect(source).not.toMatch(
      /createProject\(\s*\w+,\s*globalThis\.crypto\.randomUUID\(\)/,
    );
    expect(source).toContain(
      'const SERVICE_ROLE_KEY = required("STAGING_SUPABASE_SERVICE_ROLE_KEY")',
    );
    expect(source).toContain("async function removeProjectAsServiceRole");
    expect(source).toContain("async function verifyProjectAbsentAsServiceRole");
    for (const id of [
      "projectBeforeMembershipProbe",
      "projectForgedOwnerProbe",
      "projectIneligibleOwnerProbe",
      "projectFreeDeveloperProbe",
    ]) {
      expect(source).toContain(`ids.${id}`);
    }
    expect(source).toContain("await removeProjectAsServiceRole(projectId)");
    expect(source).toContain("await verifyProjectAbsentAsServiceRole(projectId)");
  });
});
