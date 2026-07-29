#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const MANIFEST_NAME = "release-manifest.json";
const MARKER_NAME = "deploy-version.json";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

function walkFiles(root, directory = root, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Release artifacts cannot contain symbolic links: ${absolute}`);
    }
    if (entry.isDirectory()) {
      walkFiles(root, absolute, output);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`Unsupported release artifact entry: ${absolute}`);
    }
    output.push(normalizePath(relative(root, absolute)));
  }
  return output.sort((a, b) => a.localeCompare(b));
}

function fileRecords(root, paths) {
  return paths.map((path) => {
    const absolute = join(root, ...path.split("/"));
    const bytes = readFileSync(absolute);
    return {
      path,
      size: bytes.byteLength,
      sha256: sha256(bytes),
    };
  });
}

function recordsDigest(records) {
  return sha256(JSON.stringify(records));
}

function requireFullSha(value, label) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!FULL_SHA.test(normalized)) {
    throw new Error(`${label} must be a full 40-character Git SHA.`);
  }
  return normalized;
}

function requireRunNumber(value, label) {
  const normalized = String(value ?? "").trim();
  if (!/^[1-9][0-9]*$/.test(normalized)) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return normalized;
}

function assertDirectory(path, label) {
  if (!existsSync(path) || !lstatSync(path).isDirectory()) {
    throw new Error(`${label} does not exist or is not a directory: ${path}`);
  }
}

function assertFile(path, label) {
  if (!existsSync(path) || !lstatSync(path).isFile()) {
    throw new Error(`${label} does not exist or is not a file: ${path}`);
  }
}

export function createReleaseArtifact({
  distDir,
  sbomPath,
  outDir,
  releaseSha,
  sourceTree,
  runId,
  runAttempt,
}) {
  const normalizedReleaseSha = requireFullSha(releaseSha, "Release SHA");
  const normalizedSourceTree = requireFullSha(sourceTree, "Source tree");
  const normalizedRunId = requireRunNumber(runId, "Source run ID");
  const normalizedRunAttempt = requireRunNumber(
    runAttempt,
    "Source run attempt",
  );
  const absoluteDist = resolve(distDir);
  const absoluteSbom = resolve(sbomPath);
  const absoluteOut = resolve(outDir);
  assertDirectory(absoluteDist, "Build output");
  assertFile(absoluteSbom, "SBOM");
  assertFile(join(absoluteDist, "_worker.js"), "Cloudflare Pages worker");

  rmSync(absoluteOut, { recursive: true, force: true });
  mkdirSync(absoluteOut, { recursive: true });
  cpSync(absoluteDist, join(absoluteOut, "dist"), {
    recursive: true,
    force: true,
    errorOnExist: false,
  });
  cpSync(absoluteSbom, join(absoluteOut, basename(absoluteSbom)), {
    force: true,
  });

  const markerPath = join(absoluteOut, "dist", MARKER_NAME);
  rmSync(markerPath, { force: true });
  const payloadPaths = walkFiles(join(absoluteOut, "dist"));
  const payloadFiles = fileRecords(
    absoluteOut,
    payloadPaths.map((path) => `dist/${path}`),
  );
  const payloadSha256 = recordsDigest(payloadFiles);
  writeFileSync(
    markerPath,
    `${JSON.stringify({
      schema_version: 1,
      release_sha: normalizedReleaseSha,
      source_tree: normalizedSourceTree,
      source_run_id: normalizedRunId,
      source_run_attempt: normalizedRunAttempt,
      payload_sha256: payloadSha256,
    }, null, 2)}\n`,
  );

  const artifactPaths = walkFiles(absoluteOut).filter(
    (path) => path !== MANIFEST_NAME,
  );
  const files = fileRecords(absoluteOut, artifactPaths);
  const manifest = {
    schema_version: 1,
    algorithm: "sha256",
    release_sha: normalizedReleaseSha,
    source_tree: normalizedSourceTree,
    source_run_id: normalizedRunId,
    source_run_attempt: normalizedRunAttempt,
    payload_sha256: payloadSha256,
    artifact_sha256: recordsDigest(files),
    payload_files: payloadFiles,
    files,
  };
  writeFileSync(
    join(absoluteOut, MANIFEST_NAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  verifyReleaseArtifact(absoluteOut);
  return manifest;
}

function samePaths(left, right) {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

export function verifyReleaseArtifact(
  directory,
  {
    releaseSha = "",
    sourceTree = "",
    runId = "",
    runAttempt = "",
  } = {},
) {
  const root = resolve(directory);
  assertDirectory(root, "Release artifact");
  const manifestPath = join(root, MANIFEST_NAME);
  assertFile(manifestPath, "Release manifest");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  if (!FULL_SHA.test(String(manifest.release_sha ?? ""))) {
    throw new Error("Release manifest has an invalid release SHA.");
  }
  if (!FULL_SHA.test(String(manifest.source_tree ?? ""))) {
    throw new Error("Release manifest has an invalid source tree.");
  }
  if (!SHA256.test(String(manifest.payload_sha256 ?? "")) ||
      !SHA256.test(String(manifest.artifact_sha256 ?? ""))) {
    throw new Error("Release manifest has an invalid digest.");
  }

  const expectedPaths = (manifest.files ?? [])
    .map((record) => String(record.path))
    .sort((a, b) => a.localeCompare(b));
  const actualPaths = walkFiles(root).filter(
    (path) => path !== MANIFEST_NAME,
  );
  if (!samePaths(expectedPaths, actualPaths)) {
    throw new Error("Release artifact file set does not match its manifest.");
  }

  const actualFiles = fileRecords(root, actualPaths);
  for (let index = 0; index < actualFiles.length; index += 1) {
    const expected = manifest.files[index];
    const actual = actualFiles[index];
    if (
      expected.path !== actual.path ||
      expected.size !== actual.size ||
      expected.sha256 !== actual.sha256
    ) {
      throw new Error(`Release artifact hash mismatch: ${actual.path}`);
    }
  }
  if (recordsDigest(actualFiles) !== manifest.artifact_sha256) {
    throw new Error("Release artifact digest mismatch.");
  }

  const payloadPaths = walkFiles(join(root, "dist"))
    .filter((path) => path !== MARKER_NAME)
    .map((path) => `dist/${path}`);
  const payloadFiles = fileRecords(root, payloadPaths);
  if (recordsDigest(payloadFiles) !== manifest.payload_sha256) {
    throw new Error("Release payload digest mismatch.");
  }

  const marker = JSON.parse(
    readFileSync(join(root, "dist", MARKER_NAME), "utf8"),
  );
  if (
    marker.release_sha !== manifest.release_sha ||
    marker.source_tree !== manifest.source_tree ||
    marker.source_run_id !== manifest.source_run_id ||
    marker.source_run_attempt !== manifest.source_run_attempt ||
    marker.payload_sha256 !== manifest.payload_sha256
  ) {
    throw new Error("Release marker does not match its manifest.");
  }

  const expected = {
    release_sha: releaseSha,
    source_tree: sourceTree,
    source_run_id: runId,
    source_run_attempt: runAttempt,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (value && String(manifest[key]) !== String(value)) {
      throw new Error(
        `Release manifest ${key} mismatch: ${manifest[key]} !== ${value}`,
      );
    }
  }
  return manifest;
}

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

async function main() {
  const command = process.argv[2] ?? "";
  if (command === "create") {
    const manifest = createReleaseArtifact({
      distDir: arg("--dist", "dist"),
      sbomPath: arg("--sbom", "sbom.cdx.json"),
      outDir: arg("--out", "release-candidate"),
      releaseSha: arg("--sha"),
      sourceTree: arg("--tree"),
      runId: arg("--run-id"),
      runAttempt: arg("--run-attempt"),
    });
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
    return;
  }
  if (command === "verify") {
    const manifest = verifyReleaseArtifact(
      arg("--dir", "release-candidate"),
      {
        releaseSha: arg("--sha"),
        sourceTree: arg("--tree"),
        runId: arg("--run-id"),
        runAttempt: arg("--run-attempt"),
      },
    );
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
    return;
  }
  throw new Error(
    "Usage: production-release-artifact.mjs <create|verify> [options]",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
