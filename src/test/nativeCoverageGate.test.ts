import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("native coverage-tool gate", () => {
  it("propagates a failing node:test assertion to the entrypoint", () => {
    const dir = mkdtempSync(join(tmpdir(), "maiprop-native-gate-"));
    try {
      const failingSuite = join(dir, "failure.test.mjs");
      writeFileSync(failingSuite, 'import test from "node:test"; test("gate failure", () => { throw new Error("native-gate-marker"); });\n');
      const result = spawnSync(process.execPath, ["scripts/run-native-coverage-tools.mjs", failingSuite], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain("native-gate-marker");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
