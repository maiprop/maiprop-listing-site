#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const vitestBin = join(root, "node_modules", "vitest", "vitest.mjs");
const coverageSummaryPath = join(root, "coverage", "coverage-summary.json");
const coverageTmpPath = join(root, "coverage", ".tmp");

const thresholds = {
  lines: 86,
  functions: 81,
  branches: 71,
  statements: 81.9,
};

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function removeCoverageTmp() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(coverageTmpPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return;
    } catch {
      sleep(100);
    }
  }
}

function coverageMeetsThresholds() {
  if (!existsSync(coverageSummaryPath)) return false;
  const summary = JSON.parse(readFileSync(coverageSummaryPath, "utf8"));
  const total = summary.total;
  return Boolean(total) &&
    total.lines?.pct >= thresholds.lines &&
    total.functions?.pct >= thresholds.functions &&
    total.branches?.pct >= thresholds.branches &&
    total.statements?.pct >= thresholds.statements;
}

function runCoverage() {
  return spawnSync(process.execPath, [vitestBin, "run", "--coverage"], {
    cwd: root,
    encoding: "utf8",
  });
}

function writeResult(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function failedDuringCoverageTmpCleanup(output) {
  return (
  /EPERM: operation not permitted, rmdir .*coverage[\\/]\.tmp/i.test(output) ||
    /coverage[\\/]\.tmp.*EPERM/i.test(output)
  );
}

function testsPassed(output) {
  return (
  /Test Files\s+\d+\s+passed/i.test(output) &&
  /Tests\s+\d+\s+passed/i.test(output) &&
  !/Test Files\s+.*failed/i.test(output) &&
    !/Tests\s+.*failed/i.test(output)
  );
}

removeCoverageTmp();
let result = runCoverage();
writeResult(result);

let output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
if (result.status !== 0 && failedDuringCoverageTmpCleanup(output)) {
  removeCoverageTmp();
  console.warn("[test:coverage] Retrying once after Windows coverage/.tmp cleanup EPERM.");
  result = runCoverage();
  writeResult(result);
  output = `${output}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

if (result.status === 0) {
  removeCoverageTmp();
  process.exit(0);
}

if (failedDuringCoverageTmpCleanup(output) && testsPassed(output) && coverageMeetsThresholds()) {
  removeCoverageTmp();
  console.warn("[test:coverage] Ignored Windows coverage/.tmp cleanup EPERM after tests and coverage thresholds passed.");
  process.exit(0);
}

process.exit(result.status ?? 1);
