import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routesPath = resolve(process.cwd(), "public/_routes.json");

describe("Cloudflare Pages function routes", () => {
  it("routes public API and middleware paths through Pages Functions before SPA fallback", () => {
    const routes = JSON.parse(readFileSync(routesPath, "utf8"));

    expect(routes).toMatchObject({ version: 1 });
    expect(routes.include).toEqual(["/*"]);
    expect(routes.exclude ?? []).not.toContain("/api/*");
    expect(routes.exclude ?? []).not.toContain("/api/public/*");
    expect(routes.exclude ?? []).not.toContain("/sitemap-dynamic.xml");
    expect(routes.exclude ?? []).not.toContain("/__unlock");
  });
});
