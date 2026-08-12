import {
  appendFileSync,
  readFileSync,
} from "node:fs";
import { resolve } from "node:path";

import { verifyReleaseArtifactBinding } from "./release-artifact-binding.mjs";

function parseArgs(argv) {
  const args = {};
  const booleanFlags = new Set(["same-run"]);
  const repeatable = new Set(["file"]);
  for (let index = 0; index < argv.length;) {
    const key = argv[index];
    if (!key?.startsWith("--")) {
      throw new Error("Release artifact verification arguments must be --name value pairs.");
    }
    const name = key.slice(2);
    if (Object.hasOwn(args, name) && !repeatable.has(name)) {
      throw new Error(`Release artifact verification argument --${name} was provided more than once.`);
    }
    if (booleanFlags.has(name)) {
      args[name] = true;
      index += 1;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Release artifact verification argument --${name} requires a value.`);
    }
    if (repeatable.has(name)) {
      (args[name] ??= []).push(value);
    } else {
      args[name] = value;
    }
    index += 2;
  }
  return args;
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = verifyReleaseArtifactBinding({
    binding: readJson(args.binding),
    payloadRoot: args["payload-root"],
    fileRoot: args["file-root"],
    payloadFiles: args.file,
    artifactMetadata: readJson(args["artifact-metadata"]),
    producerRun: readJson(args["producer-run"]),
    signingKey: process.env.RELEASE_EVIDENCE_SIGNING_KEY,
    expectedKeyId: args["key-id"],
    expected: {
      repository: args.repository,
      releaseSha: args["release-sha"],
      sourceTree: args["source-tree"],
      workflowPath: args["workflow-path"],
      workflowRef: args["workflow-ref"],
      workflowSha: args["workflow-sha"],
      event: args.event,
      runId: args["run-id"],
      runAttempt: args["run-attempt"],
      actor: args.actor,
      triggeringActor: args["triggering-actor"],
      artifactId: args["artifact-id"],
      artifactName: args["artifact-name"],
      artifactDigest: args["artifact-digest"],
    },
    verificationMode: args["same-run"] ? "same-run" : "prior-run",
    trustedCurrentRun: args["same-run"]
      ? {
          runId: args["trusted-current-run-id"],
          runAttempt: args["trusted-current-run-attempt"],
          actor: args["trusted-current-actor"],
          triggeringActor: args["trusted-current-triggering-actor"],
        }
      : undefined,
  });
  const output = {
    schema_version: 1,
    evidence_type: "maiprop-release-artifact-binding-verification",
    ok: true,
    verification_mode: result.verificationMode,
    repository: result.repository,
    release_sha: result.releaseSha,
    source_tree: result.sourceTree,
    workflow_path: result.workflowPath,
    workflow_ref: result.workflowRef,
    workflow_sha: result.workflowSha,
    event: result.event,
    artifact_id: result.artifactId,
    artifact_name: result.artifactName,
    artifact_digest: result.artifactDigest,
    run_id: result.runId,
    run_attempt: result.runAttempt,
    actor: result.actor,
    triggering_actor: result.triggeringActor,
    key_id: result.keyId,
    binding_digest_sha256: result.bindingDigest,
    files: result.files,
  };
  if (args["github-output"]) {
    appendFileSync(
      resolve(args["github-output"]),
      [
        `artifact_id=${result.artifactId}`,
        `artifact_digest=${result.artifactDigest}`,
        `release_sha=${result.releaseSha}`,
        `source_tree=${result.sourceTree}`,
        `run_id=${result.runId}`,
        `run_attempt=${result.runAttempt}`,
        "",
      ].join("\n"),
    );
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
