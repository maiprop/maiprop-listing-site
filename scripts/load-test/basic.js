/**
 * k6 load test — baseline scenario.
 *
 * Install k6: https://k6.io/docs/getting-started/installation/
 *
 * Run locally against staging:
 *   BASE_URL=https://staging--maiprop.netlify.app k6 run scripts/load-test/basic.js
 *
 * Run against production (off-hours only, after ops confirmation):
 *   BASE_URL=https://maiprop.co k6 run scripts/load-test/basic.js
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
 * If a threshold fails, k6 exits non-zero.
 */
// @ts-nocheck — k6 runs in its own runtime with its own globals.
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "https://staging--maiprop.netlify.app";

export const errorRate = new Rate("errors");

export const options = {
  scenarios: {
    browse: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 20 },   // ramp up
        { duration: "1m",  target: 100 },  // sustained 100 concurrent VUs
        { duration: "30s", target: 0 },    // ramp down
      ],
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
