import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readRepoFile = (path) => readFileSync(path, "utf8");

describe("e2e assertion quality guards", () => {
  it("does not accept public catalog load-error states as successful content", () => {
    const publicRoleSpec = readRepoFile("e2e/pages-roles.spec.ts");

    expect(publicRoleSpec).not.toContain('.or(page.getByText("Could not load open houses"))');
    expect(publicRoleSpec).not.toContain('.or(page.getByText("Failed to load auctions"))');
  });
});

