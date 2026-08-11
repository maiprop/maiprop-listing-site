import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("release safety inventory", () => {
  it("passes the checked inventory for documented environment variables", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/release-safety-inventory.mjs", "--check"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stderr).toContain("[release-safety] OK");
    const mutations =
      JSON.parse(result.stdout).workflow.provider_http_mutations;
    expect(mutations).toContainEqual({
      provider: "cloudflare",
      workflow:
        ".github/workflows/lock-cloudflare-pages-git-deploys.yml",
      method: "PATCH",
    });
    expect(
      mutations.filter(({ workflow }) => /evidence/i.test(workflow)),
    ).toEqual([]);
  });
});
