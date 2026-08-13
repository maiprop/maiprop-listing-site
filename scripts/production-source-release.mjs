import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { stableJson } from "./release-artifact-binding.mjs";

export const PRODUCTION_SOURCE_RELEASE_DOMAIN =
  "maiprop.production-source-release.v1";

const FULL_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const ACTOR = /^[a-z0-9-]+$/;
const MINIMUM_KEY_BYTES = 32;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const ARCHIVE_WORKFLOW_PATH =
  ".github/workflows/deploy-production-release.yml";

function fail(message) {
  throw new Error(`Production source release ${message}`);
}

function requiredString(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) fail(`${label} is required.`);
  return normalized;
}

function normalizedSha(value, label) {
  const sha = requiredString(value, label).toLowerCase();
  if (!FULL_SHA.test(sha)) fail(`${label} must be a full Git SHA.`);
  return sha;
}

function normalizedDigest(value, label) {
  const digest = requiredString(value, label)
    .toLowerCase()
    .replace(/^sha256:/, "");
  if (!SHA256.test(digest)) fail(`${label} must be a SHA-256 digest.`);
  return digest;
}

function attemptOne(value, label) {
  const attempt = requiredString(value, label);
  if (attempt !== "1") fail(`${label} must be attempt 1.`);
  return attempt;
}

function positiveInteger(value, label) {
  const normalized = requiredString(value, label);
  if (!POSITIVE_INTEGER.test(normalized)) {
    fail(`${label} must be a positive integer.`);
  }
  return normalized;
}

function normalizedRepository(value) {
  const repository = requiredString(value, "repository").toLowerCase();
  if (!REPOSITORY.test(repository)) fail("repository must be owner/name.");
  return repository;
}

function normalizedActor(value) {
  const actor = requiredString(value, "archive actor").toLowerCase();
  if (!ACTOR.test(actor)) fail("archive actor is invalid.");
  return actor;
}

function signingKeyBuffer(value, label = "signing key") {
  const key = Buffer.from(String(value ?? ""), "utf8");
  if (key.byteLength < MINIMUM_KEY_BYTES) {
    fail(`${label} must be at least ${MINIMUM_KEY_BYTES} bytes.`);
  }
  return key;
}

function verificationKeyBuffer(bindingKeyId, signingKey, expectedKeyId, keyRing) {
  const currentKeyId = requiredString(expectedKeyId, "expected signing key ID");
  if (bindingKeyId === currentKeyId) {
    return signingKeyBuffer(signingKey);
  }

  let parsed;
  try {
    parsed = JSON.parse(String(keyRing ?? ""));
  } catch {
    fail("historical verification keys must be a JSON object.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("historical verification keys must be a JSON object.");
  }
  if (!Object.hasOwn(parsed, bindingKeyId)) {
    fail(`verification key ${bindingKeyId} is unavailable.`);
  }
  return signingKeyBuffer(
    parsed[bindingKeyId],
    `verification key ${bindingKeyId}`,
  );
}

function fileSha256(path) {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function expectedTag(releaseSha) {
  return `production-source-${releaseSha}`;
}

function expectedAssetName(releaseSha) {
  return `${expectedTag(releaseSha)}.tar.gz`;
}

function readManifest(path) {
  const absolutePath = resolve(requiredString(path, "manifest path"));
  const bytes = readFileSync(absolutePath);
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("manifest is not valid JSON.");
  }
  return {
    manifest,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function normalizedSource(input) {
  const releaseSha = normalizedSha(input.releaseSha, "release SHA");
  const sourceTree = normalizedSha(input.sourceTree, "source tree");
  const sourceRunId = positiveInteger(input.sourceRunId, "source run ID");
  const sourceRunAttempt = attemptOne(
    input.sourceRunAttempt,
    "source run attempt",
  );
  return { releaseSha, sourceTree, sourceRunId, sourceRunAttempt };
}

function assertManifest(manifestRecord, source, expectedArtifactSha) {
  const { manifest } = manifestRecord;
  const artifactSha = normalizedDigest(
    manifest?.artifact_sha256,
    "manifest artifact digest",
  );
  if (
    manifest?.schema_version !== 2 ||
    String(manifest?.release_sha ?? "").toLowerCase() !== source.releaseSha ||
    String(manifest?.source_tree ?? "").toLowerCase() !== source.sourceTree ||
    String(manifest?.source_run_id ?? "") !== source.sourceRunId ||
    String(manifest?.source_run_attempt ?? "") !== source.sourceRunAttempt ||
    (expectedArtifactSha && artifactSha !== expectedArtifactSha)
  ) {
    fail("manifest does not match the bound source identity.");
  }
  return artifactSha;
}

function unsignedBinding(binding) {
  const {
    binding_digest_sha256: _bindingDigest,
    signature,
    ...unsigned
  } = binding ?? {};
  const { value: _signatureValue, ...signatureMetadata } = signature ?? {};
  return { ...unsigned, signature: signatureMetadata };
}

function signedPayload(binding) {
  return `${PRODUCTION_SOURCE_RELEASE_DOMAIN}\0${stableJson(unsignedBinding(binding))}`;
}

function hmacHex(key, value) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function buildUnsignedBinding(input) {
  const source = normalizedSource(input);
  const tagName = requiredString(input.tagName, "tag name");
  const assetName = requiredString(input.assetName, "asset name");
  if (tagName !== expectedTag(source.releaseSha)) {
    fail("tag name does not match the release SHA.");
  }
  if (assetName !== expectedAssetName(source.releaseSha)) {
    fail("asset name does not match the release SHA.");
  }
  const manifestRecord = readManifest(input.manifestPath);
  const artifactSha = assertManifest(manifestRecord, source);
  const issuedAt = requiredString(
    input.issuedAt ?? new Date().toISOString(),
    "issued time",
  );
  if (!Number.isFinite(Date.parse(issuedAt))) fail("issued time is invalid.");
  const nonce = requiredString(
    input.nonce ?? randomBytes(32).toString("hex"),
    "nonce",
  ).toLowerCase();
  if (!SHA256.test(nonce)) fail("nonce must be 32 random bytes in hex.");
  const archiveWorkflowPath = requiredString(
    input.archiveWorkflowPath ?? ARCHIVE_WORKFLOW_PATH,
    "archive workflow path",
  );
  if (archiveWorkflowPath !== ARCHIVE_WORKFLOW_PATH) {
    fail("archive workflow path is not authorized.");
  }
  const archiveWorkflowSha = normalizedSha(
    input.archiveWorkflowSha ?? source.releaseSha,
    "archive workflow SHA",
  );
  if (archiveWorkflowSha !== source.releaseSha) {
    fail("archive workflow SHA must equal the release SHA.");
  }
  const archiveEvent = requiredString(
    input.archiveEvent ?? "workflow_dispatch",
    "archive event",
  );
  if (archiveEvent !== "workflow_dispatch") {
    fail("archive event must be workflow_dispatch.");
  }

  return {
    schema_version: 1,
    evidence_type: "maiprop-production-source-release",
    domain: PRODUCTION_SOURCE_RELEASE_DOMAIN,
    repository: normalizedRepository(input.repository),
    release_sha: source.releaseSha,
    source_tree: source.sourceTree,
    source_run_id: source.sourceRunId,
    source_run_attempt: source.sourceRunAttempt,
    archive_run_id: positiveInteger(input.archiveRunId, "archive run ID"),
    archive_run_attempt: attemptOne(
      input.archiveRunAttempt,
      "archive run attempt",
    ),
    archive_actor: normalizedActor(input.archiveActor),
    archive_workflow_path: archiveWorkflowPath,
    archive_workflow_sha: archiveWorkflowSha,
    archive_event: archiveEvent,
    tag_name: tagName,
    asset: {
      name: assetName,
      sha256: fileSha256(input.assetPath),
    },
    manifest: {
      sha256: manifestRecord.sha256,
      artifact_sha256: artifactSha,
    },
    issued_at: issuedAt,
    nonce,
  };
}

export function createProductionSourceReleaseBinding(input) {
  const keyId = requiredString(input.keyId, "signing key ID");
  const unsigned = buildUnsignedBinding(input);
  const signable = {
    ...unsigned,
    signature: { algorithm: "hmac-sha256", key_id: keyId },
  };
  const payload = signedPayload(signable);
  const key = signingKeyBuffer(input.signingKey);
  return {
    ...signable,
    binding_digest_sha256: createHash("sha256").update(payload).digest("hex"),
    signature: {
      ...signable.signature,
      value: hmacHex(key, payload),
    },
  };
}

function assertSignature(binding, signingKey, expectedKeyId, verificationKeys) {
  if (
    binding?.schema_version !== 1 ||
    binding?.evidence_type !== "maiprop-production-source-release" ||
    binding?.domain !== PRODUCTION_SOURCE_RELEASE_DOMAIN
  ) {
    fail("binding domain or schema is invalid.");
  }
  if (
    binding?.signature?.algorithm !== "hmac-sha256" ||
    !requiredString(binding?.signature?.key_id, "binding signing key ID") ||
    !SHA256.test(String(binding?.signature?.value ?? ""))
  ) {
    fail("signature metadata is invalid.");
  }
  const payload = signedPayload(binding);
  const digest = createHash("sha256").update(payload).digest("hex");
  if (digest !== binding.binding_digest_sha256) {
    fail("binding digest is invalid.");
  }
  const verificationKey = verificationKeyBuffer(
    binding.signature.key_id,
    signingKey,
    expectedKeyId,
    verificationKeys,
  );
  const expected = Buffer.from(
    hmacHex(verificationKey, payload),
    "hex",
  );
  const actual = Buffer.from(binding.signature.value, "hex");
  if (expected.byteLength !== actual.byteLength || !timingSafeEqual(expected, actual)) {
    fail("signature is invalid.");
  }
  const issuedAt = Date.parse(String(binding.issued_at ?? ""));
  if (!Number.isFinite(issuedAt) || issuedAt > Date.now() + MAX_FUTURE_SKEW_MS) {
    fail("issued time is invalid.");
  }
}

function assertExpected(binding, expected) {
  const source = normalizedSource(expected);
  const checks = [
    [binding.repository, normalizedRepository(expected.repository), "repository"],
    [binding.release_sha, source.releaseSha, "release SHA"],
    [binding.source_tree, source.sourceTree, "source tree"],
    [binding.source_run_id, source.sourceRunId, "source run ID"],
    [binding.source_run_attempt, source.sourceRunAttempt, "source run attempt"],
    [
      binding.tag_name,
      requiredString(expected.tagName, "expected tag name"),
      "tag name",
    ],
    [
      binding.asset?.name,
      requiredString(expected.assetName, "expected asset name"),
      "asset name",
    ],
  ];
  if (expected.archiveRunId !== undefined) {
    checks.push([
      binding.archive_run_id,
      positiveInteger(expected.archiveRunId, "expected archive run ID"),
      "archive run ID",
    ]);
  }
  if (expected.archiveRunAttempt !== undefined) {
    checks.push([
      binding.archive_run_attempt,
      attemptOne(expected.archiveRunAttempt, "expected archive run attempt"),
      "archive run attempt",
    ]);
  }
  if (expected.archiveActor !== undefined) {
    checks.push([
      binding.archive_actor,
      normalizedActor(expected.archiveActor),
      "archive actor",
    ]);
  }
  for (const [actual, wanted, label] of checks) {
    if (actual !== wanted) fail(`${label} does not match trusted context.`);
  }
  if (
    binding.archive_workflow_path !== ARCHIVE_WORKFLOW_PATH ||
    binding.archive_workflow_sha !== source.releaseSha ||
    binding.archive_event !== "workflow_dispatch"
  ) {
    fail("archive workflow identity does not match trusted context.");
  }
}

export function verifyProductionSourceReleaseBinding({
  binding,
  assetPath,
  manifestPath,
  signingKey,
  expectedKeyId,
  verificationKeys,
  expected,
}) {
  assertSignature(binding, signingKey, expectedKeyId, verificationKeys);
  assertExpected(binding, expected);
  const assetDigest = fileSha256(assetPath);
  if (assetDigest !== normalizedDigest(binding.asset?.sha256, "asset digest")) {
    fail("asset digest does not match the signed binding.");
  }
  const manifestRecord = readManifest(manifestPath);
  if (
    manifestRecord.sha256 !==
      normalizedDigest(binding.manifest?.sha256, "manifest digest")
  ) {
    fail("manifest digest does not match the signed binding.");
  }
  const source = normalizedSource(expected);
  assertManifest(
    manifestRecord,
    source,
    normalizedDigest(
      binding.manifest?.artifact_sha256,
      "manifest artifact digest",
    ),
  );
  return {
    ok: true,
    releaseSha: binding.release_sha,
    sourceTree: binding.source_tree,
    sourceRunId: binding.source_run_id,
    sourceRunAttempt: binding.source_run_attempt,
    archiveRunId: binding.archive_run_id,
    archiveRunAttempt: binding.archive_run_attempt,
    archiveActor: binding.archive_actor,
    tagName: binding.tag_name,
    assetName: binding.asset.name,
    assetSha256: binding.asset.sha256,
    manifestSha256: binding.manifest.sha256,
    artifactSha256: binding.manifest.artifact_sha256,
    bindingDigestSha256: binding.binding_digest_sha256,
    keyId: binding.signature.key_id,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      fail("arguments must be --name value pairs.");
    }
    const name = key.slice(2);
    if (Object.hasOwn(args, name)) fail(`--${name} was provided more than once.`);
    args[name] = value;
  }
  return args;
}

function cliInput(args) {
  return {
    repository: args.repository,
    releaseSha: args["release-sha"],
    sourceTree: args["source-tree"],
    sourceRunId: args["source-run-id"],
    sourceRunAttempt: args["source-run-attempt"],
    archiveRunId: args["archive-run-id"],
    archiveRunAttempt: args["archive-run-attempt"],
    archiveActor: args["archive-actor"],
    archiveWorkflowPath: args["archive-workflow-path"],
    archiveWorkflowSha: args["archive-workflow-sha"],
    archiveEvent: args["archive-event"],
    tagName: args["tag-name"],
    assetName: args["asset-name"],
    assetPath: args.asset,
    manifestPath: args.manifest,
    keyId: args["key-id"],
    signingKey: process.env.RELEASE_EVIDENCE_SIGNING_KEY,
    verificationKeys: process.env.RELEASE_EVIDENCE_VERIFICATION_KEYS,
    issuedAt: args["issued-at"],
    nonce: args.nonce,
  };
}

function main() {
  const command = process.argv[2];
  const args = parseArgs(process.argv.slice(3));
  const input = cliInput(args);
  if (command === "create") {
    const binding = createProductionSourceReleaseBinding(input);
    writeFileSync(
      resolve(requiredString(args.out, "output path")),
      `${JSON.stringify(binding, null, 2)}\n`,
    );
    process.stdout.write(`${JSON.stringify(binding, null, 2)}\n`);
    return;
  }
  if (command === "verify") {
    const binding = JSON.parse(
      readFileSync(resolve(requiredString(args.binding, "binding path")), "utf8"),
    );
    const result = verifyProductionSourceReleaseBinding({
      binding,
      assetPath: input.assetPath,
      manifestPath: input.manifestPath,
      signingKey: input.signingKey,
      expectedKeyId: input.keyId,
      verificationKeys: input.verificationKeys,
      expected: input,
    });
    if (args["github-output"]) {
      appendFileSync(
        resolve(args["github-output"]),
        [
          `source_run_id=${result.sourceRunId}`,
          `source_run_attempt=${result.sourceRunAttempt}`,
          `archive_run_id=${result.archiveRunId}`,
          `archive_run_attempt=${result.archiveRunAttempt}`,
          `asset_sha256=${result.assetSha256}`,
          "",
        ].join("\n"),
      );
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  fail("command must be create or verify.");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
