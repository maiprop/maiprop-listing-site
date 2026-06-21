import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_PATH = "scripts/load-test/basic.js";
const SUMMARY_PATH = "scripts/load-test/summary.js";

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

const usesDefaultFallback = (text, envName) => {
  const escaped = envName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`__ENV\\.${escaped}\\s*(?:\\|\\||\\?\\?)`).test(text);
};

export function checkLoadTestContract(root = process.cwd()) {
  const failures = [];
  const text = readText(root, SCRIPT_PATH);
  if (text === null) return result([`${SCRIPT_PATH} is missing`]);
  const summaryText = readText(root, SUMMARY_PATH) ?? "";
  const contractText = `${text}\n${summaryText}`;

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
    "LOAD_TEST_SUMMARY_DIR",
    "baseline_100",
    "growth_10x",
    "enterprise_soak",
    "normalizeSummary",
    "CF-Access-Client-Id",
    "CF-Access-Client-Secret",
    "cf-access-token",
    "isCloudflareAccessLogin",
    "not Cloudflare Access login",
  ];

  for (const marker of includesAll(contractText, requiredMarkers)) {
    failures.push(`${SCRIPT_PATH} must mention ${marker}`);
  }

  if (maxTargetVus(text) < 1000) {
    failures.push(`${SCRIPT_PATH} peak target must reach at least 1000 VUs for the ECAS growth_10x profile`);
  }

  if (usesDefaultFallback(text, "BASE_URL") || !/requireEnv\(["']BASE_URL["']\)/.test(text)) {
    failures.push(`${SCRIPT_PATH} must require BASE_URL from __ENV without a default fallback`);
  }

  const validatesProfile =
    !usesDefaultFallback(text, "ECAS_LOAD_PROFILE") &&
    /requireLoadProfile\(\s*requireEnv\(["']ECAS_LOAD_PROFILE["']\)\s*\)/.test(text);
  if (!validatesProfile) {
    failures.push(`${SCRIPT_PATH} must validate ECAS_LOAD_PROFILE against smoke, baseline_100, growth_10x, enterprise_soak`);
  }

  const writesNormalizedSummary =
    /(?:\[\s*artifactPath\(["']load-test-summary\.json["']\)\s*\]|["']load-test-summary\.json["'])\s*:\s*JSON\.stringify\(\s*normalizeSummary\(data\)/.test(text) ||
    (
      /const\s+summary\s*=\s*normalizeSummary\(\s*data\b/.test(text) &&
      /(?:\[\s*artifactPath\(["']load-test-summary\.json["']\)\s*\]|["']load-test-summary\.json["'])\s*:\s*JSON\.stringify\(\s*summary\b/.test(text)
    );
  if (!writesNormalizedSummary) {
    failures.push(`${SCRIPT_PATH} must write normalized load-test-summary.json output`);
  }

  if (
    !/const\s+statusOk\s*=\s*check\(\s*res\b/.test(text) ||
    !/const\s+accessOk\s*=\s*check\(\s*res\b/.test(text) ||
    !/const\s+routeOk\s*=\s*statusOk\s*&&\s*accessOk/.test(text) ||
    !/errorRate\.add\(\s*routeOk\s*\?\s*0\s*:\s*1\s*,\s*(?:routeTags|\{\s*route:\s*route\.name\s*\})\s*\)/.test(text)
  ) {
    failures.push(`${SCRIPT_PATH} must fail availability when status is bad or Cloudflare Access login is served`);
  }

  if (
    !/function\s+loadTestHeaders\(\)/.test(text) ||
    !/CF_ACCESS_CLIENT_ID/.test(text) ||
    !/CF_ACCESS_CLIENT_SECRET/.test(text) ||
    !/CF_ACCESS_TOKEN/.test(text)
  ) {
    failures.push(`${SCRIPT_PATH} must support Cloudflare Access service-token headers for protected previews`);
  }

  if (
    !/function\s+isCloudflareAccessLogin\(\s*response\s*\)/.test(text) ||
    !/cloudflareaccess\.com\/cdn-cgi\/access\/login/.test(text) ||
    !/CF-Access-Domain/.test(text)
  ) {
    failures.push(`${SCRIPT_PATH} must reject Cloudflare Access login-page responses`);
  }

  const explicitRouteMetrics = [
    {
      metric: "route_http_req_duration",
      declaration: /new\s+Trend\(\s*["']route_http_req_duration["']/,
      recording: /routeDuration\.add\(\s*res\.timings\.duration\s*,\s*routeTags\s*\)/,
    },
    {
      metric: "route_http_req_failed",
      declaration: /new\s+Rate\(\s*["']route_http_req_failed["']/,
      recording: /routeFailedRate\.add\(\s*routeOk\s*\?\s*0\s*:\s*1\s*,\s*routeTags\s*\)/,
    },
    {
      metric: "route_errors",
      declaration: /new\s+Rate\(\s*["']route_errors["']/,
      recording: /routeErrorRate\.add\(\s*routeOk\s*\?\s*0\s*:\s*1\s*,\s*routeTags\s*\)/,
    },
    {
      metric: "route_http_reqs",
      declaration: /new\s+Counter\(\s*["']route_http_reqs["']/,
      recording: /routeRequests\.add\(\s*1\s*,\s*routeTags\s*\)/,
    },
  ];

  for (const { metric, declaration, recording } of explicitRouteMetrics) {
    if (!declaration.test(text) || !recording.test(text) || !routeThresholdPattern(metric).test(contractText)) {
      failures.push(`${SCRIPT_PATH} must record ${metric} for each route`);
    }
  }

  return result(failures);
}

function routeThresholdPattern(metricName) {
  return new RegExp(`routeThresholds\\(\\s*["']${metricName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`);
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
