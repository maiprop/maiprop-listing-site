import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkOpenApiCoverage, extractOpenApiPaths } from "./check-openapi-coverage.mjs";

const makeFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "maiprop-openapi-coverage-"));
  mkdirSync(join(root, "docs", "api"), { recursive: true });
  writeFileSync(
    join(root, "docs", "public-edge-function-inventory.json"),
    JSON.stringify({
      public_function_count: 2,
      entries: [{ name: "ai-search" }, { name: "record-listing-view" }],
    }),
  );
  writeFileSync(
    join(root, "docs", "api", "edge-functions.openapi.yaml"),
      [
        "openapi: 3.0.3",
        "components:",
        "  schemas:",
        "    Error:",
        "      type: object",
        "      required: [error]",
        "      properties:",
        "        error:",
        "          type: string",
        "        code:",
        "          type: string",
      "        issues:",
      "          type: array",
      "          items:",
      "            type: object",
      "paths:",
      "  /ai-search:",
      "    post:",
      "      operationId: aiSearch",
      "  /record-listing-view:",
      "    post:",
      "      operationId: recordListingView",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "docs", "api", "README.md"),
    [
      "# API Documentation",
      "npm run check:openapi-coverage",
      "Update docs/api/edge-functions.openapi.yaml",
    ].join("\n"),
  );
  return root;
};

describe("OpenAPI coverage check", () => {
  it("extracts top-level OpenAPI path names", () => {
    const paths = extractOpenApiPaths(["paths:", "  /ai-search:", "    post:", "  /healthz:"].join("\n"));

    expect(paths).toEqual(["ai-search", "healthz"]);
  });

  it("accepts OpenAPI docs that cover every public edge function", () => {
    const result = checkOpenApiCoverage(makeFixture());

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails when a public edge function is missing from OpenAPI", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "docs", "api", "edge-functions.openapi.yaml"),
      ["openapi: 3.0.3", "paths:", "  /ai-search:", "    post:"].join("\n"),
    );

    const result = checkOpenApiCoverage(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("record-listing-view");
  });

  it("fails when the OpenAPI Error schema does not require error", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "docs", "api", "edge-functions.openapi.yaml"),
      [
        "openapi: 3.0.3",
        "components:",
        "  schemas:",
        "    Error:",
        "      type: object",
        "      properties:",
        "        error:",
        "          type: string",
        "        code:",
        "          type: string",
        "        issues:",
        "          type: array",
        "paths:",
        "  /ai-search:",
        "    post:",
        "      operationId: aiSearch",
        "  /record-listing-view:",
        "    post:",
        "      operationId: recordListingView",
      ].join("\n"),
    );

    const result = checkOpenApiCoverage(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("OpenAPI Error schema must require error");
  });

  it("fails when the OpenAPI Error schema omits optional machine-readable code", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "docs", "api", "edge-functions.openapi.yaml"),
      [
        "openapi: 3.0.3",
        "components:",
        "  schemas:",
        "    Error:",
        "      type: object",
        "      required: [error]",
        "      properties:",
        "        error:",
        "          type: string",
        "        issues:",
        "          type: array",
        "          items:",
        "            type: object",
        "paths:",
        "  /ai-search:",
        "    post:",
        "      operationId: aiSearch",
        "  /record-listing-view:",
        "    post:",
        "      operationId: recordListingView",
      ].join("\n"),
    );

    const result = checkOpenApiCoverage(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("OpenAPI Error schema must document optional code");
  });

  it("fails when the OpenAPI Error schema requires code before all endpoints conform", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "docs", "api", "edge-functions.openapi.yaml"),
      [
        "openapi: 3.0.3",
        "components:",
        "  schemas:",
        "    Error:",
        "      type: object",
        "      required: [error, code]",
        "      properties:",
        "        error:",
        "          type: string",
        "        code:",
        "          type: string",
        "        issues:",
        "          type: array",
        "          items:",
        "            type: object",
        "paths:",
        "  /ai-search:",
        "    post:",
        "      operationId: aiSearch",
        "  /record-listing-view:",
        "    post:",
        "      operationId: recordListingView",
      ].join("\n"),
    );

    const result = checkOpenApiCoverage(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("must not require code");
  });

  it("fails when the OpenAPI Error schema omits validation issues", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "docs", "api", "edge-functions.openapi.yaml"),
      [
        "openapi: 3.0.3",
        "components:",
      "  schemas:",
      "    Error:",
      "      type: object",
      "      required: [error]",
      "      properties:",
      "        error:",
          "          type: string",
        "        code:",
        "          type: string",
        "paths:",
        "  /ai-search:",
        "    post:",
        "      operationId: aiSearch",
        "  /record-listing-view:",
        "    post:",
        "      operationId: recordListingView",
      ].join("\n"),
    );

    const result = checkOpenApiCoverage(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("OpenAPI Error schema must document issues");
  });
});
