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
import {
  LOAD_TEST_ROUTES,
  normalizeSummary,
  routeMetricName,
  textSummary,
} from "./summary.js";

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
const PRODUCTION_HOST = isProductionHost(hostnameFromUrl(BASE_URL));
const LOAD_TEST_ABORT_ON_FAIL =
  __ENV.LOAD_TEST_ABORT_ON_FAIL === "true" ||
  (PRODUCTION_HOST && (ECAS_LOAD_PROFILE === "growth_10x" || ECAS_LOAD_PROFILE === "enterprise_soak"));
const DURATION_P95_THRESHOLD = "p(95)<2500";
const RATE_THRESHOLD = "rate<0.01";
const selectedStages = LOAD_PROFILES[ECAS_LOAD_PROFILE];

if (PRODUCTION_HOST && !LOAD_TEST_APPROVED_PRODUCTION) {
  throw new Error("Production load tests require LOAD_TEST_APPROVED_PRODUCTION=true");
}

export const errorRate = new Rate("errors");

function threshold(expression) {
  return LOAD_TEST_ABORT_ON_FAIL
    ? [{ threshold: expression, abortOnFail: true, delayAbortEval: "2m" }]
    : [expression];
}

function routeThresholds(metricName, expression) {
  const entries = {};
  for (const route of LOAD_TEST_ROUTES) {
    entries[routeMetricName(metricName, route.name)] = threshold(expression);
  }
  return entries;
}

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
    http_req_duration: threshold(DURATION_P95_THRESHOLD),
    errors: threshold(RATE_THRESHOLD),
    http_req_failed: threshold(RATE_THRESHOLD),
    ...routeThresholds("http_req_duration", DURATION_P95_THRESHOLD),
    ...routeThresholds("errors", RATE_THRESHOLD),
    ...routeThresholds("http_req_failed", RATE_THRESHOLD),
  },
};

export default function () {
  for (const route of LOAD_TEST_ROUTES) {
    const res = http.get(`${BASE_URL}${route.path}`, { tags: { route: route.name } });
    const statusOk = check(res, {
      [`${route.name}: status 2xx`]: (response) => response.status >= 200 && response.status < 300,
    });
    check(res, {
      [`${route.name}: TTFB < 1500ms`]: (response) => response.timings.waiting < 1500,
    });
    errorRate.add(statusOk ? 0 : 1, { route: route.name });
    sleep(0.5);
  }
}

export function handleSummary(data) {
  const summary = normalizeSummary(data, {
    profile: ECAS_LOAD_PROFILE,
    baseUrl: BASE_URL,
    productionHost: PRODUCTION_HOST,
    productionApproved: LOAD_TEST_APPROVED_PRODUCTION,
    abortOnFailEnabled: LOAD_TEST_ABORT_ON_FAIL,
  });

  return {
    stdout: textSummary(summary),
    [artifactPath("load-test-summary.json")]: JSON.stringify(summary, null, 2),
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
