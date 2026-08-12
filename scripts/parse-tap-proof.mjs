#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const PLAN = /^\s*1\.\.([0-9]+)(?:\s*#.*)?\s*$/;
const RESULT = /^\s*(not ok|ok)\s+([0-9]+)(?:\s*[-#].*)?\s*$/i;

export function parseTapProof(text, { expectedPlan } = {}) {
  const source = String(text ?? "");
  if (/(^|\n)\s*Bail out!/i.test(source)) {
    throw new Error("TAP proof contains a bailout.");
  }

  const plans = [];
  const results = new Map();
  for (const line of source.split(/\r?\n/)) {
    const plan = line.match(PLAN);
    if (plan) {
      plans.push(Number(plan[1]));
      continue;
    }
    const result = line.match(RESULT);
    if (!result) continue;

    const number = Number(result[2]);
    if (results.has(number)) {
      throw new Error(`TAP proof contains duplicate test number ${number}.`);
    }
    results.set(number, result[1].toLowerCase() === "ok");
  }

  if (plans.length !== 1) {
    throw new Error(`TAP proof must contain exactly one plan; found ${plans.length}.`);
  }
  const plan = plans[0];
  if (!Number.isSafeInteger(plan) || plan < 1) {
    throw new Error("TAP proof plan must be a positive integer.");
  }
  if (expectedPlan !== undefined && plan !== Number(expectedPlan)) {
    throw new Error(`TAP proof plan ${plan} does not match expected plan ${expectedPlan}.`);
  }
  if (results.size !== plan) {
    throw new Error(`TAP proof is truncated: expected ${plan} results, found ${results.size}.`);
  }
  for (let number = 1; number <= plan; number += 1) {
    if (!results.has(number)) {
      throw new Error(`TAP proof is missing test number ${number}.`);
    }
    if (results.get(number) !== true) {
      throw new Error(`TAP proof test ${number} is not ok.`);
    }
  }

  return {
    schemaVersion: 1,
    kind: "maiprop-tap-proof",
    status: "passed",
    plan,
    okCount: results.size,
  };
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? "" : "";
}

function main() {
  const file = arg("--file");
  const expected = arg("--expected-plan");
  if (!file || (expected && !/^[1-9][0-9]*$/.test(expected))) {
    throw new Error(
      "Usage: parse-tap-proof.mjs --file <tap.txt> [--expected-plan <count>]",
    );
  }
  const proof = parseTapProof(readFileSync(file, "utf8"), {
    expectedPlan: expected ? Number(expected) : undefined,
  });
  process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
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
