#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const suites = process.argv.length > 2
  ? process.argv.slice(2)
  : [
      "scripts/deno-edge-coverage.test.mjs",
      "scripts/run-db-plpgsql-coverage.test.mjs",
    ];
const result = spawnSync(process.execPath, ["--test", ...suites], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: process.env,
});
if (result.error) {
  console.error(result.error);
}
process.exit(result.status ?? 1);
