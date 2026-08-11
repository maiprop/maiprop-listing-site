import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { createReleaseArtifactBinding } from "./release-artifact-binding.mjs";

function parseArgs(argv) {
  const args = {};
  const repeatable = new Set(["file"]);
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error("Release artifact binding arguments must be --name value pairs.");
    }
    const name = key.slice(2);
    if (Object.hasOwn(args, name) && !repeatable.has(name)) {
      throw new Error(`Release artifact binding argument --${name} was provided more than once.`);
    }
    if (repeatable.has(name)) {
      (args[name] ??= []).push(value);
    } else {
      args[name] = value;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const out = resolve(args.out ?? "");
  const binding = createReleaseArtifactBinding({
    payloadRoot: args["payload-root"],
    fileRoot: args["file-root"],
    payloadFiles: args.file,
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
    keyId: args["key-id"],
    signingKey: process.env.RELEASE_EVIDENCE_SIGNING_KEY,
    issuedAt: args["issued-at"],
    nonce: args.nonce,
  });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(binding, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
