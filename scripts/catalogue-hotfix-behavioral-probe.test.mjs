import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPreparationDiagnosticNotice,
  preparationRecoveryContractsSql,
  preparationRecoveryContractComponents,
  runCatalogueBehavioralProbe,
  runCatalogueSql,
  validatePreparationRecoveryContractsSql,
  validatePreparationRecoveryContractComponents,
} from "./catalogue-hotfix-behavioral-probe.mjs";

const apiUrl = "https://xsiehskfgeoqyazcgauv.supabase.co/";
const databaseUrl = "postgresql://postgres:password@db.xsiehskfgeoqyazcgauv.supabase.co:5432/postgres?sslmode=require";
const key = "sb_publishable_safe_key";
const id = "00000000-0000-4000-8000-000000000001";
const auctionId = "00000000-0000-4000-8000-000000000099";
const missingAuctionId = "00000000-0000-0000-0000-000000000000";
const quarantineVersion = "20260728115959";
const preparationVersion = "20260728115960";
const bridgeVersion = "20260728120000";
const repairVersion = "20260728121500";
const firstVersion = "20260728123058";
const secondVersion = "20260729120405";
const identityComponentKeys = [
  "duplicate_quarantine_relation",
  "duplicate_quarantine_acl",
  "extractor_owner",
  "extractor_posture",
  "extractor_body",
  "extractor_acl",
  "generated_column",
  "unique_index",
  "source_check",
  "stored_parity",
];
const validIdentityComponents = Object.fromEntries(
  identityComponentKeys.map((component) => [component, true]),
);

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
  const recordedVersions = overrides.recordedVersions ?? [
    quarantineVersion,
    preparationVersion,
    bridgeVersion,
    repairVersion,
    firstVersion,
    secondVersion,
  ];
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
      invalid_identity_quarantine_contract: recordedVersions.includes(quarantineVersion),
      preparation_recovery_extractor_contract: recordedVersions.includes(quarantineVersion),
      eligible_invalid_os_source_rows: 0,
      invalid_identity_quarantine_rows: 1,
      invalid_identity_quarantine_marked_rows: 1,
      invalid_identity_quarantine_live_contract: true,
      bridge_residue_duplicate_quarantine_relation: false,
      bridge_residue_generated_column: false,
      bridge_residue_unique_index: false,
      bridge_residue_source_check: false,
      bridge_residue_duplicate_marker_rows: 0,
      duplicate_preparation_contract: recordedVersions.includes(preparationVersion),
      duplicate_preparation_ledger_contract: recordedVersions.includes(preparationVersion),
      duplicate_preparation_acl_contract: recordedVersions.includes(preparationVersion),
      duplicate_preparation_generated_column: false,
      duplicate_preparation_unique_index: false,
      duplicate_preparation_source_check: false,
      duplicate_preparation_remaining_candidates: 0,
      duplicate_preparation_owner_guard_rows: 0,
      duplicate_preparation_active_promotion_rows: 0,
      duplicate_preparation_ledger_rows: 3,
      duplicate_preparation_live_marker_rows: 3,
      duplicate_preparation_live_recoverable_contract: recordedVersions.includes(preparationVersion),
      os_identity_contract: recordedVersions.includes(bridgeVersion),
      os_identity_components: recordedVersions.includes(bridgeVersion)
        ? validIdentityComponents
        : Object.fromEntries(identityComponentKeys.map((component) => [component, false])),
      ...overrides.metadataPatch,
    });
    if (query.includes("'os_identity_contract'")) return JSON.stringify({
      migration_versions: recordedVersions,
      invalid_identity_quarantine_contract: recordedVersions.includes(quarantineVersion),
      preparation_recovery_extractor_contract: recordedVersions.includes(quarantineVersion),
      eligible_invalid_os_source_rows: 0,
      invalid_identity_quarantine_rows: 1,
      invalid_identity_quarantine_marked_rows: 1,
      invalid_identity_quarantine_live_contract: true,
      bridge_residue_duplicate_quarantine_relation: false,
      bridge_residue_generated_column: false,
      bridge_residue_unique_index: false,
      bridge_residue_source_check: false,
      bridge_residue_duplicate_marker_rows: 0,
      duplicate_preparation_contract: recordedVersions.includes(preparationVersion),
      duplicate_preparation_ledger_contract: recordedVersions.includes(preparationVersion),
      duplicate_preparation_acl_contract: recordedVersions.includes(preparationVersion),
      duplicate_preparation_generated_column: false,
      duplicate_preparation_unique_index: false,
      duplicate_preparation_source_check: false,
      duplicate_preparation_remaining_candidates: 0,
      duplicate_preparation_owner_guard_rows: 0,
      duplicate_preparation_active_promotion_rows: 0,
      duplicate_preparation_ledger_rows: 3,
      duplicate_preparation_live_marker_rows: 3,
      duplicate_preparation_live_recoverable_contract: recordedVersions.includes(preparationVersion),
      os_identity_contract: recordedVersions.includes(bridgeVersion),
      os_identity_components: recordedVersions.includes(bridgeVersion)
        ? validIdentityComponents
        : Object.fromEntries(identityComponentKeys.map((component) => [component, false])),
      ...overrides.metadataPatch,
    });
    if (query.includes("'invalid_identity_quarantine_contract'")) return JSON.stringify({
      migration_versions: recordedVersions,
      invalid_identity_quarantine_contract: recordedVersions.includes(quarantineVersion),
      preparation_recovery_extractor_contract: recordedVersions.includes(quarantineVersion),
      eligible_invalid_os_source_rows: 0,
      invalid_identity_quarantine_rows: 1,
      invalid_identity_quarantine_marked_rows: 1,
      invalid_identity_quarantine_live_contract: true,
      bridge_residue_duplicate_quarantine_relation: false,
      bridge_residue_generated_column: false,
      bridge_residue_unique_index: false,
      bridge_residue_source_check: false,
      bridge_residue_duplicate_marker_rows: 0,
      duplicate_preparation_contract: recordedVersions.includes(preparationVersion),
      duplicate_preparation_ledger_contract: recordedVersions.includes(preparationVersion),
      duplicate_preparation_acl_contract: recordedVersions.includes(preparationVersion),
      duplicate_preparation_generated_column: false,
      duplicate_preparation_unique_index: false,
      duplicate_preparation_source_check: false,
      duplicate_preparation_remaining_candidates: 0,
      duplicate_preparation_owner_guard_rows: 0,
      duplicate_preparation_active_promotion_rows: 0,
      duplicate_preparation_ledger_rows: 3,
      duplicate_preparation_live_marker_rows: 3,
      duplicate_preparation_live_recoverable_contract: recordedVersions.includes(preparationVersion),
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
  assert.deepEqual(result.recorded_versions, [
    quarantineVersion,
    preparationVersion,
    bridgeVersion,
    repairVersion,
    firstVersion,
    secondVersion,
  ]);

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

test("postapply SQL certifies the exact quarantine schema and deterministic live-row parity", async () => {
  const deps = dependencies();
  await runCatalogueBehavioralProbe({ mode: "postapply", apiUrl, databaseUrl, key }, deps);

  const metadata = deps.sql.find((query) => query.includes("'invalid_identity_quarantine_contract'"));
  assert.ok(metadata);
  for (const exactMetadataPredicate of [
    "relation.relpersistence = 'p'",
    "pg_get_userbyid(relation.relowner) = 'postgres'",
    "privilege.grantee <> relation.relowner",
    "attribute.attacl IS NOT NULL",
    "AND 3 = (",
    "NOT relation.relforcerowsecurity",
    "attribute.attname = 'listing_id'",
    "attribute.attname = 'previous_status'",
    "attribute.attname = 'previous_tags'",
    "attribute.attname = 'quarantined_at'",
    "attribute.attname = 'reason'",
    "constraint_definition.contype = 'p'",
    "constraint_definition.convalidated",
    "constraint_definition.confdeltype = 'r'",
    "listing.owner_id IS NOT NULL",
    "quarantine.previous_status = 'active'::public.listing_status",
    "left(tag.value, length('os_auction:')) <> 'os_auction:'",
    "WHERE marker.value = 'source:maiprop-os-invalid-identity-quarantine'",
    "allocation.ends_at > statement_timestamp()",
    "allocation.revoked_at IS NULL",
  ]) {
    assert.match(metadata, new RegExp(exactMetadataPredicate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(metadata, /LIKE 'os_auction:%'/);
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

  const quarantineOnly = dependencies({ recordedVersions: [quarantineVersion] });
  const quarantineProof = await runCatalogueBehavioralProbe(
    { mode: "recorded", apiUrl, databaseUrl, key },
    quarantineOnly,
  );
  assert.equal(quarantineProof.contract_level, "invalid_identity_quarantine");
  assert.deepEqual(quarantineProof.recorded_versions, [quarantineVersion]);

  const prepared = dependencies({ recordedVersions: [quarantineVersion, preparationVersion] });
  const preparationProof = await runCatalogueBehavioralProbe(
    { mode: "recorded", apiUrl, databaseUrl, key },
    prepared,
  );
  assert.equal(preparationProof.contract_level, "duplicate_identity_preparation");
  assert.deepEqual(preparationProof.recorded_versions, [quarantineVersion, preparationVersion]);
  assert.equal(JSON.stringify(preparationProof).includes("provider"), false);

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
  assert.equal(fullContract.contract_level, "legacy_full");
  assert.deepEqual(fullContract.recorded_versions, [bridgeVersion, firstVersion, secondVersion]);

  const allFour = dependencies({ recordedVersions: [quarantineVersion, bridgeVersion, firstVersion, secondVersion] });
  const remediatedFullContract = await runCatalogueBehavioralProbe(
    { mode: "recorded", apiUrl, databaseUrl, key },
    allFour,
  );
  assert.equal(remediatedFullContract.contract_level, "full");
  assert.deepEqual(remediatedFullContract.recorded_versions, [
    quarantineVersion,
    bridgeVersion,
    firstVersion,
    secondVersion,
  ]);

  const quarantineAndBridge = dependencies({
    recordedVersions: [quarantineVersion, bridgeVersion],
  });
  assert.equal(
    (await runCatalogueBehavioralProbe(
      { mode: "recorded", apiUrl, databaseUrl, key },
      quarantineAndBridge,
    )).contract_level,
    "quarantine_and_identity_bridge",
  );

  const quarantineBridgeAndFirst = dependencies({
    recordedVersions: [quarantineVersion, bridgeVersion, firstVersion],
  });
  assert.equal(
    (await runCatalogueBehavioralProbe(
      { mode: "recorded", apiUrl, databaseUrl, key },
      quarantineBridgeAndFirst,
    )).contract_level,
    "quarantine_bridge_and_first",
  );

  const quarantineAndFirst = dependencies({
    recordedVersions: [quarantineVersion, firstVersion],
  });
  assert.equal(
    (await runCatalogueBehavioralProbe(
      { mode: "recorded", apiUrl, databaseUrl, key },
      quarantineAndFirst,
    )).contract_level,
    "quarantine_and_first",
  );

  const quarantineCatalogue = dependencies({
    recordedVersions: [quarantineVersion, firstVersion, secondVersion],
  });
  assert.equal(
    (await runCatalogueBehavioralProbe(
      { mode: "recorded", apiUrl, databaseUrl, key },
      quarantineCatalogue,
    )).contract_level,
    "quarantine_catalogue_contract",
  );

  const unsupportedQuarantineAndSecond = dependencies({
    recordedVersions: [quarantineVersion, secondVersion],
  });
  await assert.rejects(
    runCatalogueBehavioralProbe(
      { mode: "recorded", apiUrl, databaseUrl, key },
      unsupportedQuarantineAndSecond,
    ),
    /dependency|approved/i,
  );

  const postapplyPartial = dependencies({ recordedVersions: [firstVersion] });
  await assert.rejects(
    runCatalogueBehavioralProbe({ mode: "postapply", apiUrl, databaseUrl, key }, postapplyPartial),
    /all manifest-bound migrations/i,
  );
  await assert.rejects(
    runCatalogueBehavioralProbe({
      mode: "postapply", apiUrl, databaseUrl, key,
    }, dependencies({ recordedVersions: [bridgeVersion, firstVersion, secondVersion] })),
    /all manifest-bound migrations/i,
  );
  await assert.rejects(
    runCatalogueBehavioralProbe({
      mode: "postapply", apiUrl, databaseUrl, key,
    }, dependencies({
      recordedVersions: [quarantineVersion, bridgeVersion, repairVersion, firstVersion, secondVersion],
    })),
    /all manifest-bound migrations/i,
  );
});

test("Q-only recorded certification rejects every B-only residue aggregate", async () => {
  const residueCases = [
    { bridge_residue_duplicate_quarantine_relation: true },
    { bridge_residue_generated_column: true },
    { bridge_residue_unique_index: true },
    { bridge_residue_source_check: true },
    { bridge_residue_duplicate_marker_rows: 1 },
  ];
  for (const metadataPatch of residueCases) {
    await assert.rejects(
      runCatalogueBehavioralProbe(
        { mode: "recorded", apiUrl, databaseUrl, key },
        dependencies({ recordedVersions: [quarantineVersion], metadataPatch }),
      ),
      /bridge residue/i,
    );
  }
});

test("Q,P certification fails closed on preparation contract and parity drift", async () => {
  const invalidCases = [
    { duplicate_preparation_contract: false },
    { duplicate_preparation_ledger_contract: false },
    { duplicate_preparation_acl_contract: false },
    { duplicate_preparation_generated_column: true },
    { duplicate_preparation_unique_index: true },
    { duplicate_preparation_source_check: true },
    { duplicate_preparation_remaining_candidates: 1 },
    { duplicate_preparation_owner_guard_rows: 1 },
    { duplicate_preparation_active_promotion_rows: 1 },
    { duplicate_preparation_ledger_rows: 3, duplicate_preparation_live_marker_rows: 2 },
    { duplicate_preparation_live_recoverable_contract: false },
  ];
  for (const metadataPatch of invalidCases) {
    await assert.rejects(
      runCatalogueBehavioralProbe(
        { mode: "recorded", apiUrl, databaseUrl, key },
        dependencies({
          recordedVersions: [quarantineVersion, preparationVersion],
          metadataPatch,
        }),
      ),
      /duplicate identity preparation/i,
    );
  }
});

test("preparation recovery attests only the exact recorded Q,P candidate state", async () => {
  const exactMetadata = {
    preparation_recovery_extractor_contract: true,
    duplicate_preparation_contract: false,
    duplicate_preparation_ledger_contract: true,
    duplicate_preparation_acl_contract: true,
    duplicate_preparation_generated_column: false,
    duplicate_preparation_unique_index: false,
    duplicate_preparation_source_check: false,
    duplicate_preparation_remaining_candidates: 600,
    duplicate_preparation_owner_guard_rows: 0,
    duplicate_preparation_active_promotion_rows: 0,
    duplicate_preparation_ledger_rows: 47123,
    duplicate_preparation_live_marker_rows: 47123,
    duplicate_preparation_live_recoverable_contract: true,
  };
  const deps = dependencies({
    recordedVersions: [quarantineVersion, preparationVersion],
    metadataPatch: exactMetadata,
  });
  assert.deepEqual(
    await runCatalogueBehavioralProbe(
      { mode: "preparation-recovery", apiUrl, databaseUrl, key },
      deps,
    ),
    {
      schema_version: 1,
      kind: "maiprop-duplicate-preparation-recovery-attestation",
      action: "replay",
      recorded_versions: [quarantineVersion, preparationVersion],
      evidence: exactMetadata,
    },
  );
  assert.equal(deps.requests.length, 0, "recovery attestation never reaches public APIs");

  assert.deepEqual(
    await runCatalogueBehavioralProbe(
      { mode: "preparation-recovery", apiUrl, databaseUrl, key },
      dependencies({
        recordedVersions: [quarantineVersion, preparationVersion],
        metadataPatch: {
          preparation_recovery_extractor_contract: true,
          duplicate_preparation_contract: true,
          duplicate_preparation_ledger_contract: true,
          duplicate_preparation_acl_contract: true,
          duplicate_preparation_generated_column: false,
          duplicate_preparation_unique_index: false,
          duplicate_preparation_source_check: false,
          duplicate_preparation_remaining_candidates: 0,
          duplicate_preparation_owner_guard_rows: 0,
          duplicate_preparation_active_promotion_rows: 0,
          duplicate_preparation_ledger_rows: 47723,
          duplicate_preparation_live_marker_rows: 47723,
          duplicate_preparation_live_recoverable_contract: true,
        },
      }),
    ),
    {
      schema_version: 1,
      kind: "maiprop-duplicate-preparation-recovery-attestation",
      action: "no_replay",
      recorded_versions: [quarantineVersion, preparationVersion],
    },
    "a clean Q,P rerun never selects a replay",
  );

  await assert.rejects(
    runCatalogueBehavioralProbe(
      { mode: "preparation-recovery", apiUrl, databaseUrl, key },
      dependencies({
        recordedVersions: [quarantineVersion, preparationVersion],
        metadataPatch: {
          duplicate_preparation_contract: true,
          duplicate_preparation_ledger_contract: true,
          duplicate_preparation_acl_contract: true,
          duplicate_preparation_remaining_candidates: 0,
          duplicate_preparation_owner_guard_rows: 0,
          duplicate_preparation_active_promotion_rows: 0,
          duplicate_preparation_ledger_rows: 3,
          duplicate_preparation_live_marker_rows: 3,
          duplicate_preparation_live_recoverable_contract: true,
        },
      }),
    ),
    /exact preparation recovery state/i,
    "arbitrary equal ledger/marker counts must not become a no-replay state",
  );

  for (const metadataPatch of [
    { invalid_identity_quarantine_contract: false },
    { preparation_recovery_extractor_contract: false },
    { duplicate_preparation_remaining_candidates: 599 },
    { duplicate_preparation_contract: true },
    { duplicate_preparation_ledger_contract: false },
    { duplicate_preparation_acl_contract: false },
    { duplicate_preparation_generated_column: true },
    { duplicate_preparation_unique_index: true },
    { duplicate_preparation_source_check: true },
    { duplicate_preparation_owner_guard_rows: 1 },
    { duplicate_preparation_active_promotion_rows: 1 },
    { duplicate_preparation_ledger_rows: 47122 },
    { duplicate_preparation_live_marker_rows: 47122 },
    { duplicate_preparation_live_recoverable_contract: false },
  ]) {
    await assert.rejects(
      runCatalogueBehavioralProbe(
        { mode: "preparation-recovery", apiUrl, databaseUrl, key },
        dependencies({
          recordedVersions: [quarantineVersion, preparationVersion],
          metadataPatch: { ...exactMetadata, ...metadataPatch },
        }),
      ),
      /exact preparation recovery state/i,
    );
  }
  await assert.rejects(
    runCatalogueBehavioralProbe(
      { mode: "preparation-recovery", apiUrl, databaseUrl, key },
      dependencies({ recordedVersions: [quarantineVersion, preparationVersion, bridgeVersion] }),
    ),
    /exact preparation recovery state/i,
  );
});

test("preparation recovery SQL rejects mutations of every exact precondition", () => {
  const exactSql = preparationRecoveryContractsSql();
  assert.doesNotThrow(() => validatePreparationRecoveryContractsSql(exactSql));
  for (const predicate of [
    "attribute.attname = 'listing_id'",
    "privilege.grantee <> relation.relowner",
    "pg_get_expr(definition.adbin, definition.adrelid) = 'statement_timestamp()'",
    "'CHECK ((reason = ANY (ARRAY[''non_auction''::text",
    "constraint_definition.confdeltype = 'r'",
    "quarantine.previous_status = 'active'::public.listing_status",
    "listing.tags IS DISTINCT FROM (",
    "WHERE marker.value = 'source:maiprop-os-invalid-identity-quarantine'",
    "NOT EXISTS (\n      SELECT 1\n      FROM public.listings AS listing\n      WHERE COALESCE(listing.tags, '{}'::text[]) @> ARRAY['source:maiprop-os-invalid-identity-quarantine']",
    "allocation.ends_at > statement_timestamp()",
    "source:maiprop-os-invalid-identity-quarantine",
    "532205de65120d3e34729a515d949f65",
    "procedure.proparallel = 's'",
    "privilege.privilege_type = 'EXECUTE'",
    "attribute.attname = 'duplicate_listing_id'",
    "attribute.attname = 'canonical_listing_id'",
    "attribute.attname = 'provider_id'",
    "attribute.attname = 'previous_status'",
    "attribute.attname = 'previous_tags'",
    "'CHECK ((reason = ''duplicate_os_auction_identity''::text))'",
    "'CHECK ((duplicate_listing_id <> canonical_listing_id))'",
    "constraint_definition.confkey = ARRAY[",
    "listing.tags IS DISTINCT FROM CASE",
    "WHERE marker.value = 'source:maiprop-os-duplicate-quarantine'",
    "AND NOT EXISTS (\n          SELECT 1\n          FROM private.os_auction_duplicate_quarantine AS quarantine",
    "source:maiprop-os-duplicate-quarantine",
    "to_regclass('public.idx_listings_os_auction_id_unique') IS NULL",
    "listings_os_auction_source_identity_valid",
  ]) {
    assert.throws(
      () => validatePreparationRecoveryContractsSql(exactSql.replaceAll(predicate, "MUTATED_PREDICATE")),
      /preparation recovery SQL contract is incomplete/i,
      predicate,
    );
  }
});

test("preparation recovery component validator rejects each scoped marker", () => {
  const components = preparationRecoveryContractComponents();
  assert.doesNotThrow(() => validatePreparationRecoveryContractComponents(components));
  for (const [name, marker] of Object.entries({
    qSchema: "attacl IS NOT NULL",
    qLive: "source:maiprop-os-invalid-identity-quarantine",
    invalidSource: "identity.provider_tag_count <> 1",
    qExtractor: "532205de65120d3e34729a515d949f65",
    pSchema: "attacl IS NOT NULL",
    pAcl: "privilege.grantee <> relation.relowner",
    pLive: "source:maiprop-os-duplicate-quarantine",
    bAbsent: "idx_listings_os_auction_id_unique",
  })) {
    const mutated = { ...components, [name]: components[name].replaceAll(marker, "MUTATED") };
    assert.throws(() => validatePreparationRecoveryContractComponents(mutated), /incomplete/i, name);
  }
});

test("recorded Q,P preparation rejection carries only deterministic aggregate diagnostics", async () => {
  const secret = "postgresql://customer:credential@private.example/never-log";
  await assert.rejects(
    runCatalogueBehavioralProbe(
      { mode: "recorded", apiUrl, databaseUrl, key },
      dependencies({
        recordedVersions: [quarantineVersion, preparationVersion],
        metadataPatch: {
          duplicate_preparation_generated_column: true,
          duplicate_preparation_remaining_candidates: 4,
          duplicate_preparation_ledger_rows: 3,
          duplicate_preparation_live_marker_rows: 2,
          customer_url: secret,
        },
      }),
    ),
    (error) => {
      assert.match(error.message, /duplicate identity preparation contract is incomplete/i);
      assert.deepEqual(error.preparationDiagnostic, {
        schema_version: 1,
        kind: "maiprop-duplicate-preparation-contract-failure",
        failed_invariants: [
          "duplicate_preparation_generated_column",
          "duplicate_preparation_ledger_rows_match_live_marker_rows",
          "duplicate_preparation_remaining_candidates",
        ],
        evidence: {
          duplicate_preparation_contract: true,
          duplicate_preparation_ledger_contract: true,
          duplicate_preparation_acl_contract: true,
          duplicate_preparation_generated_column: true,
          duplicate_preparation_unique_index: false,
          duplicate_preparation_source_check: false,
          duplicate_preparation_live_recoverable_contract: true,
          duplicate_preparation_remaining_candidates: 4,
          duplicate_preparation_owner_guard_rows: 0,
          duplicate_preparation_active_promotion_rows: 0,
          duplicate_preparation_ledger_rows: 3,
          duplicate_preparation_live_marker_rows: 2,
        },
      });
      assert.doesNotMatch(JSON.stringify(error.preparationDiagnostic), /customer|credential|private\.example|postgresql/i);
      assert.equal(
        formatPreparationDiagnosticNotice(error),
        `::notice::${JSON.stringify(error.preparationDiagnostic)}`,
      );
      return true;
    },
  );
});

test("preparation diagnostic notice rejects arbitrary and noncanonical caller data", () => {
  const safeDiagnostic = {
    schema_version: 1,
    kind: "maiprop-duplicate-preparation-contract-failure",
    failed_invariants: ["duplicate_preparation_remaining_candidates"],
    evidence: {
      duplicate_preparation_remaining_candidates: 4,
      duplicate_preparation_contract: false,
    },
  };
  assert.equal(
    formatPreparationDiagnosticNotice({ preparationDiagnostic: safeDiagnostic }),
    '::notice::{"schema_version":1,"kind":"maiprop-duplicate-preparation-contract-failure","failed_invariants":["duplicate_preparation_remaining_candidates"],"evidence":{"duplicate_preparation_contract":false,"duplicate_preparation_remaining_candidates":4}}',
  );

  const token = "sb_secret_never_emit";
  const arrayWithHiddenSerializer = {
    ...safeDiagnostic,
    failed_invariants: [...safeDiagnostic.failed_invariants],
  };
  Object.defineProperty(arrayWithHiddenSerializer.failed_invariants, "toJSON", {
    value: () => [token],
  });
  const evidenceWithHiddenSerializer = {
    ...safeDiagnostic,
    evidence: { ...safeDiagnostic.evidence },
  };
  Object.defineProperty(evidenceWithHiddenSerializer.evidence, "toJSON", {
    value: () => ({ token }),
  });
  for (const preparationDiagnostic of [
    { ...safeDiagnostic, token },
    { ...safeDiagnostic, evidence: { ...safeDiagnostic.evidence, token } },
    { ...safeDiagnostic, evidence: { ...safeDiagnostic.evidence, duplicate_preparation_remaining_candidates: "4" } },
    { ...safeDiagnostic, failed_invariants: ["unknown_invariant"] },
    { ...safeDiagnostic, failed_invariants: ["duplicate_preparation_remaining_candidates", "duplicate_preparation_generated_column"] },
    { ...safeDiagnostic, failed_invariants: ["duplicate_preparation_remaining_candidates", "duplicate_preparation_remaining_candidates"] },
    arrayWithHiddenSerializer,
    evidenceWithHiddenSerializer,
    token,
  ]) {
    const notice = formatPreparationDiagnosticNotice({ preparationDiagnostic });
    assert.equal(notice, null);
    assert.doesNotMatch(String(notice), /sb_secret_never_emit/);
  }
});

test("preparation diagnostic notice never invokes diagnostic accessors", () => {
  const safeDiagnostic = {
    schema_version: 1,
    kind: "maiprop-duplicate-preparation-contract-failure",
    failed_invariants: ["duplicate_preparation_remaining_candidates"],
    evidence: {
      duplicate_preparation_contract: false,
      duplicate_preparation_remaining_candidates: 4,
    },
  };
  const token = "accessor_value_must_not_emit";
  for (const [name, preparationDiagnostic, calls] of [
    (() => {
      let accessorCalls = 0;
      const diagnostic = { ...safeDiagnostic };
      Object.defineProperty(diagnostic, "schema_version", {
        enumerable: true,
        get: () => {
          accessorCalls += 1;
          return 1;
        },
      });
      return ["top-level", diagnostic, () => accessorCalls];
    })(),
    (() => {
      let accessorCalls = 0;
      const failedInvariants = [...safeDiagnostic.failed_invariants];
      Object.defineProperty(failedInvariants, "0", {
        enumerable: true,
        get: () => {
          accessorCalls += 1;
          return "duplicate_preparation_remaining_candidates";
        },
      });
      return ["array", { ...safeDiagnostic, failed_invariants: failedInvariants }, () => accessorCalls];
    })(),
    (() => {
      let accessorCalls = 0;
      const evidence = { ...safeDiagnostic.evidence };
      Object.defineProperty(evidence, "duplicate_preparation_contract", {
        enumerable: true,
        get: () => {
          accessorCalls += 1;
          return accessorCalls === 1 ? false : token;
        },
      });
      return ["evidence", { ...safeDiagnostic, evidence }, () => accessorCalls];
    })(),
  ]) {
    const notice = formatPreparationDiagnosticNotice({ preparationDiagnostic });
    assert.equal(notice, null, name);
    assert.equal(calls(), 0, name);
    assert.doesNotMatch(String(notice), /accessor_value_must_not_emit/, name);
  }
});

test("recorded Q,P downstream contract drift emits only the generic preparation failure", async () => {
  const secret = "provider-row-secret-must-not-log";
  await assert.rejects(
    runCatalogueBehavioralProbe(
      { mode: "recorded", apiUrl, databaseUrl, key },
      dependencies({
        recordedVersions: [quarantineVersion, preparationVersion],
        metadataPatch: {
          invalid_identity_quarantine_live_contract: false,
          provider_diagnostic: secret,
        },
      }),
    ),
    (error) => {
      assert.equal(error.message, "Database duplicate identity preparation contract is incomplete.");
      assert.deepEqual(error.preparationDiagnostic.failed_invariants, [
        "duplicate_preparation_quarantine_contract",
      ]);
      const notice = formatPreparationDiagnosticNotice(error);
      assert.match(notice, /^::notice::\{/);
      assert.doesNotMatch(`${error.message}${notice}`, /provider-row-secret-must-not-log/);
      return true;
    },
  );
});

test("Q,P preparation SQL exposes only fixed aggregate evidence and exact safety predicates", async () => {
  const deps = dependencies({ recordedVersions: [quarantineVersion, preparationVersion] });
  await runCatalogueBehavioralProbe({ mode: "recorded", apiUrl, databaseUrl, key }, deps);
  const metadataSql = deps.sql.find((query) => query.includes("'duplicate_preparation_contract'"));
  assert.ok(metadataSql);
  for (const marker of [
    "duplicate_preparation_ledger_contract",
    "duplicate_preparation_acl_contract",
    "duplicate_preparation_generated_column",
    "duplicate_preparation_unique_index",
    "duplicate_preparation_source_check",
    "duplicate_preparation_remaining_candidates",
    "duplicate_preparation_owner_guard_rows",
    "duplicate_preparation_active_promotion_rows",
    "duplicate_preparation_ledger_rows",
    "duplicate_preparation_live_marker_rows",
    "duplicate_preparation_live_recoverable_contract",
    "constraint_definition.confdeltype = 'r'",
    "listing.status IS DISTINCT FROM CASE",
    "listing.tags IS DISTINCT FROM",
    "allocation.ends_at > statement_timestamp()",
  ]) {
    assert.match(metadataSql, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  const ledgerContractSql = metadataSql.slice(
    metadataSql.indexOf("WITH preparation AS MATERIALIZED"),
    metadataSql.indexOf("AS acl_contract"),
  );
  assert.match(ledgerContractSql, /AND 7 = \(/);
  assert.match(ledgerContractSql, /AND 5 = \(/);
  assert.doesNotMatch(metadataSql, /^\s{2}'(?:listing_id|provider_id|previous_tags|previous_status)',/m);
});

test("recorded mode accepts every path-reachable P state and rejects arbitrary P subsets", async () => {
  const reachableStates = [
    [quarantineVersion, preparationVersion],
    [quarantineVersion, preparationVersion, bridgeVersion],
    [quarantineVersion, preparationVersion, bridgeVersion, repairVersion],
    [quarantineVersion, preparationVersion, bridgeVersion, repairVersion, firstVersion],
    [quarantineVersion, preparationVersion, bridgeVersion, repairVersion, firstVersion, secondVersion],
    [quarantineVersion, preparationVersion, firstVersion],
    [quarantineVersion, preparationVersion, firstVersion, secondVersion],
    [quarantineVersion, preparationVersion, bridgeVersion, firstVersion],
    [quarantineVersion, preparationVersion, bridgeVersion, firstVersion, secondVersion],
  ];
  for (const recordedVersions of reachableStates) {
    const deps = dependencies({ recordedVersions });
    const result = await runCatalogueBehavioralProbe(
      { mode: "recorded", apiUrl, databaseUrl, key },
      deps,
    );
    assert.deepEqual(result.recorded_versions, recordedVersions);
    assert.ok(
      deps.sql.some((query) => query.includes("'duplicate_preparation_contract'")),
      `${recordedVersions.join(",")} must certify the preparation ledger`,
    );
  }
  for (const recordedVersions of [
    [preparationVersion],
    [quarantineVersion, preparationVersion, repairVersion],
    [quarantineVersion, preparationVersion, bridgeVersion, repairVersion, secondVersion],
  ]) {
    await assert.rejects(
      runCatalogueBehavioralProbe(
        { mode: "recorded", apiUrl, databaseUrl, key },
        dependencies({ recordedVersions }),
      ),
      /dependency|approved/i,
    );
  }
});

test("P-augmented legacy recovery states fail closed on ledger drift", async () => {
  await assert.rejects(
    runCatalogueBehavioralProbe(
      { mode: "recorded", apiUrl, databaseUrl, key },
      dependencies({
        recordedVersions: [
          quarantineVersion,
          preparationVersion,
          bridgeVersion,
          firstVersion,
        ],
        metadataPatch: { duplicate_preparation_ledger_contract: false },
      }),
    ),
    /duplicate identity preparation/i,
  );
});

test("recorded mode exhaustively accepts the 15 path-reachable Q/B/F/C/H subsets", async () => {
  const versions = [quarantineVersion, bridgeVersion, repairVersion, firstVersion, secondVersion];
  const acceptedMasks = new Set([0, 2, 8, 10, 24, 26, 1, 3, 7, 15, 31, 9, 11, 25, 27]);

  for (let mask = 0; mask < 32; mask += 1) {
    const recordedVersions = versions.filter((_, index) => (mask & (1 << index)) !== 0);
    const hasQ = Boolean(mask & 1);
    const hasB = Boolean(mask & 2);
    const hasC = Boolean(mask & 8);
    const hasH = Boolean(mask & 16);
    const accepted = acceptedMasks.has(mask);
    const run = runCatalogueBehavioralProbe(
      { mode: "recorded", apiUrl, databaseUrl, key },
      dependencies({ recordedVersions }),
    );
    if (!accepted) {
      await assert.rejects(run, /dependency|approved/i, `mask ${mask} must fail closed`);
      continue;
    }
    const result = await run;
    const baseMask = (hasQ ? 1 : 0) | (hasB ? 2 : 0) | (hasC ? 4 : 0) | (hasH ? 8 : 0);
    const expected = new Map([
      [0, "skipped"],
      [1, "invalid_identity_quarantine"],
      [2, "identity_bridge"],
      [3, "quarantine_and_identity_bridge"],
      [4, "first_migration"],
      [5, "quarantine_and_first"],
      [6, "bridge_and_first"],
      [7, "quarantine_bridge_and_first"],
      [12, "catalogue_contract"],
      [13, "quarantine_catalogue_contract"],
      [14, "legacy_full"],
      [15, "full"],
    ]).get(baseMask);
    assert.equal(
      result.skipped ? "skipped" : result.contract_level,
      expected,
      `mask ${mask} has the approved feature contract`,
    );
  }
});

test("recorded probe accepts only known legacy/corrected bridge bodies until F certifies stored parity", async () => {
  const legacy = dependencies({ recordedVersions: [bridgeVersion, firstVersion, secondVersion] });
  await runCatalogueBehavioralProbe({ mode: "recorded", apiUrl, databaseUrl, key }, legacy);
  const legacyMetadata = legacy.sql.find((query) => query.includes("'os_identity_contract'"));
  assert.match(legacyMetadata, /532205de65120d3e34729a515d949f65/);
  assert.match(legacyMetadata, /b98c2a7f368c498c75e221c4064c1878/);
  assert.doesNotMatch(legacyMetadata, /listing\.os_auction_id IS DISTINCT FROM CASE/);

  const repaired = dependencies({
    recordedVersions: [quarantineVersion, bridgeVersion, repairVersion],
  });
  await runCatalogueBehavioralProbe({ mode: "recorded", apiUrl, databaseUrl, key }, repaired);
  const repairedMetadata = repaired.sql.find((query) => query.includes("'os_identity_contract'"));
  assert.doesNotMatch(repairedMetadata, /532205de65120d3e34729a515d949f65/);
  assert.match(repairedMetadata, /b98c2a7f368c498c75e221c4064c1878/);
  assert.match(repairedMetadata, /listing\.os_auction_id IS DISTINCT FROM CASE/);
  for (const exactBridgePredicate of [
    "pg_get_userbyid(procedure.proowner) = 'postgres'",
    "NOT procedure.prosecdef",
    "COALESCE(procedure.proconfig, ARRAY[]::text[]) = ARRAY['search_path=\"\"']::text[]",
    "privilege.privilege_type = 'EXECUTE'",
    "pg_get_userbyid(privilege.grantee) = 'service_role'",
    "index_definition.indpred IS NULL",
    "index_definition.indexprs IS NULL",
    "index_definition.indnatts = 1",
  ]) {
    assert.match(repairedMetadata, new RegExp(exactBridgePredicate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(
    repairedMetadata,
    /btrim\(\s*regexp_replace\(\s*pg_get_expr\(definition\.adbin, definition\.adrelid\),\s*'\[\[:space:\]\]\+',\s*' ',\s*'g'\s*\)\s*\)\s+IN\s*\(/,
  );
  for (const approvedGeneratedExpression of [
    "'CASE WHEN (listing_type = ''auction''::listing_type) THEN private.extract_os_auction_id(tags) ELSE NULL::text END'",
    "'CASE WHEN (listing_type = ''auction''::public.listing_type) THEN private.extract_os_auction_id(tags) ELSE NULL::text END'",
  ]) {
    assert.ok(repairedMetadata.includes(approvedGeneratedExpression));
  }
  assert.doesNotMatch(
    repairedMetadata,
    /btrim\(\s*regexp_replace\(\s*pg_get_expr\(definition\.adbin, definition\.adrelid\),\s*'\[\[:space:\]\]\+',\s*' ',\s*'g'\s*\)\s*\)\s*(?:LIKE|ILIKE|~)/,
  );
  assert.match(repairedMetadata, /regexp_replace\(\s*pg_get_constraintdef\(constraint_definition\.oid\)/);
  assert.doesNotMatch(repairedMetadata, /pg_get_expr\(definition\.adbin, definition\.adrelid\) LIKE/);
  assert.doesNotMatch(repairedMetadata, /pg_get_constraintdef\(constraint_definition\.oid\) LIKE/);
});

test("recorded bridge probe emits fixed boolean-only OS identity components", async () => {
  const deps = dependencies({ recordedVersions: [bridgeVersion] });
  await runCatalogueBehavioralProbe({ mode: "recorded", apiUrl, databaseUrl, key }, deps);
  const metadataSql = deps.sql.find((query) => query.includes("'os_identity_contract'"));

  assert.ok(metadataSql);
  assert.match(metadataSql, /'os_identity_components',\s*json_build_object\(/);
  for (const component of identityComponentKeys) {
    assert.match(metadataSql, new RegExp(`'${component}'`));
  }
  assert.doesNotMatch(metadataSql, /json_build_object\([\s\S]*?'(?:prosrc|proacl|proconfig|expression|tags|listing_id)'/);
});

test("recorded bridge probe reports each failed component using only a fixed aggregate diagnostic", async () => {
  const providerSecret = "provider-row-secret-must-not-log";
  for (const component of identityComponentKeys) {
    const components = { ...validIdentityComponents, [component]: false };
    const deps = dependencies({
      recordedVersions: [bridgeVersion],
      metadataPatch: {
        os_identity_contract: false,
        os_identity_components: components,
        provider_controlled_extra: providerSecret,
      },
    });
    await assert.rejects(
      runCatalogueBehavioralProbe({ mode: "recorded", apiUrl, databaseUrl, key }, deps),
      (error) => {
        assert.match(error.message, /maiprop-os-identity-components/);
        assert.match(error.message, new RegExp(`"${component}":false`));
        assert.doesNotMatch(error.message, new RegExp(providerSecret));
        const diagnostic = JSON.parse(error.message.slice(error.message.indexOf("{")));
        assert.deepEqual(Object.keys(diagnostic), [
          "schema_version",
          "kind",
          "overall_contract",
          ...identityComponentKeys,
        ]);
        assert.equal(diagnostic.schema_version, 1);
        assert.equal(diagnostic.kind, "maiprop-os-identity-components");
        assert.equal(diagnostic.overall_contract, false);
        for (const key of identityComponentKeys) assert.equal(typeof diagnostic[key], "boolean");
        return true;
      },
    );
  }
});

test("recorded bridge probe rejects component schema and overall consistency drift safely", async () => {
  const invalidCases = [
    { os_identity_components: { ...validIdentityComponents, private_detail: true } },
    { os_identity_components: Object.fromEntries(Object.entries(validIdentityComponents).slice(1)) },
    { os_identity_components: { ...validIdentityComponents, extractor_owner: "provider-secret" } },
    { os_identity_components: validIdentityComponents, os_identity_contract: false },
    {
      os_identity_components: { ...validIdentityComponents, source_check: false },
      os_identity_contract: true,
    },
  ];
  for (const metadataPatch of invalidCases) {
    const deps = dependencies({ recordedVersions: [bridgeVersion], metadataPatch });
    await assert.rejects(
      runCatalogueBehavioralProbe({ mode: "recorded", apiUrl, databaseUrl, key }, deps),
      (error) => {
        assert.match(error.message, /OS auction identity (?:component schema|contract)/i);
        assert.doesNotMatch(error.message, /provider-secret|private_detail/);
        return true;
      },
    );
  }
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
    { invalid_identity_quarantine_contract: false },
    { eligible_invalid_os_source_rows: 1 },
    { invalid_identity_quarantine_rows: 2 },
    { invalid_identity_quarantine_live_contract: false },
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
