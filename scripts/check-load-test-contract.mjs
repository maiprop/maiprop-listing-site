import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_PATH = "scripts/load-test/basic.js";

const result = (failures) => ({ ok: failures.length === 0, failures });

const readText = (root, relativePath) => {
  const path = join(root, relativePath);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
};

const includesAll = (text, required) => {
  return required.filter((needle) => !text.includes(needle));
};

const maxTargetVus = (text) => {
  const matches = [...text.matchAll(/\btarget:\s*(\d+)/g)];
  return matches.reduce((max, match) => Math.max(max, Number(match[1])), 0);
};

export function checkLoadTestContract(root = process.cwd()) {
  const failures = [];
  const text = readText(root, SCRIPT_PATH);
  if (text === null) return result([`${SCRIPT_PATH} is missing`]);

  const requiredMarkers = [
    "import http from \"k6/http\"",
    "executor: \"ramping-vus\"",
    "http_req_duration",
    "p(95)<2500",
    "http_req_failed",
    "rate<0.01",
    "errors",
    "/listings",
    "/auctions",
    "/api/public/listings",
    "/api/public/open-houses",
    "/sitemap-dynamic.xml",
    "handleSummary",
    "load-test-summary.json",
    "ECAS_LOAD_PROFILE",
    "LOAD_TEST_APPROVED_PRODUCTION",
    "baseline_100",
    "growth_10x",
    "enterprise_soak",
  ];

  for (const marker of includesAll(text, requiredMarkers)) {
    failures.push(`${SCRIPT_PATH} must mention ${marker}`);
  }

  if (maxTargetVus(text) < 1000) {
    failures.push(`${SCRIPT_PATH} peak target must reach at least 1000 VUs for the ECAS growth_10x profile`);
  }

  return result(failures);
}

const main = () => {
  const check = checkLoadTestContract(process.cwd());
  if (!check.ok) {
    for (const failure of check.failures) process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("Load test contract OK\n");
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("check-load-test-contract.mjs")
) {
  main();
}
