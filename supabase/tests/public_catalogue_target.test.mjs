import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertCompleteTapOutput,
  assertSafeCatalogueTarget,
} from "./public_catalogue_target.mjs";

const stagingRef = "xsiehskfgeoqyazcgauv";
const productionRef = "qvvicunqcrwpioqnvzxf";
const stagingApiUrl = `https://${stagingRef}.supabase.co`;
const stagingDatabaseUrl =
  `postgresql://postgres.${stagingRef}:password@aws-0-eu-west-3.pooler.supabase.com:5432/postgres?sslmode=require`;

describe("public catalogue destructive target guard", () => {
  it("accepts a TLS-isolated staging API and database pair", () => {
    assert.deepEqual(
      assertSafeCatalogueTarget({
        apiUrl: stagingApiUrl,
        databaseUrl: stagingDatabaseUrl,
        target: "staging",
        expectedStagingRef: stagingRef,
        productionRef,
      }),
      {
      target: "staging",
      apiProjectRef: stagingRef,
      databaseProjectRef: stagingRef,
      isLocal: false,
      },
    );
  });

  for (const scenario of [
    {
      label: "production API",
      apiUrl: `https://${productionRef}.supabase.co`,
      databaseUrl: stagingDatabaseUrl,
      expected: /API project ref/,
    },
    {
      label: "production database",
      apiUrl: stagingApiUrl,
      databaseUrl:
        `postgresql://postgres.${productionRef}:password@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require`,
      expected: /database project ref/,
    },
    {
      label: "API and database mismatch",
      apiUrl: stagingApiUrl,
      databaseUrl:
        "postgresql://postgres.aaaaaaaaaaaaaaaaaaaa:password@aws-0-eu-west-3.pooler.supabase.com:5432/postgres?sslmode=require",
      expected: /database project ref/,
    },
    {
      label: "malformed pooler identity",
      apiUrl: stagingApiUrl,
      databaseUrl:
        "postgresql://postgres:password@aws-0-eu-west-3.pooler.supabase.com:5432/postgres?sslmode=require",
      expected: /derive the database project ref/,
    },
    {
      label: "HTTP API",
      apiUrl: `http://${stagingRef}.supabase.co`,
      databaseUrl: stagingDatabaseUrl,
      expected: /HTTPS/,
    },
    {
      label: "database without TLS",
      apiUrl: stagingApiUrl,
      databaseUrl:
        `postgresql://postgres.${stagingRef}:password@aws-0-eu-west-3.pooler.supabase.com:5432/postgres`,
      expected: /TLS/,
    },
    {
      label: "missing production ref",
      apiUrl: stagingApiUrl,
      databaseUrl: stagingDatabaseUrl,
      productionRef: "",
      expected: /production project ref/,
    },
  ]) {
    it(`rejects ${scenario.label} before mutation`, () => {
      assert.throws(() =>
      assertSafeCatalogueTarget({
        apiUrl: scenario.apiUrl,
        databaseUrl: scenario.databaseUrl,
        target: "staging",
        expectedStagingRef: stagingRef,
        productionRef:
          scenario.productionRef === undefined
            ? productionRef
            : scenario.productionRef,
      }),
      scenario.expected);
    });
  }
});

describe("public catalogue TAP proof parser", () => {
  it("accepts exactly one complete TAP plan", () => {
    assert.deepEqual(
      assertCompleteTapOutput("ok 1 - reader\nok 2 - writer denied\n1..2\n"),
      { plan: 2, okCount: 2 },
    );
  });

  it("ignores psql column headers when counting TAP results", () => {
    assert.deepEqual(
      assertCompleteTapOutput(" ok\n----\n ok 1 - reader\n(1 row)\n\n1..1\n"),
      { plan: 1, okCount: 1 },
    );
  });

  it("rejects a TAP bailout", () => {
    assert.throws(
      () =>
        assertCompleteTapOutput(
          "ok 1 - setup\nBail out! database unavailable\n1..1\n",
        ),
      /Bail out/,
    );
  });

  it("rejects duplicate plans", () => {
    assert.throws(
      () => assertCompleteTapOutput("ok 1 - setup\n1..1\n1..1\n"),
      /exactly one TAP plan/,
    );
  });

  it("rejects plan and ok-count drift", () => {
    assert.throws(
      () => assertCompleteTapOutput("ok 1 - setup\n1..2\n"),
      /expected 2 ok results, received 1/,
    );
  });

  it("rejects not-ok results", () => {
    assert.throws(
      () => assertCompleteTapOutput("not ok 1 - writer leaked\n1..1\n"),
      /not ok/,
    );
  });
});
