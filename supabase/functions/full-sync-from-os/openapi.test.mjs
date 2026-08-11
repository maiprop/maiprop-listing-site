import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import yaml from "npm:js-yaml@4.2.0";

const document = yaml.load(readFileSync(
  new URL("../../../docs/api/edge-functions.openapi.yaml", import.meta.url),
  "utf8",
));

const operation = (path, method = "post") => {
  const value = document.paths?.[path]?.[method];
  assert.ok(value, `${method.toUpperCase()} ${path} must be documented`);
  return value;
};

const requestSchema = (path) => {
  const schema = operation(path).requestBody?.content?.["application/json"]
    ?.schema;
  assert.ok(schema, `${path} must document its JSON request body`);
  if (!schema.$ref) return schema;
  const name = schema.$ref.split("/").at(-1);
  const resolved = document.components?.schemas?.[name];
  assert.ok(resolved, `${schema.$ref} must resolve`);
  return resolved;
};

test("OS and role-switch methods and authentication match runtime handlers", () => {
  assert.deepEqual(operation("/full-sync-from-os").security, [{
    SupabaseJWT: [],
  }]);
  assert.deepEqual(operation("/poll-os-auctions").security, [
    { CronBearer: [] },
    { SupabaseJWT: [] },
  ]);
  assert.equal(document.paths["/poll-os-auctions"].get, undefined);
  assert.deepEqual(operation("/fetch-report-from-os").security, [{
    SupabaseJWT: [],
  }]);
  assert.equal(document.paths["/fetch-report-from-os"].get, undefined);
  assert.deepEqual(operation("/begin-role-switch").security, [{
    SupabaseJWT: [],
  }]);
  assert.deepEqual(operation("/log-role-switch").security, [{
    SupabaseJWT: [],
  }]);
  assert.deepEqual(operation("/reconcile-role-switch-billing").security, [{
    CronSecretHeader: [],
  }]);
});

test("OpenAPI request bodies preserve exact identifier and closed-object contracts", () => {
  const fullSync = requestSchema("/full-sync-from-os");
  assert.equal(fullSync.additionalProperties, false);
  assert.deepEqual(fullSync.properties.prefectureId, {
    type: "integer",
    format: "int64",
    minimum: -9007199254740991,
    maximum: 9007199254740991,
  });

  const poll = requestSchema("/poll-os-auctions");
  assert.equal(poll.additionalProperties, false);
  assert.equal(poll.properties.propertyMunicipalityId.type, "integer");
  assert.equal(poll.properties.propertyMunicipalityId.format, "int64");

  const report = requestSchema("/fetch-report-from-os");
  assert.deepEqual(report.required, ["listing_id", "report_type"]);
  assert.equal(report.additionalProperties, false);
  assert.equal(report.properties.listing_id.format, "uuid");

  const logRoleSwitch = requestSchema("/log-role-switch");
  assert.deepEqual(logRoleSwitch.required, [
    "operation_id",
    "from_type",
    "cancel_subscription",
  ]);
  assert.equal(logRoleSwitch.additionalProperties, false);
  assert.equal(logRoleSwitch.properties.operation_id.format, "uuid");
  assert.deepEqual(logRoleSwitch.properties.cancel_subscription.enum, [true]);

  const beginRoleSwitch = requestSchema("/begin-role-switch");
  assert.equal(beginRoleSwitch.oneOf.length, 5);
  for (const alternative of beginRoleSwitch.oneOf) {
    assert.equal(alternative.additionalProperties, false);
  }
});

test("OpenAPI response statuses exactly match every reachable runtime status", () => {
  const expectedStatuses = {
    "/full-sync-from-os": [
      "200",
      "400",
      "401",
      "403",
      "405",
      "408",
      "413",
      "429",
      "500",
      "502",
    ],
    "/poll-os-auctions": [
      "200",
      "400",
      "401",
      "403",
      "405",
      "408",
      "413",
      "429",
      "500",
    ],
    "/fetch-report-from-os": [
      "200",
      "202",
      "400",
      "401",
      "402",
      "404",
      "405",
      "408",
      "413",
      "429",
      "500",
      "503",
    ],
    "/begin-role-switch": [
      "200",
      "400",
      "401",
      "405",
      "408",
      "413",
      "429",
      "503",
    ],
    "/log-role-switch": [
      "200",
      "400",
      "401",
      "405",
      "408",
      "413",
      "429",
      "500",
      "502",
      "503",
    ],
    "/reconcile-role-switch-billing": [
      "200",
      "401",
      "405",
      "500",
      "503",
      "504",
    ],
  };

  for (const [path, expected] of Object.entries(expectedStatuses)) {
    assert.deepEqual(
      Object.keys(operation(path).responses).sort(),
      expected.toSorted(),
      `${path} response status contract drifted from its runtime handler`,
    );
  }
});
