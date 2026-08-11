import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA_RE = /^[0-9a-f]{40}$/;
const DIGEST_RE = /^[0-9a-f]{64}$/;
const POSITIVE_INTEGER_RE = /^[1-9][0-9]*$/;
const STAGING_WORKFLOW = ".github/workflows/stage-release.yml";

function fail() {
  throw new Error(
    "GitHub artifact metadata does not match the signed Supabase binding.",
  );
}

export function validateGitHubArtifactMetadata({
  artifact,
  producerRun,
  artifactName,
  runId,
  runAttempt,
  releaseSha,
  repository,
  workflowPath,
  event,
  branch,
  actor,
}) {
  const artifactId = String(artifact?.id ?? "");
  const normalizedRunId = String(runId ?? "");
  const normalizedRunAttempt = String(runAttempt ?? "");
  const normalizedReleaseSha = String(releaseSha ?? "").toLowerCase();
  const artifactDigest = String(artifact?.digest ?? "").replace(
    /^sha256:/,
    "",
  );
  if (
    typeof artifactName !== "string" ||
    artifactName.length === 0 ||
    !POSITIVE_INTEGER_RE.test(artifactId) ||
    !POSITIVE_INTEGER_RE.test(normalizedRunId) ||
    !POSITIVE_INTEGER_RE.test(normalizedRunAttempt) ||
    !SHA_RE.test(normalizedReleaseSha) ||
    !DIGEST_RE.test(artifactDigest) ||
    artifact?.name !== artifactName ||
    artifact?.expired !== false ||
    artifact?.digest !== `sha256:${artifactDigest}` ||
    String(artifact?.workflow_run?.id ?? "") !== normalizedRunId ||
    String(artifact?.workflow_run?.head_sha ?? "").toLowerCase() !==
      normalizedReleaseSha ||
    String(producerRun?.id ?? "") !== normalizedRunId ||
    String(producerRun?.run_attempt ?? "") !== normalizedRunAttempt ||
    String(producerRun?.head_sha ?? "").toLowerCase() !==
      normalizedReleaseSha ||
    producerRun?.path !== workflowPath ||
    producerRun?.status !== "completed" ||
    producerRun?.conclusion !== "success" ||
    (event && producerRun?.event !== event) ||
    (branch && producerRun?.head_branch !== branch) ||
    (repository && producerRun?.repository?.full_name !== repository) ||
    (actor && producerRun?.actor?.login !== actor) ||
    (actor && producerRun?.triggering_actor?.login !== actor)
  ) {
    fail();
  }

  return { artifactId, artifactDigest };
}

export function validateGitHubArtifactBinding({
  binding,
  artifact,
  producerRun,
}) {
  const artifactId = String(binding?.id ?? "");
  const runId = String(binding?.run_id ?? "");
  const runAttempt = String(binding?.run_attempt ?? "");
  const digest = String(binding?.digest ?? "");
  const releaseSha = String(binding?.release_sha ?? "").toLowerCase();
  if (
    typeof binding?.name !== "string" ||
    binding.name.length === 0 ||
    !POSITIVE_INTEGER_RE.test(artifactId) ||
    !POSITIVE_INTEGER_RE.test(runId) ||
    !POSITIVE_INTEGER_RE.test(runAttempt) ||
    !DIGEST_RE.test(digest) ||
    !SHA_RE.test(releaseSha) ||
    String(artifact?.id ?? "") !== artifactId ||
    artifact?.name !== binding.name ||
    artifact?.expired !== false ||
    artifact?.digest !== `sha256:${digest}` ||
    String(artifact?.workflow_run?.id ?? "") !== runId ||
    String(artifact?.workflow_run?.head_sha ?? "").toLowerCase() !==
      releaseSha ||
    String(producerRun?.id ?? "") !== runId
  ) {
    fail();
  }
  const result = validateGitHubArtifactMetadata({
    artifact,
    producerRun,
    artifactName: binding.name,
    runId,
    runAttempt,
    releaseSha,
    workflowPath: STAGING_WORKFLOW,
    event: "workflow_run",
    branch: "main",
  });
  if (result.artifactDigest !== digest) fail();
  return result;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) fail();
    args[key.slice(2)] = value;
  }
  return args;
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const artifact = readJson(args.artifact);
  const producerRun = readJson(args["producer-run"]);
  const result = args.binding
    ? validateGitHubArtifactBinding({
        binding: readJson(args.binding),
        artifact,
        producerRun,
      })
    : validateGitHubArtifactMetadata({
        artifact,
        producerRun,
        artifactName: args.name,
        runId: args["run-id"],
        runAttempt: args["run-attempt"],
        releaseSha: args["release-sha"],
        repository: args.repository,
        workflowPath: args["workflow-path"],
        event: args.event,
        branch: args.branch,
        actor: args.actor,
      });
  const output = args["github-output"];
  if (typeof output !== "string" || output.length === 0) fail();
  appendFileSync(
    resolve(output),
    `artifact_id=${result.artifactId}\nartifact_digest=${result.artifactDigest}\n`,
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
