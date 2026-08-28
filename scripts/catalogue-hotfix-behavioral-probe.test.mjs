import assert from "node:assert/strict";
import test from "node:test";
import { runCatalogueBehavioralProbe } from "./catalogue-hotfix-behavioral-probe.mjs";

const apiUrl = "https://xsiehskfgeoqyazcgauv.supabase.co/";
const databaseUrl = "postgresql://postgres:password@db.xsiehskfgeoqyazcgauv.supabase.co:5432/postgres?sslmode=require";
const key = "sb_publishable_safe_key";
const id = "00000000-0000-4000-8000-000000000001";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function dependencies(overrides = {}) {
  const requests = [];
  const sql = [];
  const psql = async (query) => {
    sql.push(query);
    if (query.includes("count(*) FROM supabase_migrations")) return "2";
    if (query.includes("anon_publication_execute")) return JSON.stringify({
      migration_versions: ["20260728123058", "20260729120405"],
      legacy_rpc: true,
      publication_rpc: true,
      typed_rpc: true,
      anon_legacy_execute: true,
      anon_publication_execute: true,
      anon_typed_execute: true,
    });
    if (query.includes("SET LOCAL ROLE anon")) return JSON.stringify({
      publication_call_rows: 1,
      publication_shape: true,
      typed_call_rows: 1,
      typed_shape: true,
    });
    throw new Error(`Unexpected SQL: ${query}`);
  };
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    requests.push({ url: parsed, options });
    if (parsed.pathname.endsWith("/get_public_listing_catalogue")) {
      const select = parsed.searchParams.get("select") ?? "";
      if (select.includes("project:project_detail")) return jsonResponse([{ id, status: "active", is_off_market: false, project: null, listing_images: [{ id: 1 }, { id: 2 }] }]);
      return jsonResponse([{ id, status: "active", is_off_market: false, city: "Athens", location_search_text: "athens attica", project: null, listing_images: [{ id: 1 }] }]);
    }
    if (parsed.pathname.endsWith("/get_public_catalogue_publication")) return jsonResponse([{ publication_id: 42, snapshot_minute: "2026-08-28T12:00:00Z", published_at: "2026-08-28T12:00:01Z", retain_until: "2026-08-28T13:00:00Z", row_count: 12 }]);
    if (parsed.pathname.endsWith("/query_public_catalogue")) return jsonResponse([{ publication_id: 42, listing_id: id, card_payload: { id } }]);
    throw new Error(`Unexpected request: ${parsed}`);
  };
  return { requests, sql, psql, fetchImpl, ...overrides };
}

test("runner applies location filter, exact ID binding, and invokes typed/publication RPCs as anon", async () => {
  const deps = dependencies();
  const result = await runCatalogueBehavioralProbe({ mode: "postapply", apiUrl, databaseUrl, key }, deps);
  assert.equal(result.skipped, undefined);

  const legacy = deps.requests.filter(({ url }) => url.pathname.endsWith("/get_public_listing_catalogue"));
  const card = legacy.find(({ url }) => url.searchParams.has("location_search_text") && !String(url.searchParams.get("select")).includes("project:project_detail"));
  const detail = legacy.find(({ url }) => String(url.searchParams.get("select")).includes("project:project_detail"));
  assert.equal(card.url.searchParams.get("location_search_text"), "ilike.*Athens*");
  assert.equal(card.url.searchParams.get("id"), `eq.${id}`);
  assert.equal(detail.url.searchParams.get("id"), `eq.${id}`);

  const publication = deps.requests.find(({ url }) => url.pathname.endsWith("/get_public_catalogue_publication"));
  const typed = deps.requests.find(({ url }) => url.pathname.endsWith("/query_public_catalogue"));
  assert.equal(publication.options.method, "POST");
  assert.equal(typed.options.method, "POST");
  assert.deepEqual(JSON.parse(typed.options.body), { p_publication_id: 42, p_limit: 1, p_offset: 0 });
  assert.ok(deps.sql.some((query) => query.includes("has_function_privilege('anon'") && query.includes("query_public_catalogue")));
  assert.ok(deps.sql.some((query) => query.includes("SET LOCAL ROLE anon") && query.includes("query_public_catalogue") && query.includes("get_public_catalogue_publication")));
});

test("recorded-mode runner skips only when neither hotfix version is recorded", async () => {
  const noVersions = dependencies({ psql: async () => "0" });
  assert.deepEqual(
    await runCatalogueBehavioralProbe({ mode: "recorded", apiUrl, databaseUrl, key }, noVersions),
    { skipped: true },
  );

  const partial = dependencies({ psql: async () => "1" });
  await assert.rejects(
    runCatalogueBehavioralProbe({ mode: "recorded", apiUrl, databaseUrl, key }, partial),
    /both manifest-bound migrations/i,
  );
});

test("runner fails closed on an HTTP 200 empty catalogue response", async () => {
  const deps = dependencies();
  const original = deps.fetchImpl;
  deps.fetchImpl = async (url, options) => {
    if (new URL(url).pathname.endsWith("/get_public_listing_catalogue")) return jsonResponse([]);
    return original(url, options);
  };
  await assert.rejects(
    runCatalogueBehavioralProbe({ mode: "postapply", apiUrl, databaseUrl, key }, deps),
    /nonempty/i,
  );
});

test("runner fails closed when typed/publication grants or invocations are absent", async () => {
  const missingGrant = dependencies();
  const originalGrantPsql = missingGrant.psql;
  missingGrant.psql = async (query) => {
    const value = await originalGrantPsql(query);
    if (!query.includes("anon_publication_execute")) return value;
    return JSON.stringify({ ...JSON.parse(value), anon_publication_execute: false });
  };
  await assert.rejects(
    runCatalogueBehavioralProbe({ mode: "postapply", apiUrl, databaseUrl, key }, missingGrant),
    /grant/i,
  );

  const missingInvocation = dependencies();
  const originalInvocationPsql = missingInvocation.psql;
  missingInvocation.psql = async (query) => {
    const value = await originalInvocationPsql(query);
    if (!query.includes("SET LOCAL ROLE anon")) return value;
    return JSON.stringify({ ...JSON.parse(value), typed_call_rows: 0 });
  };
  await assert.rejects(
    runCatalogueBehavioralProbe({ mode: "postapply", apiUrl, databaseUrl, key }, missingInvocation),
    /invocation/i,
  );
});
