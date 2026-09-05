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

  it("registers and uploads canonical project media before attaching it, then removes the object", () => {
    expect(source).toContain('"rpc/register_new_building_storage_upload"');
    expect(source).toContain('p_bucket: "project-media"');
    expect(source).toContain(
      "`${developerA.userId}/${ids.projectA}/media/rendering-${RUN_ID}.png`",
    );
    expect(source).toContain(
      "`${SUPABASE_URL}/storage/v1/object/public/project-media/${mediaObjectPath}`",
    );
    expect(source).toContain(
      "`${SUPABASE_URL}/storage/v1/object/project-media/${objectPath}`",
    );
    expect(source).toContain('"x-upsert": "false"');
    expect(source).toContain("created.storageObjects.push(mediaObjectPath)");
    expect(source).toContain(
      "await removeProjectMediaObject(developerA, objectPath)",
    );

    const mediaSetup = source.indexOf("const mediaObjectPath =");
    const registration = source.indexOf(
      '"rpc/register_new_building_storage_upload"',
      mediaSetup,
    );
    const upload = source.indexOf(
      "await uploadProjectMediaObject(developerA, mediaObjectPath)",
      mediaSetup,
    );
    const attachment = source.indexOf('action: "add_media"', mediaSetup);
    expect(mediaSetup).toBeGreaterThan(-1);
    expect(registration).toBeGreaterThan(-1);
    expect(registration).toBeLessThan(upload);
    expect(upload).toBeLessThan(attachment);
  });
});
