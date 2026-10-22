import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  lstatSync,
  realpathSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import {
  basename,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

export const RELEASE_ARTIFACT_BINDING_DOMAIN =
  "maiprop.release-artifact-binding.v1";

const FULL_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MINIMUM_KEY_BYTES = 32;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

function fail(message) {
  throw new Error(`Release artifact binding ${message}`);
}

function requiredString(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) fail(`${label} is required.`);
  return normalized;
}

function normalizeRepository(value) {
  const repository = requiredString(value, "repository").toLowerCase();
  if (!REPOSITORY.test(repository)) fail("repository must be owner/name.");
  return repository;
}

function normalizeSha(value, label) {
  const sha = requiredString(value, label).toLowerCase();
  if (!FULL_SHA.test(sha)) fail(`${label} must be a full Git SHA.`);
  return sha;
}

function normalizeDigest(value, label = "artifact digest") {
  const digest = requiredString(value, label)
    .toLowerCase()
    .replace(/^sha256:/, "");
  if (!SHA256.test(digest)) fail(`${label} must be a SHA-256 digest.`);
  return digest;
}

function positiveInteger(value, label) {
  const normalized = requiredString(value, label);
  if (!POSITIVE_INTEGER.test(normalized)) {
    fail(`${label} must be a positive integer.`);
  }
  return normalized;
}

function originalAttempt(value) {
  const attempt = positiveInteger(value, "run attempt");
  if (attempt !== "1") fail("requires run attempt 1.");
  return attempt;
}

function normalizeActor(value, label) {
  const actor = requiredString(value, label).toLowerCase();
  if (!/^[a-z0-9-]+$/.test(actor)) fail(`${label} is invalid.`);
  return actor;
}

function normalizeWorkflowPath(value) {
  const path = requiredString(value, "workflow path").replaceAll("\\", "/");
  if (!/^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/.test(path)) {
    fail("workflow path must name a workflow under .github/workflows.");
  }
  return path;
}

function normalizeWorkflowRef(value, repository, workflowPath) {
  const workflowRef = requiredString(value, "workflow ref");
  const prefix = `${repository}/${workflowPath}@`;
  if (!workflowRef.toLowerCase().startsWith(prefix.toLowerCase())) {
    fail("workflow ref does not match the repository and workflow path.");
  }
  return workflowRef;
}

function branchFromWorkflowRef(workflowRef) {
  const marker = "@refs/heads/";
  const index = workflowRef.indexOf(marker);
  if (index === -1) fail("workflow ref must identify a branch ref.");
  return requiredString(workflowRef.slice(index + marker.length), "workflow branch");
}

function workflowRunPathMatches(runPath, workflowPath, headBranch) {
  const normalized = requiredString(runPath, "producer workflow path")
    .replaceAll("\\", "/");
  return normalized === workflowPath ||
    normalized === `${workflowPath}@${headBranch}`;
}

function signingKeyBuffer(signingKey) {
  const key = Buffer.from(String(signingKey ?? ""), "utf8");
  if (key.length < MINIMUM_KEY_BYTES) {
    fail(`signing key must be at least ${MINIMUM_KEY_BYTES} bytes.`);
  }
  return key;
}

export function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function payloadRecord(root, absolutePath, path) {
  const stat = lstatSync(absolutePath);
  if (stat.isSymbolicLink()) fail(`payload contains a symbolic link: ${path}.`);
  if (!stat.isFile()) fail(`payload contains an unsupported entry: ${path}.`);
  const bytes = readFileSync(absolutePath);
  return { path, size: bytes.byteLength, sha256: sha256(bytes) };
}

function pathEscapesRoot(path) {
  return path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path);
}

function collectSelectedPayloadFiles(fileRoot, payloadFiles) {
  const root = resolve(requiredString(fileRoot, "file root"));
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink()) fail("file root cannot be a symbolic link.");
  if (!rootStat.isDirectory()) fail("file root must be a directory.");
  const rootRealPath = realpathSync(root);
  const seen = new Set();
  const files = payloadFiles.map((value) => {
    const path = requiredString(value, "payload file").replaceAll("\\", "/");
    if (path.startsWith("/") || /^[A-Za-z]:\//.test(path)) {
      fail(`payload file must be relative to the file root: ${path}.`);
    }
    const absolutePath = resolve(root, path);
    const lexicalRelative = relative(root, absolutePath);
    if (pathEscapesRoot(lexicalRelative)) {
      fail(`payload file is outside the file root: ${path}.`);
    }
    const normalizedPath = lexicalRelative.split(sep).join("/");
    if (normalizedPath !== path || seen.has(normalizedPath)) {
      fail(`payload file path is duplicate or non-canonical: ${path}.`);
    }
    seen.add(normalizedPath);
    const realPath = realpathSync(absolutePath);
    if (pathEscapesRoot(relative(rootRealPath, realPath))) {
      fail(`payload file resolves outside the file root: ${path}.`);
    }
    return payloadRecord(rootRealPath, realPath, normalizedPath);
  });
  files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return files;
}

export function collectPayloadFiles(
  payloadRoot,
  { fileRoot, payloadFiles } = {},
) {
  if (payloadFiles !== undefined) {
    if (!Array.isArray(payloadFiles) || payloadFiles.length === 0) {
      fail("selected payload files must be a non-empty array.");
    }
    return collectSelectedPayloadFiles(fileRoot, payloadFiles);
  }
  const root = resolve(requiredString(payloadRoot, "payload root"));
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink()) fail("payload root cannot be a symbolic link.");
  if (rootStat.isFile()) {
    return [payloadRecord(root, root, basename(root))];
  }
  if (!rootStat.isDirectory()) fail("payload root must be a file or directory.");

  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      const relativePath = relative(root, absolute).split(sep).join("/");
      if (entry.isDirectory()) {
        walk(absolute);
      } else {
        files.push(payloadRecord(root, absolute, relativePath));
      }
    }
  };
  walk(root);
  files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  if (files.length === 0) fail("payload root is empty.");
  return files;
}

function unsignedBinding(binding) {
  const {
    binding_digest_sha256: _digest,
    signature,
    ...unsigned
  } = binding ?? {};
  const { value: _signatureValue, ...signatureMetadata } = signature ?? {};
  return {
    ...unsigned,
    signature: signatureMetadata,
  };
}

function signedPayload(binding) {
  return `${RELEASE_ARTIFACT_BINDING_DOMAIN}\0${stableJson(unsignedBinding(binding))}`;
}

function buildUnsignedBinding(input) {
  const repository = normalizeRepository(input.repository);
  const releaseSha = normalizeSha(input.releaseSha, "release SHA");
  const workflowPath = normalizeWorkflowPath(input.workflowPath);
  const workflowRef = normalizeWorkflowRef(
    input.workflowRef,
    repository,
    workflowPath,
  );
  const actor = normalizeActor(input.actor, "actor");
  const triggeringActor = normalizeActor(
    input.triggeringActor,
    "triggering actor",
  );
  if (actor !== triggeringActor) {
    fail("requires actor to equal triggering actor.");
  }
  const issuedAt = requiredString(
    input.issuedAt ?? new Date().toISOString(),
    "issued time",
  );
  if (!Number.isFinite(Date.parse(issuedAt))) fail("issued time is invalid.");
  const nonce = requiredString(
    input.nonce ?? randomBytes(32).toString("hex"),
    "nonce",
  );
  if (!SHA256.test(nonce.toLowerCase())) fail("nonce must be 32 random bytes in hex.");

  return {
    schema_version: 1,
    evidence_type: "maiprop-release-artifact-binding",
    domain: RELEASE_ARTIFACT_BINDING_DOMAIN,
    repository,
    release_sha: releaseSha,
    source_tree: normalizeSha(input.sourceTree, "source tree"),
    producer: {
      workflow_path: workflowPath,
      workflow_ref: workflowRef,
      workflow_sha: normalizeSha(input.workflowSha, "workflow SHA"),
      event: requiredString(input.event, "event"),
      head_branch: branchFromWorkflowRef(workflowRef),
      run_id: positiveInteger(input.runId, "run ID"),
      run_attempt: originalAttempt(input.runAttempt),
      actor,
      triggering_actor: triggeringActor,
    },
    artifact: {
      id: positiveInteger(input.artifactId, "artifact ID"),
      name: requiredString(input.artifactName, "artifact name"),
      digest: normalizeDigest(input.artifactDigest),
    },
    files: collectPayloadFiles(input.payloadRoot, {
      fileRoot: input.fileRoot,
      payloadFiles: input.payloadFiles,
    }),
    issued_at: issuedAt,
    nonce: nonce.toLowerCase(),
  };
}

export function createReleaseArtifactBinding(input) {
  const keyId = requiredString(input.keyId, "signing key ID");
  const unsigned = buildUnsignedBinding(input);
  const signatureMetadata = {
    algorithm: "hmac-sha256",
    key_id: keyId,
  };
  const signable = {
    ...unsigned,
    signature: signatureMetadata,
  };
  const payload = signedPayload(signable);
  const key = signingKeyBuffer(input.signingKey);
  return {
    ...signable,
    binding_digest_sha256: sha256(payload),
    signature: {
      ...signatureMetadata,
      value: createHmac("sha256", key).update(payload).digest("hex"),
    },
  };
}

function assertSignedBinding(binding, signingKey, expectedKeyId) {
  if (
    binding?.domain !== RELEASE_ARTIFACT_BINDING_DOMAIN ||
    binding?.evidence_type !== "maiprop-release-artifact-binding" ||
    binding?.schema_version !== 1
  ) {
    fail("domain or schema is invalid.");
  }
  const signature = binding?.signature;
  if (
    signature?.algorithm !== "hmac-sha256" ||
    !SHA256.test(String(signature?.value ?? "")) ||
    signature?.key_id !== requiredString(expectedKeyId, "expected key ID")
  ) {
    fail("signature metadata is invalid.");
  }
  const payload = signedPayload(binding);
  if (sha256(payload) !== binding?.binding_digest_sha256) {
    fail("signature digest is invalid.");
  }
  const expected = Buffer.from(
    createHmac("sha256", signingKeyBuffer(signingKey)).update(payload).digest("hex"),
    "hex",
  );
  const actual = Buffer.from(signature.value, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    fail("signature is invalid.");
  }
  const issuedAt = Date.parse(String(binding?.issued_at ?? ""));
  if (!Number.isFinite(issuedAt) || issuedAt > Date.now() + MAX_FUTURE_SKEW_MS) {
    fail("issued time is invalid.");
  }
}

function assertExpected(binding, expected) {
  const checks = [
    [binding.repository, normalizeRepository(expected.repository), "repository"],
    [binding.release_sha, normalizeSha(expected.releaseSha, "expected release SHA"), "release SHA"],
    [binding.source_tree, normalizeSha(expected.sourceTree, "expected source tree"), "source tree"],
    [binding.producer?.workflow_path, normalizeWorkflowPath(expected.workflowPath), "workflow path"],
    [
      binding.producer?.workflow_ref,
      normalizeWorkflowRef(
        expected.workflowRef,
        normalizeRepository(expected.repository),
        normalizeWorkflowPath(expected.workflowPath),
      ),
      "workflow ref",
    ],
    [binding.producer?.workflow_sha, normalizeSha(expected.workflowSha, "expected workflow SHA"), "workflow SHA"],
    [binding.producer?.event, requiredString(expected.event, "expected event"), "event"],
    [binding.producer?.run_id, positiveInteger(expected.runId, "expected run ID"), "run ID"],
    [binding.producer?.run_attempt, originalAttempt(expected.runAttempt), "run attempt"],
    [binding.producer?.actor, normalizeActor(expected.actor, "expected actor"), "actor"],
    [
      binding.producer?.triggering_actor,
      normalizeActor(expected.triggeringActor, "expected triggering actor"),
      "triggering actor",
    ],
  ];
  for (const [actual, wanted, label] of checks) {
    if (actual !== wanted) fail(`${label} does not match the trusted context.`);
  }
  const artifactExpectations = [
    expected.artifactId,
    expected.artifactName,
    expected.artifactDigest,
  ];
  if (artifactExpectations.some((value) => value !== undefined)) {
    if (artifactExpectations.some((value) => value === undefined)) {
      fail("trusted artifact ID, name, and digest must be provided together.");
    }
    const artifactChecks = [
      [binding.artifact?.id, positiveInteger(expected.artifactId, "expected artifact ID"), "artifact ID"],
      [binding.artifact?.name, requiredString(expected.artifactName, "expected artifact name"), "artifact name"],
      [binding.artifact?.digest, normalizeDigest(expected.artifactDigest, "expected artifact digest"), "artifact digest"],
    ];
    for (const [actual, wanted, label] of artifactChecks) {
      if (actual !== wanted) fail(`${label} does not match the trusted context.`);
    }
  }
}

function assertRunState(binding, run, verificationMode, trustedCurrentRun) {
  if (verificationMode === "prior-run") {
    if (run?.status !== "completed" || run?.conclusion !== "success") {
      fail("prior-run metadata must be completed with a successful conclusion.");
    }
    return;
  }
  if (verificationMode !== "same-run") {
    fail("verification mode must be prior-run or same-run.");
  }
  const trustedRunId = positiveInteger(
    trustedCurrentRun?.runId,
    "trusted current run ID",
  );
  const trustedRunAttempt = originalAttempt(
    trustedCurrentRun?.runAttempt,
  );
  const trustedActor = normalizeActor(
    trustedCurrentRun?.actor,
    "trusted current actor",
  );
  const trustedTriggeringActor = normalizeActor(
    trustedCurrentRun?.triggeringActor,
    "trusted current triggering actor",
  );
  if (trustedActor !== trustedTriggeringActor) {
    fail("same-run trusted actor must equal the trusted triggering actor.");
  }
  if (
    trustedRunId !== binding.producer.run_id ||
    trustedRunAttempt !== binding.producer.run_attempt ||
    trustedActor !== binding.producer.actor ||
    trustedTriggeringActor !== binding.producer.triggering_actor ||
    String(run?.id ?? "") !== trustedRunId ||
    String(run?.run_attempt ?? "") !== trustedRunAttempt ||
    normalizeActor(run?.actor?.login, "producer actor") !== trustedActor ||
    normalizeActor(
      run?.triggering_actor?.login,
      "producer triggering actor",
    ) !== trustedTriggeringActor
  ) {
    fail("same-run metadata does not match the trusted current run tuple.");
  }
  if (run?.status === "completed" || run?.conclusion !== null) {
    fail("same-run metadata must describe a live run with a null conclusion.");
  }
}

function assertArtifactMetadata(
  binding,
  artifact,
  run,
  verificationMode,
  trustedCurrentRun,
) {
  const actor = normalizeActor(run?.actor?.login, "producer actor");
  const triggeringActor = normalizeActor(
    run?.triggering_actor?.login,
    "producer triggering actor",
  );
  if (actor !== triggeringActor) fail("producer actor metadata does not match triggering actor.");
  if (originalAttempt(run?.run_attempt) !== binding.producer.run_attempt) {
    fail("producer run attempt metadata does not match.");
  }
  assertRunState(binding, run, verificationMode, trustedCurrentRun);
  const repository = normalizeRepository(run?.repository?.full_name);
  const headRepository = normalizeRepository(run?.head_repository?.full_name);
  const repositoryId = String(run?.repository?.id ?? "");
  const headRepositoryId = String(run?.head_repository?.id ?? "");
  const artifactRepositoryId = String(artifact?.workflow_run?.repository_id ?? "");
  const artifactHeadRepositoryId = String(
    artifact?.workflow_run?.head_repository_id ?? "",
  );
  const metadataMatches =
    String(artifact?.id ?? "") === binding.artifact.id &&
    artifact?.name === binding.artifact.name &&
    artifact?.expired === false &&
    normalizeDigest(artifact?.digest) === binding.artifact.digest &&
    String(artifact?.workflow_run?.id ?? "") === binding.producer.run_id &&
    normalizeSha(artifact?.workflow_run?.head_sha, "artifact head SHA") === binding.release_sha &&
    String(run?.id ?? "") === binding.producer.run_id &&
    normalizeSha(run?.head_sha, "producer head SHA") === binding.release_sha &&
    run?.head_branch === binding.producer.head_branch &&
    workflowRunPathMatches(
      run?.path,
      binding.producer.workflow_path,
      binding.producer.head_branch,
    ) &&
    run?.event === binding.producer.event &&
    repository === binding.repository &&
    headRepository === binding.repository &&
    actor === binding.producer.actor &&
    triggeringActor === binding.producer.triggering_actor &&
    repositoryId !== "" &&
    repositoryId === headRepositoryId &&
    repositoryId === artifactRepositoryId &&
    repositoryId === artifactHeadRepositoryId;
  if (!metadataMatches) fail("GitHub artifact or producer metadata does not match.");
}

function assertPayload(binding, payloadRoot, fileSelection) {
  const actual = collectPayloadFiles(payloadRoot, fileSelection);
  if (stableJson(actual) !== stableJson(binding.files)) {
    fail("payload file set or SHA-256 digest does not match.");
  }
  return actual;
}

export function verifyReleaseArtifactBinding({
  binding,
  payloadRoot,
  artifactMetadata,
  producerRun,
  signingKey,
  expectedKeyId,
  expected,
  verificationMode = "prior-run",
  trustedCurrentRun,
  fileRoot,
  payloadFiles,
}) {
  assertSignedBinding(binding, signingKey, expectedKeyId);
  assertExpected(binding, expected);
  assertArtifactMetadata(
    binding,
    artifactMetadata,
    producerRun,
    verificationMode,
    trustedCurrentRun,
  );
  const files = assertPayload(binding, payloadRoot, { fileRoot, payloadFiles });
  return {
    schema_version: 1,
    evidence_type: "maiprop-release-artifact-binding-verification",
    domain: RELEASE_ARTIFACT_BINDING_DOMAIN,
    ok: true,
    verificationMode,
    repository: binding.repository,
    releaseSha: binding.release_sha,
    sourceTree: binding.source_tree,
    workflowPath: binding.producer.workflow_path,
    workflowRef: binding.producer.workflow_ref,
    workflowSha: binding.producer.workflow_sha,
    event: binding.producer.event,
    artifactId: binding.artifact.id,
    artifactName: binding.artifact.name,
    artifactDigest: binding.artifact.digest,
    runId: binding.producer.run_id,
    runAttempt: binding.producer.run_attempt,
    actor: binding.producer.actor,
    triggeringActor: binding.producer.triggering_actor,
    keyId: binding.signature.key_id,
    bindingDigest: binding.binding_digest_sha256,
    files,
  };
}
