/**
 * k6 load test - non-prod baseline scenario.
 *
 * Install k6: https://k6.io/docs/getting-started/installation/
 *
 * Run safely through the wrapper:
 *   node scripts/perf-k6-run.mjs --base-url https://staging.example.com --profile smoke
 *   node scripts/perf-k6-run.mjs --base-url https://staging.example.com --profile baseline_100
 *
 * Run against production only after operations approval:
 *   LOAD_TEST_APPROVED_PRODUCTION=true node scripts/perf-k6-run.mjs --base-url https://portal.maiprop.co --profile baseline_100
 *
 * Scenarios exercise:
 *   - Home page
 *   - Listings index
 *   - Auctions index
 *   - Pricing page
 *   - Public listings API
 *   - Public open-houses API
 *   - Dynamic sitemap
 *
 * Thresholds:
 *   - p(95) < 2500 ms across all endpoints
 *   - error rate < 1%
 *
 * Profiles:
 *   - smoke: quick local/staging sanity check
 *   - baseline_100: ECAS baseline, 100 concurrent VUs
 *   - growth_10x: ECAS 10x target, 1,000 concurrent VUs
 *   - enterprise_soak: sustained regression window
 *
 * If a threshold fails, k6 exits non-zero.
 */
// @ts-nocheck - k6 runs in its own runtime with its own globals.
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const SUPPORTED_LOAD_PROFILES = ["smoke", "baseline_100", "growth_10x", "enterprise_soak"];

const LOAD_PROFILES = {
  smoke: [
    { duration: "10s", target: 5 },
    { duration: "20s", target: 10 },
    { duration: "10s", target: 0 },
  ],
  baseline_100: [
    { duration: "30s", target: 20 },
    { duration: "1m", target: 100 },
    { duration: "30s", target: 0 },
  ],
  growth_10x: [
    { duration: "2m", target: 250 },
    { duration: "5m", target: 1000 },
    { duration: "2m", target: 0 },
  ],
  enterprise_soak: [
    { duration: "5m", target: 100 },
    { duration: "30m", target: 250 },
    { duration: "5m", target: 0 },
  ],
};

const LOAD_TEST_APPROVED_PRODUCTION = __ENV.LOAD_TEST_APPROVED_PRODUCTION === "true";
const LOAD_TEST_SUMMARY_DIR = (__ENV.LOAD_TEST_SUMMARY_DIR || ".").replace(/\/$/, "");
const BASE_URL = normalizeBaseUrl(requireEnv("BASE_URL"));
const ECAS_LOAD_PROFILE = requireLoadProfile(requireEnv("ECAS_LOAD_PROFILE"));
const selectedStages = LOAD_PROFILES[ECAS_LOAD_PROFILE];

if (isProductionHost(hostnameFromUrl(BASE_URL)) && !LOAD_TEST_APPROVED_PRODUCTION) {
  throw new Error("Production load tests require LOAD_TEST_APPROVED_PRODUCTION=true");
}

export const errorRate = new Rate("errors");

export const options = {
  scenarios: {
    browse: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: selectedStages,
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<2500"],
    errors: ["rate<0.01"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const routes = [
    { name: "home", url: `${BASE_URL}/` },
    { name: "listings", url: `${BASE_URL}/listings` },
    { name: "auctions", url: `${BASE_URL}/auctions` },
    { name: "pricing", url: `${BASE_URL}/pricing` },
    { name: "api_listings", url: `${BASE_URL}/api/public/listings?limit=24` },
    { name: "api_open_houses", url: `${BASE_URL}/api/public/open-houses?limit=24` },
    { name: "sitemap", url: `${BASE_URL}/sitemap-dynamic.xml` },
  ];

  for (const route of routes) {
    const res = http.get(route.url, { tags: { route: route.name } });
    const ok = check(res, {
      [`${route.name}: status 2xx`]: (response) => response.status >= 200 && response.status < 300,
      [`${route.name}: TTFB < 1500ms`]: (response) => response.timings.waiting < 1500,
    });
    errorRate.add(ok ? 0 : 1);
    sleep(0.5);
  }
}

export function handleSummary(data) {
  return {
    stdout: textSummary(normalizeSummary(data)),
    [artifactPath("load-test-summary.json")]: JSON.stringify(normalizeSummary(data), null, 2),
    [artifactPath("load-test-raw-summary.json")]: JSON.stringify(data, null, 2),
  };
}

function requireEnv(name) {
  const value = (__ENV[name] || "").trim();
  if (!value) throw new Error(`${name} is required for load tests`);
  return value;
}

function requireLoadProfile(profile) {
  if (!SUPPORTED_LOAD_PROFILES.includes(profile)) {
    throw new Error(`ECAS_LOAD_PROFILE must be one of: ${SUPPORTED_LOAD_PROFILES.join(", ")}`);
  }
  return profile;
}

function normalizeBaseUrl(value) {
  if (!/^https?:\/\//.test(value)) {
    throw new Error("BASE_URL must use http or https");
  }
  return value.replace(/\/+$/, "");
}

function isProductionHost(hostname) {
  return hostname === "maiprop.co" || hostname.endsWith(".maiprop.co");
}

function hostnameFromUrl(value) {
  return value.replace(/^https?:\/\//, "").split("/")[0].split(":")[0].toLowerCase();
}

function artifactPath(name) {
  if (!LOAD_TEST_SUMMARY_DIR || LOAD_TEST_SUMMARY_DIR === ".") return name;
  return `${LOAD_TEST_SUMMARY_DIR}/${name}`;
}

function metricValue(data, metricName, valueName) {
  const value = data.metrics?.[metricName]?.values?.[valueName];
  return typeof value === "number" ? value : null;
}

function normalizeSummary(data) {
  const durationP95 = metricValue(data, "http_req_duration", "p(95)");
  const failedRate = metricValue(data, "http_req_failed", "rate");
  const errorsRate = metricValue(data, "errors", "rate");
  const totalRequests = metricValue(data, "http_reqs", "count");
  const peakVus = metricValue(data, "vus_max", "max");
  const iterations = metricValue(data, "iterations", "count");

  const thresholdResults = [
    {
      name: "http_req_duration_p95_ms",
      actual: durationP95,
      budget: 2500,
      passed: typeof durationP95 === "number" && durationP95 < 2500,
    },
    {
      name: "http_req_failed_rate",
      actual: failedRate,
      budget: 0.01,
      passed: typeof failedRate === "number" && failedRate < 0.01,
    },
    {
      name: "errors_rate",
      actual: errorsRate,
      budget: 0.01,
      passed: typeof errorsRate === "number" && errorsRate < 0.01,
    },
  ];

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    tool: "k6",
    profile: ECAS_LOAD_PROFILE,
    baseUrl: BASE_URL,
    productionHost: isProductionHost(hostnameFromUrl(BASE_URL)),
    productionApproved: LOAD_TEST_APPROVED_PRODUCTION,
    summaryType: "normalized",
    status: thresholdResults.every((threshold) => threshold.passed) ? "passed" : "failed",
    traffic: {
      totalRequests,
      peakVus,
      iterations,
    },
    thresholds: thresholdResults,
  };
}

function textSummary(summary) {
  const line = (key, value) => `${key.padEnd(30)} ${value}`;
  const thresholdLine = (threshold) => {
    const actual = threshold.actual === null ? "missing" : threshold.actual.toFixed(threshold.name.endsWith("_rate") ? 4 : 0);
    return line(threshold.name, `${actual} <= ${threshold.budget} ${threshold.passed ? "PASS" : "FAIL"}`);
  };

  return [
    "",
    "----- Load test summary -----",
    line("Status", summary.status),
    line("Profile", summary.profile),
    line("Base URL", summary.baseUrl),
    line("Production host", String(summary.productionHost)),
    line("Production approved", String(summary.productionApproved)),
    line("VUs peak", summary.traffic.peakVus ?? "missing"),
    line("Total requests", summary.traffic.totalRequests ?? "missing"),
    ...summary.thresholds.map(thresholdLine),
    "-----------------------------",
    "",
  ].join("\n");
}
