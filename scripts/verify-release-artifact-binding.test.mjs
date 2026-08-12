import { afterEach, describe, expect, it } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { createReleaseArtifactBinding } from "./release-artifact-binding.mjs";

const RELEASE_SHA = "a".repeat(40);
const SOURCE_TREE = "b".repeat(40);
const DIGEST = "c".repeat(64);
const KEY = "verify-binding-test-key".padEnd(64, "x");
const ISSUED_AT = new Date().toISOString();
const REPOSITORY = "maiprop/maiprop-listing-site";
const WORKFLOW_PATH = ".github/workflows/ci.yml";
const WORKFLOW_REF = `${REPOSITORY}/${WORKFLOW_PATH}@refs/heads/main`;
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture({
  runAttempt = 1,
  status = "completed",
  conclusion = "success",
  multiFile = false,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "maiprop-verify-binding-"));
  roots.push(root);
  const payload = join(root, "payload");
  const bindingFile = join(root, "binding.json");
  const artifactFile = join(root, "artifact.json");
  const runFile = join(root, "run.json");
  const outputFile = join(root, "output.txt");
  const payloadFiles = multiFile ? ["first.json", "nested/second.json"] : [];
  if (multiFile) {
    mkdirSync(join(payload, "nested"), { recursive: true });
    writeFileSync(join(payload, "first.json"), '{"first":true}\n');
    writeFileSync(join(payload, "nested", "second.json"), '{"second":true}\n');
    writeFileSync(join(payload, "ignored.json"), '{"ignored":true}\n');
  } else {
    writeFileSync(payload, "payload\n");
  }
  const binding = createReleaseArtifactBinding({
    payloadRoot: payload,
    fileRoot: multiFile ? payload : undefined,
    payloadFiles: multiFile ? payloadFiles : undefined,
    repository: REPOSITORY,
    releaseSha: RELEASE_SHA,
    sourceTree: SOURCE_TREE,
    workflowPath: WORKFLOW_PATH,
    workflowRef: WORKFLOW_REF,
    workflowSha: RELEASE_SHA,
    event: "push",
    runId: "77",
    runAttempt: "1",
    actor: "release-builder",
    triggeringActor: "release-builder",
    artifactId: "101",
    artifactName: `production-release-candidate-${RELEASE_SHA}-1`,
    artifactDigest: `sha256:${DIGEST}`,
    keyId: "release-key-2026-08",
    signingKey: KEY,
    issuedAt: ISSUED_AT,
    nonce: "d".repeat(64),
  });
  writeFileSync(bindingFile, `${JSON.stringify(binding)}\n`);
  writeFileSync(artifactFile, `${JSON.stringify({
    id: 101,
    name: binding.artifact.name,
    expired: false,
    digest: `sha256:${DIGEST}`,
    workflow_run: {
      id: 77,
      head_sha: RELEASE_SHA,
      repository_id: 123,
      head_repository_id: 123,
    },
  })}\n`);
  writeFileSync(runFile, `${JSON.stringify({
    id: 77,
    run_attempt: runAttempt,
    head_sha: RELEASE_SHA,
    head_branch: "main",
    path: WORKFLOW_PATH,
    event: "push",
    status,
    conclusion,
    actor: { login: "release-builder" },
    triggering_actor: { login: "release-builder" },
    repository: { full_name: REPOSITORY, id: 123 },
    head_repository: { full_name: REPOSITORY, id: 123 },
  })}\n`);
  return {
    payload,
    payloadFiles,
    bindingFile,
    artifactFile,
    runFile,
    outputFile,
    artifactName: binding.artifact.name,
  };
}

function args(f, { sameRun = false, trustedRunId = "77" } = {}) {
  const values = [
    "scripts/verify-release-artifact-binding.mjs",
    "--binding", f.bindingFile,
    "--payload-root", f.payload,
    "--artifact-metadata", f.artifactFile,
    "--producer-run", f.runFile,
    "--repository", REPOSITORY,
    "--release-sha", RELEASE_SHA,
    "--source-tree", SOURCE_TREE,
    "--workflow-path", WORKFLOW_PATH,
    "--workflow-ref", WORKFLOW_REF,
    "--workflow-sha", RELEASE_SHA,
    "--event", "push",
    "--run-id", "77",
    "--run-attempt", "1",
    "--actor", "release-builder",
    "--triggering-actor", "release-builder",
    "--artifact-id", "101",
    "--artifact-name", f.artifactName,
    "--artifact-digest", `sha256:${DIGEST}`,
    "--key-id", "release-key-2026-08",
    "--github-output", f.outputFile,
  ];
  if (f.payloadFiles.length > 0) {
    values.push("--file-root", f.payload);
    for (const file of f.payloadFiles) values.push("--file", file);
  }
  if (sameRun) {
    values.push(
      "--same-run",
      "--trusted-current-run-id", trustedRunId,
      "--trusted-current-run-attempt", "1",
      "--trusted-current-actor", "release-builder",
      "--trusted-current-triggering-actor", "release-builder",
    );
  }
  return values;
}

describe("verify release artifact binding CLI", () => {
  it("verifies API metadata and emits trusted outputs", () => {
    const f = fixture();
    const result = spawnSync(process.execPath, args(f), {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, RELEASE_EVIDENCE_SIGNING_KEY: KEY },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, artifact_id: "101" });
    expect(readFileSync(f.outputFile, "utf8")).toContain("artifact_id=101");
  });

  it("rejects producer reruns even when the binding says attempt 1", () => {
    const f = fixture({ runAttempt: 2 });
    const result = spawnSync(process.execPath, args(f), {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, RELEASE_EVIDENCE_SIGNING_KEY: KEY },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/attempt|metadata/i);
  });

  it("requires an explicit trusted tuple for same-run in-progress verification", () => {
    const f = fixture({ status: "in_progress", conclusion: null });
    const defaultResult = spawnSync(process.execPath, args(f), {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, RELEASE_EVIDENCE_SIGNING_KEY: KEY },
    });
    expect(defaultResult.status).not.toBe(0);

    const sameRunResult = spawnSync(process.execPath, args(f, { sameRun: true }), {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, RELEASE_EVIDENCE_SIGNING_KEY: KEY },
    });
    expect(sameRunResult.status, sameRunResult.stderr).toBe(0);
    expect(JSON.parse(sameRunResult.stdout)).toMatchObject({
      ok: true,
      verification_mode: "same-run",
    });

    const wrongRunResult = spawnSync(
      process.execPath,
      args(f, { sameRun: true, trustedRunId: "78" }),
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, RELEASE_EVIDENCE_SIGNING_KEY: KEY },
      },
    );
    expect(wrongRunResult.status).not.toBe(0);
    expect(wrongRunResult.stderr).toMatch(/same-run|trusted|metadata/i);
  });

  it("verifies repeated selected files and ignores files outside the signed set", () => {
    const f = fixture({ multiFile: true });
    const verify = () => spawnSync(process.execPath, args(f), {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, RELEASE_EVIDENCE_SIGNING_KEY: KEY },
    });

    expect(verify().status).toBe(0);

    writeFileSync(join(f.payload, "ignored.json"), '{"ignored":false}\n');
    expect(verify().status).toBe(0);

    writeFileSync(join(f.payload, "nested", "second.json"), '{"second":false}\n');
    const tampered = verify();
    expect(tampered.status).not.toBe(0);
    expect(tampered.stderr).toMatch(/payload file/i);
  });

  it("rejects trusted artifact metadata that differs from the signed artifact", () => {
    const f = fixture();
    const changed = args(f);
    changed[changed.indexOf("--artifact-id") + 1] = "102";
    const result = spawnSync(process.execPath, changed, {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, RELEASE_EVIDENCE_SIGNING_KEY: KEY },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/artifact/i);
  });
});
