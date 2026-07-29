import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createReleaseArtifact,
  verifyReleaseArtifact,
} from "./production-release-artifact.mjs";

const sha = "0123456789abcdef0123456789abcdef01234567";
const roots = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "maiprop-release-artifact-"));
  roots.push(root);
  const dist = join(root, "dist");
  mkdirSync(join(dist, "assets"), { recursive: true });
  writeFileSync(join(dist, "index.html"), "<html>release</html>");
  writeFileSync(join(dist, "_worker.js"), "export default {};");
  writeFileSync(join(dist, "assets", "app.js"), "console.log('release');");
  writeFileSync(join(root, "sbom.cdx.json"), '{"bomFormat":"CycloneDX"}');
  return { root, dist, out: join(root, "candidate") };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("immutable production release artifact", () => {
  it("creates and verifies a manifest tied to SHA, tree, run, and attempt", () => {
    const { root, dist, out } = fixture();
    const manifest = createReleaseArtifact({
      distDir: dist,
      sbomPath: join(root, "sbom.cdx.json"),
      outDir: out,
      releaseSha: sha,
      sourceTree: sha,
      runId: "123",
      runAttempt: "2",
    });

    expect(manifest.release_sha).toBe(sha);
    expect(manifest.source_tree).toBe(sha);
    expect(manifest.source_run_id).toBe("123");
    expect(manifest.source_run_attempt).toBe("2");
    expect(manifest.payload_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.artifact_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.files.some((file) => file.path === "dist/_worker.js")).toBe(
      true,
    );
    expect(verifyReleaseArtifact(out)).toEqual(manifest);

    const marker = JSON.parse(
      readFileSync(join(out, "dist", "deploy-version.json"), "utf8"),
    );
    expect(marker).toMatchObject({
      release_sha: sha,
      payload_sha256: manifest.payload_sha256,
    });
  });

  it.each([
    ["tampered application file", "dist/assets/app.js", "tampered"],
    ["tampered worker", "dist/_worker.js", "tampered worker"],
    ["tampered release marker", "dist/deploy-version.json", "{}"],
  ])("rejects %s", (_label, path, contents) => {
    const { root, dist, out } = fixture();
    createReleaseArtifact({
      distDir: dist,
      sbomPath: join(root, "sbom.cdx.json"),
      outDir: out,
      releaseSha: sha,
      sourceTree: sha,
      runId: "123",
      runAttempt: "1",
    });
    writeFileSync(join(out, ...path.split("/")), contents);

    expect(() => verifyReleaseArtifact(out)).toThrow(/mismatch|marker/i);
  });

  it("rejects missing and extra files", () => {
    const { root, dist, out } = fixture();
    createReleaseArtifact({
      distDir: dist,
      sbomPath: join(root, "sbom.cdx.json"),
      outDir: out,
      releaseSha: sha,
      sourceTree: sha,
      runId: "123",
      runAttempt: "1",
    });

    rmSync(join(out, "dist", "assets", "app.js"));
    expect(() => verifyReleaseArtifact(out)).toThrow(/file set/i);

    createReleaseArtifact({
      distDir: dist,
      sbomPath: join(root, "sbom.cdx.json"),
      outDir: out,
      releaseSha: sha,
      sourceTree: sha,
      runId: "123",
      runAttempt: "1",
    });
    writeFileSync(join(out, "dist", "unexpected.txt"), "extra");
    expect(() => verifyReleaseArtifact(out)).toThrow(/file set/i);
  });
});
