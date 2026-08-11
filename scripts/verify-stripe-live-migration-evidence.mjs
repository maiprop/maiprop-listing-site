#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

import {
  requireEvidenceVerificationReleaseSha,
  verifyStripeLiveMigrationEvidence,
} from "./stripe-live-migration-evidence.mjs";

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const evidencePath = optionValue("--evidence");
if (!evidencePath) {
  throw new Error("--evidence <path> is required.");
}

const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
const expectedReleaseSha = requireEvidenceVerificationReleaseSha({
  requestedSha: optionValue("--release-sha") ?? process.env.RELEASE_SHA,
  headSha: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
});
if (evidence.release_sha !== expectedReleaseSha) {
  throw new Error(
    `Evidence release SHA ${evidence.release_sha ?? "missing"} does not match ${expectedReleaseSha}.`,
  );
}

const signingKey = process.env.RELEASE_EVIDENCE_SIGNING_KEY;
const expectedKeyId = process.env.RELEASE_EVIDENCE_SIGNING_KEY_ID;
if (!verifyStripeLiveMigrationEvidence(evidence, { signingKey, expectedKeyId })) {
  throw new Error("Stripe live migration evidence signature is invalid.");
}
if (evidence.ok !== true) {
  throw new Error("Stripe live migration evidence contains provider readiness failures.");
}

console.log(
  `Verified Stripe live migration evidence for ${evidence.release_sha} (${evidence.signature.key_id}).`,
);
