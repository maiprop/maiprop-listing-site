// PostgREST contract proof for temporal public-catalogue publications.
// Local:
//   PUBLIC_CATALOGUE_TEST_API_URL=http://127.0.0.1:54321
//   PUBLIC_CATALOGUE_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
//   PUBLIC_CATALOGUE_TEST_ANON_KEY=...
//   PUBLIC_CATALOGUE_TEST_SERVICE_ROLE_KEY=...
//   node supabase/tests/public_catalogue_postgrest_contract.mjs
//
// Remote execution is staging-only and also requires the staging/production
// refs. The staging TAP output is parsed before any service-role publication.

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import process from "node:process";
import {
  assertCompleteTapOutput,
  assertSafeCatalogueTarget,
} from "./public_catalogue_target.mjs";

const apiUrl = String(
  process.env.PUBLIC_CATALOGUE_TEST_API_URL ?? "",
).replace(/\/+$/, "");
const databaseUrl = process.env.PUBLIC_CATALOGUE_TEST_DATABASE_URL ?? "";
const anonKey = process.env.PUBLIC_CATALOGUE_TEST_ANON_KEY ?? "";
const serviceKey =
  process.env.PUBLIC_CATALOGUE_TEST_SERVICE_ROLE_KEY ?? "";
const psqlBin = process.env.PSQL_BIN ?? "psql";
const target = process.env.PUBLIC_CATALOGUE_TEST_TARGET ?? "local";
const pgtapPath =
  process.env.PUBLIC_CATALOGUE_TEST_PGTAP_FILE ??
  (target === "staging" ? "staging-public-catalogue-pgtap.txt" : "");

if (!apiUrl || !databaseUrl || !anonKey || !serviceKey) {
  console.error(
    "Set the catalogue test API URL, database URL, anonymous key, and service-role key.",
  );
  process.exit(2);
}

let targetEvidence;
try {
  targetEvidence = assertSafeCatalogueTarget({
    apiUrl,
    databaseUrl,
    target,
    expectedStagingRef:
      process.env.PUBLIC_CATALOGUE_TEST_STAGING_PROJECT_REF,
    productionRef:
      process.env.PUBLIC_CATALOGUE_TEST_PRODUCTION_PROJECT_REF,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

let pgtapEvidence = null;
if (pgtapPath) {
  pgtapEvidence = assertCompleteTapOutput(
    await readFile(pgtapPath, "utf8"),
  );
}

function authHeaders(key) {
  const headers = {
    apikey: key,
    "content-type": "application/json",
  };
  if (key.split(".").length === 3) {
    headers.authorization = `Bearer ${key}`;
  }
  return headers;
}

function psql(sql, applicationName) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      psqlBin,
      [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-Atq", "-c", sql],
      {
        env: {
          ...process.env,
          PGAPPNAME: applicationName,
        },
        windowsHide: true,
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function responseBody(response) {
  return (await response.text()).slice(0, 4_000);
}

function parseRpcRows(body, label) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`${label} did not return JSON: ${body}`);
  }
  assert(Array.isArray(parsed), `${label} did not return an array: ${body}`);
  return parsed;
}

const requestedAt = new Date();
const databaseClock = await psql(
  "SELECT clock_timestamp();",
  "catalogue-postgrest-database-clock",
);
assert(
  databaseClock.code === 0 && databaseClock.stdout,
  `database clock read failed: ${databaseClock.stderr || databaseClock.stdout}`,
);

const publisherUrl = `${apiUrl}/rest/v1/rpc/publish_public_catalogue`;
const publishStartedAt = Date.now();
const publishResponses = await Promise.all(
  Array.from({ length: 16 }, () =>
    fetch(publisherUrl, {
      method: "POST",
      headers: authHeaders(serviceKey),
      body: "{}",
    }),
  ),
);
const publishDurationMs = Date.now() - publishStartedAt;
const publishPayloads = await Promise.all(
  publishResponses.map(async (response) => ({
    status: response.status,
    body: await responseBody(response),
  })),
);
assert(
  publishPayloads.every(({ status }) => status === 200),
  `service publisher failed: ${JSON.stringify(publishPayloads)}`,
);

const publishedRows = publishPayloads.flatMap(({ body }) =>
  parseRpcRows(body, "service publisher"),
);
const publicationIds = new Set(
  publishedRows.map((row) => Number(row.publication_id)),
);
assert(
  publicationIds.size === 1 &&
    publishedRows.every(
      (row) =>
        Number.isSafeInteger(Number(row.publication_id)) &&
        Number(row.publication_id) > 0 &&
        Number.isSafeInteger(Number(row.row_count)) &&
        Number.isSafeInteger(Number(row.changed_count)),
    ),
  `publisher calls did not resolve one valid publication: ${JSON.stringify(publishedRows)}`,
);
const publicationId = [...publicationIds][0];

const anonHeaders = authHeaders(anonKey);
const metadataParams = new URLSearchParams({
  p_publication_id: String(publicationId),
});
const metadataUrl =
  `${apiUrl}/rest/v1/rpc/get_public_catalogue_publication?${metadataParams}`;
const metadataResponse = await fetch(metadataUrl, { headers: anonHeaders });
const metadataBody = await responseBody(metadataResponse);
assert(
  metadataResponse.status === 200,
  `anonymous publication metadata GET failed (${metadataResponse.status}): ${metadataBody}`,
);
const metadataRows = parseRpcRows(metadataBody, "publication metadata");
assert(
  metadataRows.length === 1 &&
    Number(metadataRows[0].publication_id) === publicationId,
  `publication metadata drifted from publisher: ${metadataBody}`,
);

const queryParams = new URLSearchParams({
  p_publication_id: String(publicationId),
  p_sort: "newest",
  p_priority_mode: "all",
  p_limit: "1",
});
const queryUrl =
  `${apiUrl}/rest/v1/rpc/query_public_catalogue?${queryParams}`;
const queryResponse = await fetch(queryUrl, { headers: anonHeaders });
const queryBody = await responseBody(queryResponse);
assert(
  queryResponse.status === 200,
  `anonymous typed catalogue GET failed (${queryResponse.status}): ${queryBody}`,
);
const queryRows = parseRpcRows(queryBody, "typed catalogue query");
assert(
  queryRows.every(
    (row) =>
      Number(row.publication_id) === publicationId &&
      row.card_payload &&
      typeof row.card_payload === "object",
  ),
  `typed catalogue rows were not pinned to the publication: ${queryBody}`,
);

const headResponse = await fetch(queryUrl, {
  method: "HEAD",
  headers: anonHeaders,
});
assert(
  headResponse.status === 200 || headResponse.status === 206,
  `anonymous typed catalogue HEAD failed (${headResponse.status})`,
);

const homepageResponse = await fetch(
  `${apiUrl}/rest/v1/rpc/get_public_catalogue_homepage?${metadataParams}`,
  { headers: anonHeaders },
);
const homepageBody = await responseBody(homepageResponse);
assert(
  homepageResponse.status === 200,
  `anonymous homepage publication GET failed (${homepageResponse.status}): ${homepageBody}`,
);
const homepageRows = parseRpcRows(homepageBody, "homepage publication");
assert(
  homepageRows.length === 1 &&
    Number(homepageRows[0].publication_id) === publicationId &&
    homepageRows[0].payload &&
    Number(homepageRows[0].payload.publication_id) === publicationId,
  `homepage payload was not pinned to the publication: ${homepageBody}`,
);

const deniedWriterResponse = await fetch(publisherUrl, {
  method: "POST",
  headers: anonHeaders,
  body: "{}",
});
const deniedWriterBody = await responseBody(deniedWriterResponse);
assert(
  [401, 403, 404].includes(deniedWriterResponse.status),
  `anonymous writer unexpectedly returned ${deniedWriterResponse.status}: ${deniedWriterBody}`,
);

const missingResponse = await fetch(
  `${apiUrl}/rest/v1/rpc/get_public_catalogue_publication?p_publication_id=${publicationId + 1000000000}`,
  { headers: anonHeaders },
);
const missingBody = await responseBody(missingResponse);
assert(
  missingResponse.status === 400 &&
    missingBody.includes("public_catalogue_publication_expired"),
  `missing publication did not fail closed (${missingResponse.status}): ${missingBody}`,
);

const currentPointer = await psql(
  `
    SELECT publication_id
    FROM private.public_catalogue_current
    WHERE singleton;
  `,
  "catalogue-postgrest-current-pointer",
);
assert(
  currentPointer.code === 0 &&
    Number(currentPointer.stdout) === publicationId,
  `current publication pointer mismatch: ${currentPointer.stderr || currentPointer.stdout}`,
);

console.log(
  JSON.stringify(
    {
      target,
      api_project_ref: targetEvidence.apiProjectRef,
      database_project_ref: targetEvidence.databaseProjectRef,
      client_requested_at: requestedAt.toISOString(),
      database_clock: databaseClock.stdout,
      publication_id: publicationId,
      snapshot_minute: metadataRows[0].snapshot_minute,
      row_count: Number(metadataRows[0].row_count),
      concurrent_publish_calls: 16,
      publish_duration_ms: publishDurationMs,
      anonymous_metadata_status: metadataResponse.status,
      anonymous_query_status: queryResponse.status,
      anonymous_head_status: headResponse.status,
      anonymous_homepage_status: homepageResponse.status,
      anonymous_writer_status: deniedWriterResponse.status,
      missing_publication_status: missingResponse.status,
      pgtap_plan: pgtapEvidence?.plan ?? null,
      pgtap_ok_count: pgtapEvidence?.okCount ?? null,
    },
    null,
    2,
  ),
);
