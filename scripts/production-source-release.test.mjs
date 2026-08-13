import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  createProductionSourceReleaseBinding,
  verifyProductionSourceReleaseBinding,
} from "./production-source-release.mjs";

const releaseSha = "0123456789abcdef0123456789abcdef01234567";
const sourceTree = "89abcdef0123456789abcdef0123456789abcdef";
const artifactSha = "a".repeat(64);
const signingKey = "a-release-evidence-key-that-is-longer-than-32-bytes";
const roots = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "maiprop-production-source-"));
  roots.push(root);
  const assetPath = join(root, `production-source-${releaseSha}.tar.gz`);
  const manifestPath = join(root, "release-manifest.json");
  writeFileSync(assetPath, "immutable production source bytes");
  writeFileSync(
    manifestPath,
    `${JSON.stringify({
      schema_version: 2,
      release_sha: releaseSha,
      source_tree: sourceTree,
      source_run_id: "123",
      source_run_attempt: "1",
      artifact_sha256: artifactSha,
    })}\n`,
  );
  return { root, assetPath, manifestPath };
}

function bindingInput(paths) {
  return {
    repository: "maiprop/maiprop-listing-site",
    releaseSha,
    sourceTree,
    sourceRunId: "123",
    sourceRunAttempt: "1",
    archiveRunId: "456",
    archiveRunAttempt: "1",
    archiveActor: "krenios",
    tagName: `production-source-${releaseSha}`,
    assetName: `production-source-${releaseSha}.tar.gz`,
    assetPath: paths.assetPath,
    manifestPath: paths.manifestPath,
    keyId: "release-key-v1",
    signingKey,
    issuedAt: "2026-08-13T12:00:00.000Z",
    nonce: "b".repeat(64),
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("durable production source release binding", () => {
  it("binds an immutable release asset to exact source and producer identities", () => {
    const paths = fixture();
    const input = bindingInput(paths);
    const binding = createProductionSourceReleaseBinding(input);

    expect(binding).toMatchObject({
      schema_version: 1,
      evidence_type: "maiprop-production-source-release",
      domain: "maiprop.production-source-release.v1",
      repository: input.repository,
      release_sha: releaseSha,
      source_tree: sourceTree,
      source_run_id: "123",
      source_run_attempt: "1",
      archive_run_id: "456",
      archive_run_attempt: "1",
      archive_actor: "krenios",
      tag_name: input.tagName,
      asset: {
        name: input.assetName,
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      manifest: {
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        artifact_sha256: artifactSha,
      },
    });

    expect(
      verifyProductionSourceReleaseBinding({
        binding,
        assetPath: paths.assetPath,
        manifestPath: paths.manifestPath,
        signingKey,
        expectedKeyId: "release-key-v1",
        expected: input,
      }),
    ).toMatchObject({
      ok: true,
      releaseSha,
      sourceRunId: "123",
      archiveRunId: "456",
      assetName: input.assetName,
    });
  });

  it("rejects asset mutation after signing", () => {
    const paths = fixture();
    const input = bindingInput(paths);
    const binding = createProductionSourceReleaseBinding(input);
    writeFileSync(paths.assetPath, "changed archive bytes");

    expect(() =>
      verifyProductionSourceReleaseBinding({
        binding,
        assetPath: paths.assetPath,
        manifestPath: paths.manifestPath,
        signingKey,
        expectedKeyId: input.keyId,
        expected: input,
      }),
    ).toThrow(/asset digest/i);
  });

  it("rejects a manifest that no longer identifies the bound source", () => {
    const paths = fixture();
    const input = bindingInput(paths);
    const binding = createProductionSourceReleaseBinding(input);
    const manifest = JSON.parse(readFileSync(paths.manifestPath, "utf8"));
    manifest.source_run_id = "999";
    writeFileSync(paths.manifestPath, `${JSON.stringify(manifest)}\n`);

    expect(() =>
      verifyProductionSourceReleaseBinding({
        binding,
        assetPath: paths.assetPath,
        manifestPath: paths.manifestPath,
        signingKey,
        expectedKeyId: input.keyId,
        expected: input,
      }),
    ).toThrow(/manifest/i);
  });

  it("requires attempt-one source and archive producers", () => {
    const paths = fixture();
    expect(() =>
      createProductionSourceReleaseBinding({
        ...bindingInput(paths),
        archiveRunAttempt: "2",
      }),
    ).toThrow(/attempt 1/i);
  });

  it("rejects an unexpected release tag or asset name", () => {
    const paths = fixture();
    expect(() =>
      createProductionSourceReleaseBinding({
        ...bindingInput(paths),
        tagName: "production-source-wrong",
      }),
    ).toThrow(/tag/i);
    expect(() =>
      createProductionSourceReleaseBinding({
        ...bindingInput(paths),
        assetName: "source.tar.gz",
      }),
    ).toThrow(/asset name/i);
  });
});
