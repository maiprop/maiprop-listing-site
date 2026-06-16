import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const config = readFileSync(resolve(process.cwd(), ".circleci/config.yml"), "utf8");

describe("CircleCI config contract", () => {
  it("keeps cheap performance regression contracts in the quality job", () => {
    expect(config).toContain("npm run check:bundle-size");
    expect(config).toContain("npm run check:load-test-contract");
  });
});
