#!/usr/bin/env node
import { checkComplianceMatrix } from "./check-compliance-matrix.mjs";
import { checkDoraReadiness } from "./check-dora-readiness.mjs";
import { checkSlsaReadiness } from "./check-slsa-readiness.mjs";
import { checkWcagCoverage } from "./check-wcag-coverage.mjs";

const checks = [
  ["compliance matrix", checkComplianceMatrix],
  ["DORA readiness", checkDoraReadiness],
  ["SLSA readiness", checkSlsaReadiness],
  ["WCAG coverage", checkWcagCoverage],
];

const failures = [];

for (const [name, run] of checks) {
  const result = run(process.cwd());
  if (!result.ok) {
    for (const failure of result.failures) failures.push(`${name}: ${failure}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Standards readiness evidence OK\n");
}
