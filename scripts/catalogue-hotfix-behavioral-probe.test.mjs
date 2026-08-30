import assert from "node:assert/strict";
import test from "node:test";
import {
  runCatalogueBehavioralProbe,
  runCatalogueSql,
} from "./catalogue-hotfix-behavioral-probe.mjs";

const apiUrl = "https://xsiehskfgeoqyazcgauv.supabase.co/";
const databaseUrl = "postgresql://postgres:password@db.xsiehskfgeoqyazcgauv.supabase.co:5432/postgres?sslmode=require";
const key = "sb_publishable_safe_key";
const id = "00000000-0000-4000-8000-000000000001";
const auctionId = "00000000-0000-4000-8000-000000000099";
const missingAuctionId = "00000000-0000-0000-0000-000000000000";
const bridgeVersion = "20260728120000";
const firstVersion = "20260728123058";
const secondVersion = "20260729120405";

test("database SQL explicitly assumes postgres before running contract queries", async () => {
  const calls = [];
  const output = await runCatalogueSql("SELECT 42", databaseUrl, (...args) => {
    calls.push(args);
    return { status: 0, stdout: "42\n", stderr: "" };
  });

  assert.equal(output, "42");
  assert.equal(calls.length, 1);
  const [, args] = calls[0];
  assert.deepEqual(args, [
    databaseUrl,
    "--no-psqlrc",
    "--set",
    "ON_ERROR_STOP=1",
    "--set",
    "VERBOSITY=sqlstate",
    "-qAt",
    "--command",
    "SET ROLE postgres",
    "--command",
    "SELECT 42",
  ]);
});

test("database SQL reports only a safe SQLSTATE classification", async () => {
  await assert.rejects(
    runCatalogueSql("SELECT secret", databaseUrl, () => ({
      status: 1,
      stdout: "",
      stderr: "ERROR:  42501 super-secret-provider-detail\n",
    })),
    (error) => {
      assert.match(error.message, /SQLSTATE 42501/);
      assert.doesNotMatch(error.message, /super-secret|SELECT secret|password/);
      return true;
    },
  );
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function dependencies(overrides = {}) {
  const recordedVersions = overrides.recordedVersions ?? [bridgeVersion, firstVersion, secondVersion];
  const requests = [];
  const sql = [];
  const psql = async (query) => {
    sql.push(query);
    if (query.includes("recorded_hotfix_versions")) return JSON.stringify(recordedVersions);
    if (query.includes("anon_publication_execute")) return JSON.stringify({
      migration_versions: recordedVersions,
      private_catalogue_tables: true,
      private_catalogue_rls_enabled: true,
      private_catalogue_rls_forced: false,
      private_catalogue_no_direct_privileges: true,
      first_indexes: true,
      legacy_rpc: true,
      publication_rpc: true,
      typed_rpc: true,
      anon_legacy_execute: true,
      anon_publication_execute: true,
      anon_typed_execute: true,
      auction_rpc: recordedVersions.includes(secondVersion),
      homepage_rpc: recordedVersions.includes(secondVersion),
      homepage_retain_until_contract: recordedVersions.includes(secondVersion),
      anon_auction_execute: recordedVersions.includes(secondVersion),
      anon_homepage_execute: recordedVersions.includes(secondVersion),
      auction_index: recordedVersions.includes(secondVersion),
      os_identity_contract: recordedVersions.includes(bridgeVersion),
      ...overrides.metadataPatch,
    });
    if (query.includes("'os_identity_contract'")) return JSON.stringify({
      migration_versions: recordedVersions,
      os_identity_contract: recordedVersions.includes(bridgeVersion),
      ...overrides.metadataPatch,
    });
    if (query.includes("SET LOCAL ROLE anon")) return JSON.stringify({
      publication_call_rows: 1,
      publication_shape: true,
      typed_call_rows: 1,
      typed_shape: true,
      homepage_call_rows: recordedVersions.includes(secondVersion) ? 1 : 0,
      homepage_shape: recordedVersions.includes(secondVersion),
      auction_seed_rows: recordedVersions.includes(secondVersion) && !overrides.zeroAuctions ? 1 : 0,
      auction_invocation_completed: recordedVersions.includes(secondVersion),
      auction_call_rows: recordedVersions.includes(secondVersion) && !overrides.zeroAuctions ? 1 : 0,
      auction_shape: recordedVersions.includes(secondVersion),
      ...overrides.invocationPatch,
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
    if (parsed.pathname.endsWith("/query_public_catalogue")) {
      const body = JSON.parse(options.body ?? "{}");
      if (body.p_listing_type === "auction") return jsonResponse(overrides.zeroAuctions ? [] : [{ publication_id: 42, listing_id: auctionId, card_payload: { id: auctionId, listing_type: "auction" } }]);
      return jsonResponse([{ publication_id: 42, listing_id: id, card_payload: { id } }]);
    }
    if (parsed.pathname.endsWith("/get_public_catalogue_homepage")) return jsonResponse([{ publication_id: 42, published_at: "2026-08-28T12:00:01Z", retain_until: "2026-08-28T13:00:00Z", payload: { featured: [] } }]);
    if (parsed.pathname.endsWith("/get_public_catalogue_auctions")) return jsonResponse(overrides.zeroAuctions ? [] : [{ publication_id: 42, published_at: "2026-08-28T12:00:01Z", listing_id: auctionId, detail_payload: { id: auctionId, listing_type: "auction" } }]);
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
  const homepage = deps.requests.find(({ url }) => url.pathname.endsWith("/get_public_catalogue_homepage"));
  const auctions = deps.requests.find(({ url }) => url.pathname.endsWith("/get_public_catalogue_auctions"));
  assert.deepEqual(JSON.parse(homepage.options.body), { p_publication_id: 42 });
  assert.deepEqual(JSON.parse(auctions.options.body), { p_publication_id: 42, p_listing_ids: [auctionId], p_os_tag: null });
  assert.ok(deps.sql.some((query) => query.includes("has_function_privilege('anon'") && query.includes("query_public_catalogue")));
  assert.ok(deps.sql.some((query) => query.includes("SET LOCAL ROLE anon") && query.includes("query_public_catalogue") && query.includes("get_public_catalogue_publication") && query.includes("get_public_catalogue_homepage") && query.includes("get_public_catalogue_auctions")));
  assert.equal(result.functions.auction_rpc, true);
  assert.equal(result.functions.homepage_rpc, true);
  assert.equal(result.indexes.auction_lookup, true);
  assert.equal(result.private_tables.rls_enabled, true);
  assert.equal(result.private_tables.rls_forced, false);
  assert.equal(JSON.stringify(result).includes(id), false);
  assert.equal(JSON.stringify(result).includes(auctionId), false);
});

test("runner certifies a publication with zero auctions using a deterministic sentinel", async () => {
  const deps = dependencies({ zeroAuctions: true });
  const result = await runCatalogueBehavioralProbe({ mode: "postapply", apiUrl, databaseUrl, key }, deps);
  const auctions = deps.requests.find(({ url }) => url.pathname.endsWith("/get_public_catalogue_auctions"));
  assert.deepEqual(JSON.parse(auctions.options.body), {
    p_publication_id: 42,
    p_listing_ids: [missingAuctionId],
    p_os_tag: null,
  });
  assert.equal(result.anon_database_invocations.auction_seed_rows, 0);
  assert.equal(result.anon_database_invocations.auction_call_rows, 0);
  assert.equal(result.anon_database_invocations.auction_invocation_completed, true);
  assert.equal(result.rest_behavior.auction_seed_rows, 0);
  assert.equal(result.rest_behavior.auction_call_rows, 0);
  assert.equal(result.rest_behavior.auction_invocation_completed, true);
});

test("recorded-mode runner supports safe first-only recovery and rejects drift or dependency inversion", async () => {
  const noVersions = dependencies({ recordedVersions: [] });
  assert.deepEqual(
    await runCatalogueBehavioralProbe({ mode: "recorded", apiUrl, databaseUrl, key }, noVersions),
    { skipped: true },
  );

  const bridgeOnly = dependencies({ recordedVersions: [bridgeVersion] });
  const bridgeProof = await runCatalogueBehavioralProbe(
    { mode: "recorded", apiUrl, databaseUrl, key },
    bridgeOnly,
  );
  assert.equal(bridgeProof.contract_level, "identity_bridge");
  assert.deepEqual(bridgeProof.recorded_versions, [bridgeVersion]);

  const bridgeDrift = dependencies({
    recordedVersions: [bridgeVersion],
    metadataPatch: { os_identity_contract: false },
  });
  await assert.rejects(
    runCatalogueBehavioralProbe({ mode: "recorded", apiUrl, databaseUrl, key }, bridgeDrift),
    /OS auction identity contract/i,
  );

  const firstOnly = dependencies({ recordedVersions: [firstVersion] });
  const partial = await runCatalogueBehavioralProbe({ mode: "recorded", apiUrl, databaseUrl, key }, firstOnly);
  assert.equal(partial.contract_level, "first_migration");
  assert.deepEqual(partial.recorded_versions, [firstVersion]);
  assert.equal(firstOnly.requests.some(({ url }) => url.pathname.endsWith("/get_public_catalogue_homepage")), false);
  assert.equal(firstOnly.requests.some(({ url }) => url.pathname.endsWith("/get_public_catalogue_auctions")), false);
  const metadataQuery = firstOnly.sql.find((query) => query.includes("anon_auction_execute"));
  assert.match(metadataQuery, /COALESCE\(has_function_privilege\('anon',\s*to_regprocedure\('public\.get_public_catalogue_auctions\(bigint,uuid\[\],text\)'\),\s*'EXECUTE'\),\s*false\)/);
  assert.match(metadataQuery, /COALESCE\(has_function_privilege\('anon',\s*to_regprocedure\('public\.get_public_catalogue_homepage\(bigint\)'\),\s*'EXECUTE'\),\s*false\)/);
  assert.doesNotMatch(metadataQuery, /has_function_privilege\('anon','public\.get_public_catalogue_(?:auctions|homepage)/);

  const firstDrift = dependencies({ recordedVersions: [firstVersion], metadataPatch: { first_indexes: false } });
  await assert.rejects(
    runCatalogueBehavioralProbe({ mode: "recorded", apiUrl, databaseUrl, key }, firstDrift),
    /first migration|index/i,
  );

  const secondOnly = dependencies({ recordedVersions: [secondVersion] });
  await assert.rejects(
    runCatalogueBehavioralProbe({ mode: "recorded", apiUrl, databaseUrl, key }, secondOnly),
    /dependency|approved/i,
  );

  const firstTwo = dependencies({ recordedVersions: [firstVersion, secondVersion] });
  const catalogueContract = await runCatalogueBehavioralProbe(
    { mode: "recorded", apiUrl, databaseUrl, key },
    firstTwo,
  );
  assert.equal(catalogueContract.contract_level, "catalogue_contract");

  const bridgeAndFirst = dependencies({ recordedVersions: [bridgeVersion, firstVersion] });
  const resumableContract = await runCatalogueBehavioralProbe(
    { mode: "recorded", apiUrl, databaseUrl, key },
    bridgeAndFirst,
  );
  assert.equal(resumableContract.contract_level, "bridge_and_first");

  const allThree = dependencies({ recordedVersions: [bridgeVersion, firstVersion, secondVersion] });
  const fullContract = await runCatalogueBehavioralProbe(
    { mode: "recorded", apiUrl, databaseUrl, key },
    allThree,
  );
  assert.equal(fullContract.contract_level, "full");
  assert.deepEqual(fullContract.recorded_versions, [bridgeVersion, firstVersion, secondVersion]);

  const postapplyPartial = dependencies({ recordedVersions: [firstVersion] });
  await assert.rejects(
    runCatalogueBehavioralProbe({ mode: "postapply", apiUrl, databaseUrl, key }, postapplyPartial),
    /all manifest-bound migrations/i,
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

test("full contract rejects second-migration function, retain-until, index, RLS, and privilege drift", async () => {
  for (const metadataPatch of [
    { auction_rpc: false },
    { anon_auction_execute: false },
    { homepage_rpc: false },
    { homepage_retain_until_contract: false },
    { anon_homepage_execute: false },
    { auction_index: false },
    { private_catalogue_rls_enabled: false },
    { private_catalogue_rls_forced: true },
    { private_catalogue_no_direct_privileges: false },
    { os_identity_contract: false },
  ]) {
    const deps = dependencies({ metadataPatch });
    await assert.rejects(
      runCatalogueBehavioralProbe({ mode: "postapply", apiUrl, databaseUrl, key }, deps),
      /contract|grant|index|RLS|privilege/i,
    );
  }

  for (const invocationPatch of [
    { homepage_call_rows: 0 },
    { homepage_shape: false },
    { auction_seed_rows: 1, auction_call_rows: 0 },
    { auction_invocation_completed: false },
    { auction_shape: false },
  ]) {
    const deps = dependencies({ invocationPatch });
    await assert.rejects(
      runCatalogueBehavioralProbe({ mode: "postapply", apiUrl, databaseUrl, key }, deps),
      /invocation|contract/i,
    );
  }
});

test("full contract rejects empty or malformed homepage and auction REST results", async () => {
  const invalidHomepage = dependencies();
  const homepageFetch = invalidHomepage.fetchImpl;
  invalidHomepage.fetchImpl = async (url, options) => {
    if (new URL(url).pathname.endsWith("/get_public_catalogue_homepage")) {
      return jsonResponse([{ publication_id: 42, published_at: "2026-08-28T12:00:01Z", payload: {} }]);
    }
    return homepageFetch(url, options);
  };
  await assert.rejects(
    runCatalogueBehavioralProbe({ mode: "postapply", apiUrl, databaseUrl, key }, invalidHomepage),
    /homepage|retain_until/i,
  );

  const emptyAuction = dependencies();
  const auctionFetch = emptyAuction.fetchImpl;
  emptyAuction.fetchImpl = async (url, options) => {
    if (new URL(url).pathname.endsWith("/get_public_catalogue_auctions")) return jsonResponse([]);
    return auctionFetch(url, options);
  };
  await assert.rejects(
    runCatalogueBehavioralProbe({ mode: "postapply", apiUrl, databaseUrl, key }, emptyAuction),
    /auction/i,
  );
});
