/**
 * Regression tests for the bundle-size guard's filename→budget mapping.
 *
 * The previous implementation only accepted lowercase-hex hashes
 * (`[a-f0-9]`), which silently stopped matching any chunk after Vite 7
 * switched to Rollup's base64url alphabet. That meant every chunk fell
 * through to the `*` catch-all budget (1500 KB) and the per-chunk budgets
 * (index = 600, vendor-react = 180, …) were effectively inactive. These
 * tests pin the fix against both old and new hash formats.
 */
import { describe, it, expect } from "vitest";
import { budgetKeyFor, BUDGETS_KB, forbiddenInitialPreloads, modulePreloadHrefs } from "./check-bundle-size.mjs";

describe("budgetKeyFor — Vite 7 (base64url hash)", () => {
  // Real filenames from the April 2026 production build.
  it("maps index-<base64>.js to 'index'", () => {
    expect(budgetKeyFor("index-miSS4154.js")).toBe("index");
    expect(budgetKeyFor("index-CzAxYJTy.js")).toBe("index");
  });

  it("maps vendor-charts-<base64>.js to 'vendor-charts'", () => {
    expect(budgetKeyFor("vendor-charts-DiLdui5R.js")).toBe("vendor-charts");
  });

  it("maps lazy chart auto-chunks to 'vendor-charts'", () => {
    expect(budgetKeyFor("recharts-DiLdui5R.js")).toBe("vendor-charts");
    expect(budgetKeyFor("d3-array-AbCdEf12.js")).toBe("vendor-charts");
    expect(budgetKeyFor("BarChart-BJpoPrMY.js")).toBe("vendor-charts");
  });

  it("maps lazy Mapbox chunks to 'vendor-mapbox'", () => {
    expect(budgetKeyFor("mapbox-gl-DOAvebQf.js")).toBe("vendor-mapbox");
    expect(budgetKeyFor("react-map-gl-AbCdEf12.js")).toBe("vendor-mapbox");
  });

  it("maps named manual chunks with mixed-case hashes", () => {
    expect(budgetKeyFor("vendor-react-AbCdEfGh.js")).toBe("vendor-react");
    expect(budgetKeyFor("vendor-radix-ZyXwVuTs.js")).toBe("vendor-radix");
    expect(budgetKeyFor("vendor-motion-0123abCD.js")).toBe("vendor-motion");
    expect(budgetKeyFor("vendor-icons-QwErTyUi.js")).toBe("vendor-icons");
  });

  it("maps multi-segment chunk names like vendor-ui-extra correctly", () => {
    // Exercises the leftward-walk logic: the rightmost dash precedes the
    // hash (`AbCdEf12`), the next dash precedes `extra`, and only at the
    // third dash do we land on a known budget key (`vendor-ui-extra`).
    expect(budgetKeyFor("vendor-ui-extra-AbCdEf12.js")).toBe("vendor-ui-extra");
  });

  it("tolerates `_` and `-` in the hash alphabet (base64url)", () => {
    expect(budgetKeyFor("vendor-react-_Ab-Cd_E.js")).toBe("vendor-react");
  });

  it("falls through to '*' for unknown chunks", () => {
    expect(budgetKeyFor("some-third-party-AbCdEf12.js")).toBe("*");
  });
});

describe("budgetKeyFor — Vite 6 back-compat (lowercase hex)", () => {
  it("still maps old lowercase-hex hashes", () => {
    expect(budgetKeyFor("index-a1b2c3d4.js")).toBe("index");
    expect(budgetKeyFor("vendor-react-deadbeef.js")).toBe("vendor-react");
    expect(budgetKeyFor("vendor-charts-123456abc.js")).toBe("vendor-charts");
  });
});

describe("budgetKeyFor — edge cases", () => {
  it("treats hashes shorter than 6 chars as non-hashes", () => {
    // Under the 6-char minimum → the `-ab12` suffix isn't stripped,
    // so the base has a trailing unknown segment and falls through to '*'.
    expect(budgetKeyFor("weird-ab12.js")).toBe("*");
  });

  it("falls through to '*' for an unhashed bare filename", () => {
    // `index.js` has no hash suffix and no "index-" prefix, so the existing
    // startsWith guard in budgetKeyFor does not kick in. This pins the
    // current behaviour; production builds always emit hashed filenames.
    expect(budgetKeyFor("index.js")).toBe("*");
  });

  it("honours a caller-supplied budgets map", () => {
    const custom = { "custom-chunk": 100, "*": 999 };
    expect(budgetKeyFor("custom-chunk-AbCdEf12.js", custom)).toBe("custom-chunk");
    expect(budgetKeyFor("unrelated-AbCdEf12.js", custom)).toBe("*");
  });
});

describe("BUDGETS_KB invariants", () => {
  it("has a catch-all '*' entry", () => {
    expect(BUDGETS_KB["*"]).toBeTypeOf("number");
    expect(BUDGETS_KB["*"]).toBeGreaterThan(0);
  });

  it("has an 'index' budget — the initial entry chunk cannot fall through", () => {
    expect(BUDGETS_KB["index"]).toBeTypeOf("number");
  });

  it("has explicit budgets for lazy Mapbox and chart chunks", () => {
    expect(BUDGETS_KB["vendor-mapbox"]).toBeTypeOf("number");
    expect(BUDGETS_KB["vendor-charts"]).toBeTypeOf("number");
  });
});

describe("initial preload guards", () => {
  it("extracts Vite modulepreload hrefs from index.html", () => {
    const html = `
      <link rel="modulepreload" crossorigin href="/assets/vendor-react-AbCdEf12.js">
      <link crossorigin href="/assets/not-a-preload-AbCdEf12.js">
      <link href="/assets/index-AbCdEf12.js" rel="modulepreload">
    `;

    expect(modulePreloadHrefs(html)).toEqual([
      "/assets/vendor-react-AbCdEf12.js",
      "/assets/index-AbCdEf12.js",
    ]);
  });

  it("flags chart and map chunks that leak into initial modulepreloads", () => {
    const html = `
      <link rel="modulepreload" href="/assets/recharts-DiLdui5R.js">
      <link rel="modulepreload" href="/assets/LazyRecharts-DncSVfaD.js">
      <link rel="modulepreload" href="/assets/d3-array-AbCdEf12.js">
      <link rel="modulepreload" href="/assets/mapbox-gl-DOAvebQf.js">
      <link rel="modulepreload" href="/assets/vendor-react-AbCdEf12.js">
    `;

    expect(forbiddenInitialPreloads(html)).toEqual([
      "/assets/recharts-DiLdui5R.js",
      "/assets/LazyRecharts-DncSVfaD.js",
      "/assets/d3-array-AbCdEf12.js",
      "/assets/mapbox-gl-DOAvebQf.js",
    ]);
  });

  it("allows chart and map chunks to exist when they are not initial preloads", () => {
    const html = `
      <script type="module" crossorigin src="/assets/index-AbCdEf12.js"></script>
      <link rel="modulepreload" href="/assets/vendor-react-AbCdEf12.js">
    `;

    expect(forbiddenInitialPreloads(html)).toEqual([]);
  });
});
