import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const RELEASE_SHA = "a".repeat(40);
const SOURCE_TREE = "b".repeat(40);
const DIGEST = "c".repeat(64);
const KEY = "create-binding-test-key".padEnd(64, "x");
const ISSUED_AT = new Date().toISOString();
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "maiprop-create-binding-"));
  roots.push(root);
  const payload = join(root, "payload");
  const output = join(root, "binding.json");
  writeFileSync(payload, "payload\n");
  return { root, payload, output };
}

function args({ payload, output, attempt = "1" }) {
  return [
    "scripts/create-release-artifact-binding.mjs",
    "--payload-root", payload,
    "--out", output,
    "--repository", "maiprop/maiprop-listing-site",
    "--release-sha", RELEASE_SHA,
    "--source-tree", SOURCE_TREE,
    "--workflow-path", ".github/workflows/ci.yml",
    "--workflow-ref", "maiprop/maiprop-listing-site/.github/workflows/ci.yml@refs/heads/main",
    "--workflow-sha", RELEASE_SHA,
    "--event", "push",
    "--run-id", "77",
    "--run-attempt", attempt,
    "--actor", "release-builder",
    "--triggering-actor", "release-builder",
    "--artifact-id", "101",
    "--artifact-name", `production-release-candidate-${RELEASE_SHA}-1`,
    "--artifact-digest", `sha256:${DIGEST}`,
    "--key-id", "release-key-2026-08",
    "--issued-at", ISSUED_AT,
    "--nonce", "d".repeat(64),
  ];
}

describe("create release artifact binding CLI", () => {
  it("writes a signed binding using only the environment signing key", () => {
    const { payload, output } = fixture();
    const result = spawnSync(process.execPath, args({ payload, output }), {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, RELEASE_EVIDENCE_SIGNING_KEY: KEY },
    });

    expect(result.status, result.stderr).toBe(0);
    const binding = JSON.parse(readFileSync(output, "utf8"));
    expect(binding).toMatchObject({
      domain: "maiprop.release-artifact-binding.v1",
      release_sha: RELEASE_SHA,
      artifact: { id: "101", digest: DIGEST },
      signature: { algorithm: "hmac-sha256", key_id: "release-key-2026-08" },
    });
  });

  it("fails closed for reruns", () => {
    const { payload, output } = fixture();
    const result = spawnSync(
      process.execPath,
      args({ payload, output, attempt: "2" }),
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, RELEASE_EVIDENCE_SIGNING_KEY: KEY },
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/attempt 1/i);
  });
});
