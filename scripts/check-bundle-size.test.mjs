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
import { budgetKeyFor, BUDGETS_KB } from "./check-bundle-size.mjs";

describe("budgetKeyFor — Vite 7 (base64url hash)", () => {
  // Real filenames from the April 2026 production build.
  it("maps index-<base64>.js to 'index'", () => {
    expect(budgetKeyFor("index-miSS4154.js")).toBe("index");
    expect(budgetKeyFor("index-CzAxYJTy.js")).toBe("index");
  });

  it("maps vendor-charts-<base64>.js to 'vendor-charts'", () => {
    expect(budgetKeyFor("vendor-charts-DiLdui5R.js")).toBe("vendor-charts");
  });

  it("maps named manual chunks with mixed-case hashes", () => {
    expect(budgetKeyFor("vendor-react-AbCdEfGh.js")).toBe("vendor-react");
    expect(budgetKeyFor("vendor-ui-ZyXwVuTs.js")).toBe("vendor-ui");
    expect(budgetKeyFor("vendor-motion-0123abCD.js")).toBe("vendor-motion");
    expect(budgetKeyFor("vendor-icons-QwErTyUi.js")).toBe("vendor-icons");
  });

  it("tolerates `_` and `-` in the hash alphabet (base64url)", () => {
    expect(budgetKeyFor("vendor-react-_Ab-Cd_E.js")).toBe("vendor-react");
  });

  it("falls through to '*' for unknown chunks", () => {
    expect(budgetKeyFor("mapbox-gl-DOAvebQf.js")).toBe("*");
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
});
