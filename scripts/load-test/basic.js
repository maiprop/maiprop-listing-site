/**
 * k6 load test — baseline scenario.
 *
 * Install k6: https://k6.io/docs/getting-started/installation/
 *
 * Run locally against staging:
 *   BASE_URL=https://staging--maiprop.netlify.app ECAS_LOAD_PROFILE=baseline_100 k6 run scripts/load-test/basic.js
 *
 * Run against production (off-hours only, after ops confirmation):
 *   LOAD_TEST_APPROVED_PRODUCTION=true BASE_URL=https://portal.maiprop.co ECAS_LOAD_PROFILE=baseline_100 k6 run scripts/load-test/basic.js
 *
 * Scenarios exercise:
 *   - Home page (cold)
 *   - Listings index
 *   - Sitemap (edge-function proxied)
 *   - Public listings API
 *   - Public open-houses API
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
// @ts-nocheck — k6 runs in its own runtime with its own globals.
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "https://staging--maiprop.netlify.app";
const ECAS_LOAD_PROFILE = __ENV.ECAS_LOAD_PROFILE || "baseline_100";
const LOAD_TEST_APPROVED_PRODUCTION = __ENV.LOAD_TEST_APPROVED_PRODUCTION === "true";

const PRODUCTION_HOSTS = new Set(["maiprop.co", "www.maiprop.co", "portal.maiprop.co"]);

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

const selectedStages = LOAD_PROFILES[ECAS_LOAD_PROFILE];
if (!selectedStages) {
  throw new Error(`Unknown ECAS_LOAD_PROFILE: ${ECAS_LOAD_PROFILE}`);
}

const parsedBaseUrl = new URL(BASE_URL);
if (PRODUCTION_HOSTS.has(parsedBaseUrl.hostname) && !LOAD_TEST_APPROVED_PRODUCTION) {
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
    { name: "home",       url: `${BASE_URL}/` },
    { name: "listings",   url: `${BASE_URL}/listings` },
    { name: "auctions",   url: `${BASE_URL}/auctions` },
    { name: "pricing",    url: `${BASE_URL}/pricing` },
    { name: "api_listings", url: `${BASE_URL}/api/public/listings?limit=24` },
    { name: "api_open_houses", url: `${BASE_URL}/api/public/open-houses?limit=24` },
    { name: "sitemap",    url: `${BASE_URL}/sitemap-dynamic.xml` },
  ];

  for (const r of routes) {
    const res = http.get(r.url, { tags: { route: r.name } });
    const ok = check(res, {
      [`${r.name}: status 2xx`]: (r) => r.status >= 200 && r.status < 300,
      [`${r.name}: TTFB < 1500ms`]: (r) => r.timings.waiting < 1500,
    });
    if (!ok) errorRate.add(1);
    else errorRate.add(0);
    sleep(0.5);
  }
}

export function handleSummary(data) {
  // Emit both stdout and a JSON artefact for CI archival.
  return {
    stdout: textSummary(data),
    "load-test-summary.json": JSON.stringify(data, null, 2),
  };
}

function textSummary(data) {
  const m = data.metrics;
  const line = (k, v) => `${k.padEnd(30)} ${v}`;
  const p95 = (m.http_req_duration?.values?.["p(95)"] ?? 0).toFixed(0);
  const failRate = ((m.http_req_failed?.values?.rate ?? 0) * 100).toFixed(2);
  return [
    "",
    "──── Load test summary ────",
    line("VUs peak",             m.vus_max?.values?.max ?? "—"),
    line("Total requests",       m.http_reqs?.values?.count ?? "—"),
    line("Request duration p95", `${p95} ms`),
    line("Failed request rate",  `${failRate}%`),
    "───────────────────────────",
    "",
  ].join("\n");
}
