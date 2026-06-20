import { describe, expect, it } from "vitest";
import {
  LOAD_TEST_ROUTES,
  normalizeSummary,
  routeMetricName,
  textSummary,
} from "./summary.js";

const context = {
  profile: "growth_10x",
  baseUrl: "https://portal.maiprop.co",
  productionHost: true,
  productionApproved: true,
  abortOnFailEnabled: true,
};

const metric = (values) => ({ values });

describe("k6 load summary normalization", () => {
  it("records route-level threshold status for the public API bottleneck", () => {
    const data = {
      metrics: {
        http_req_duration: metric({ "p(95)": 2524.6472 }),
        http_req_failed: metric({ rate: 0.19815707417290193 }),
        errors: metric({ rate: 0.44492192486065607 }),
        http_reqs: metric({ count: 164521 }),
        vus_max: metric({ max: 1000 }),
        iterations: metric({ count: 23503 }),
        [routeMetricName("http_req_duration", "api_listings")]: metric({ "p(95)": 2600 }),
        [routeMetricName("http_req_failed", "api_listings")]: metric({ rate: 0.32 }),
        [routeMetricName("errors", "api_listings")]: metric({ rate: 0.64 }),
        [routeMetricName("http_reqs", "api_listings")]: metric({ count: 5000 }),
        [routeMetricName("http_req_duration", "home")]: metric({ "p(95)": 120 }),
        [routeMetricName("http_req_failed", "home")]: metric({ rate: 0 }),
        [routeMetricName("errors", "home")]: metric({ rate: 0 }),
        [routeMetricName("http_reqs", "home")]: metric({ count: 3000 }),
      },
    };

    const summary = normalizeSummary(data, context);
    const apiListings = summary.routes.find((route) => route.name === "api_listings");
    const home = summary.routes.find((route) => route.name === "home");

    expect(summary.status).toBe("failed");
    expect(summary.failedRoutes).toContain("api_listings");
    expect(summary.failedRoutes).not.toContain("home");
    expect(apiListings).toMatchObject({
      name: "api_listings",
      path: "/api/public/listings?limit=24",
      url: "https://portal.maiprop.co/api/public/listings?limit=24",
      status: "failed",
      traffic: { totalRequests: 5000 },
    });
    expect(apiListings.thresholds).toEqual([
      { name: "http_req_duration_p95_ms", actual: 2600, budget: 2500, passed: false },
      { name: "http_req_failed_rate", actual: 0.32, budget: 0.01, passed: false },
      { name: "errors_rate", actual: 0.64, budget: 0.01, passed: false },
    ]);
    expect(home.status).toBe("passed");
  });

  it("marks routes as not recorded when k6 does not emit tagged submetrics", () => {
    const summary = normalizeSummary({
      metrics: {
        http_req_duration: metric({ "p(95)": 100 }),
        http_req_failed: metric({ rate: 0 }),
        errors: metric({ rate: 0 }),
        http_reqs: metric({ count: 10 }),
        vus_max: metric({ max: 1 }),
        iterations: metric({ count: 1 }),
      },
    }, context);

    expect(summary.routes).toHaveLength(LOAD_TEST_ROUTES.length);
    expect(summary.routes.every((route) => route.status === "not_recorded")).toBe(true);
    expect(summary.failedRoutes).toEqual([]);
  });

  it("prints failed route names in the human summary", () => {
    const summary = normalizeSummary({
      metrics: {
        http_req_duration: metric({ "p(95)": 2525 }),
        http_req_failed: metric({ rate: 0.2 }),
        errors: metric({ rate: 0.4 }),
        http_reqs: metric({ count: 100 }),
        vus_max: metric({ max: 1000 }),
        iterations: metric({ count: 10 }),
        [routeMetricName("http_req_duration", "api_open_houses")]: metric({ "p(95)": 2600 }),
        [routeMetricName("http_req_failed", "api_open_houses")]: metric({ rate: 0.5 }),
        [routeMetricName("errors", "api_open_houses")]: metric({ rate: 0.5 }),
      },
    }, context);

    expect(textSummary(summary)).toContain("Failed routes");
    expect(textSummary(summary)).toContain("api_open_houses");
  });
});
