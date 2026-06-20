export const LOAD_TEST_ROUTES = [
  { name: "home", path: "/" },
  { name: "listings", path: "/listings" },
  { name: "auctions", path: "/auctions" },
  { name: "pricing", path: "/pricing" },
  { name: "api_listings", path: "/api/public/listings?limit=24" },
  { name: "api_open_houses", path: "/api/public/open-houses?limit=24" },
  { name: "sitemap", path: "/sitemap-dynamic.xml" },
];

export const LOAD_TEST_BUDGETS = {
  httpReqDurationP95Ms: 2500,
  httpReqFailedRate: 0.01,
  errorsRate: 0.01,
};

export function routeMetricName(metricName, routeName) {
  return `${metricName}{route:${routeName}}`;
}

function metricValue(data, metricName, valueName) {
  const value = data.metrics?.[metricName]?.values?.[valueName];
  return typeof value === "number" ? value : null;
}

function threshold(name, actual, budget) {
  return {
    name,
    actual,
    budget,
    passed: typeof actual === "number" && actual < budget,
  };
}

function routeStatus(thresholds) {
  if (thresholds.every((item) => item.actual === null)) return "not_recorded";
  return thresholds.every((item) => item.passed) ? "passed" : "failed";
}

function routeUrl(baseUrl, path) {
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function routeSummary(data, route, baseUrl) {
  const thresholds = [
    threshold(
      "http_req_duration_p95_ms",
      metricValue(data, routeMetricName("http_req_duration", route.name), "p(95)"),
      LOAD_TEST_BUDGETS.httpReqDurationP95Ms,
    ),
    threshold(
      "http_req_failed_rate",
      metricValue(data, routeMetricName("http_req_failed", route.name), "rate"),
      LOAD_TEST_BUDGETS.httpReqFailedRate,
    ),
    threshold(
      "errors_rate",
      metricValue(data, routeMetricName("errors", route.name), "rate"),
      LOAD_TEST_BUDGETS.errorsRate,
    ),
  ];

  return {
    name: route.name,
    path: route.path,
    url: routeUrl(baseUrl, route.path),
    status: routeStatus(thresholds),
    traffic: {
      totalRequests: metricValue(data, routeMetricName("http_reqs", route.name), "count"),
    },
    thresholds,
  };
}

export function normalizeSummary(data, context = {}) {
  const durationP95 = metricValue(data, "http_req_duration", "p(95)");
  const failedRate = metricValue(data, "http_req_failed", "rate");
  const errorsRate = metricValue(data, "errors", "rate");
  const totalRequests = metricValue(data, "http_reqs", "count");
  const peakVus = metricValue(data, "vus_max", "max");
  const iterations = metricValue(data, "iterations", "count");

  const thresholdResults = [
    threshold("http_req_duration_p95_ms", durationP95, LOAD_TEST_BUDGETS.httpReqDurationP95Ms),
    threshold("http_req_failed_rate", failedRate, LOAD_TEST_BUDGETS.httpReqFailedRate),
    threshold("errors_rate", errorsRate, LOAD_TEST_BUDGETS.errorsRate),
  ];
  const routes = LOAD_TEST_ROUTES.map((route) => routeSummary(data, route, context.baseUrl));
  const failedRoutes = routes.filter((route) => route.status === "failed").map((route) => route.name);

  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    tool: "k6",
    profile: context.profile ?? null,
    baseUrl: context.baseUrl ?? null,
    productionHost: Boolean(context.productionHost),
    productionApproved: Boolean(context.productionApproved),
    abortOnFailEnabled: Boolean(context.abortOnFailEnabled),
    summaryType: "normalized",
    status: thresholdResults.every((item) => item.passed) && failedRoutes.length === 0 ? "passed" : "failed",
    traffic: {
      totalRequests,
      peakVus,
      iterations,
    },
    thresholds: thresholdResults,
    failedRoutes,
    routes,
  };
}

export function textSummary(summary) {
  const line = (key, value) => `${key.padEnd(30)} ${value}`;
  const thresholdLine = (item) => {
    const actual = item.actual === null ? "missing" : item.actual.toFixed(item.name.endsWith("_rate") ? 4 : 0);
    return line(item.name, `${actual} <= ${item.budget} ${item.passed ? "PASS" : "FAIL"}`);
  };
  const failedRoutes = summary.failedRoutes?.length ? summary.failedRoutes.join(", ") : "none";

  return [
    "",
    "----- Load test summary -----",
    line("Status", summary.status),
    line("Profile", summary.profile ?? "missing"),
    line("Base URL", summary.baseUrl ?? "missing"),
    line("Production host", String(summary.productionHost)),
    line("Production approved", String(summary.productionApproved)),
    line("Abort on fail", String(summary.abortOnFailEnabled)),
    line("VUs peak", summary.traffic.peakVus ?? "missing"),
    line("Total requests", summary.traffic.totalRequests ?? "missing"),
    line("Failed routes", failedRoutes),
    ...summary.thresholds.map(thresholdLine),
    "-----------------------------",
    "",
  ].join("\n");
}
