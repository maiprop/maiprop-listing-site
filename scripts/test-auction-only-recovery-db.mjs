#!/usr/bin/env node
// Starts its own disposable local database. Never accepts a remote connection URL.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { auctionCapabilitiesSql, AUCTION_UNRELATED_SCHEMA_SQL } from "./auction-recovery-release.mjs";
import { auctionFixtureSql } from "./auction-recovery-fixtures.mjs";
import { randomUUID } from "node:crypto";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = resolve(tmpdir());
const workspace = mkdtempSync(join(temporaryRoot, "maiprop-auction-db-test-"));
const dataDir = join(workspace, "data");
const executable = name => process.env.PG_BIN ? join(process.env.PG_BIN, name) : name;
const migration = join(repo, "supabase/migrations/20260921055243_restore_auction_only_reader_capabilities.sql");
let started = false;
let checks = 0;
function command(name, args, expected = 0) {
  const result = spawnSync(executable(name), args, {
    encoding: "utf8", windowsHide: true, timeout: 60000,
    // A server child can retain captured Windows pipe handles after pg_ctl exits.
    // The server itself writes to the private log selected by -l.
    stdio: name === "pg_ctl" ? "ignore" : "pipe",
    env: { ...process.env, PGCONNECT_TIMEOUT: "5", PGHOST: "127.0.0.1", PGUSER: "postgres", PGPASSWORD: "" },
    cwd: repo,
  });
  if (result.error) throw result.error;
  if (expected === "failure") assert.notEqual(result.status, 0, "Expected database rejection");
  else assert.equal(result.status, expected, `${name}: ${result.stderr}\n${result.stdout}`);
  return result;
}
const port = await new Promise((resolvePort, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const selected = server.address().port;
    server.close(error => error ? reject(error) : resolvePort(selected));
  });
});
const baseArgs = ["-X", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"];
const sql = (query, expected = 0) => {
  if(query.length<8000) return command("psql", [...baseArgs,"-c",query],expected).stdout.trim();
  const path=join(workspace,"query.sql");writeFileSync(path,query);return command("psql",[...baseArgs,"-f",path],expected).stdout.trim();
};
const file = (path, expected = 0) => command("psql", [...baseArgs, "-1", "-f", path], expected);
const envelope = "public.get_visible_auction_candidate_envelope";
function asRole(role, sub, query) {
  return sql(`SET ROLE ${role}; SET request.jwt.claim.sub='${sub}'; ${query}`);
}
function check(label, actual, expected) {
  assert.deepEqual(actual, expected, label); checks++;
  console.log(`PASS ${label}`);
}
const untouched = `SELECT md5(jsonb_build_object(
  'leads',(SELECT jsonb_agg(t) FROM public.marketing_leads t),
  'history',(SELECT jsonb_agg(t) FROM supabase_migrations.schema_migrations t),
  'listings',(SELECT jsonb_agg(t ORDER BY id) FROM public.listings t),
  'images',(SELECT jsonb_agg(t ORDER BY id) FROM public.listing_images t),
  'entitlement',pg_get_functiondef('public.get_auction_listing_visible_limit(uuid)'::regprocedure),
  'entitlement_acl',(SELECT proacl::TEXT FROM pg_proc WHERE oid='public.get_auction_listing_visible_limit(uuid)'::regprocedure)
)::TEXT)`;
try {
  command("initdb", ["-D", dataDir, "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--locale=C"]);
  command("pg_ctl", ["-D", dataDir, "-l", join(workspace, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]);
  started = true;
  file(join(repo, "supabase/tests/auction_only_recovery_fixture.sql"));
  let before = sql(untouched);
  const schemaBefore = sql(AUCTION_UNRELATED_SCHEMA_SQL);
  const red = command("psql", [...baseArgs, "-c", `SELECT * FROM ${envelope}()`], "failure");
  assert.match(red.stderr, /does not exist/);
  console.log("RED reproduced missing auction reader");
  file(migration);
  check("release fingerprint preserves unrelated schema", sql(AUCTION_UNRELATED_SCHEMA_SQL), schemaBefore);
  check("release capability probe verifies deployed bodies and permissions", sql(auctionCapabilitiesSql(readFileSync(migration,"utf8"))), "t");
  const anon = query => asRole("anon", "", query);
  const free = query => asRole("authenticated", "00000000-0000-4000-8000-000000000060", query);
  const paid = query => asRole("authenticated", "00000000-0000-4000-8000-000000000600", query);
  check("anonymous capped at 60", anon(`SELECT jsonb_array_length(visible_rows) FROM ${envelope}(p_limit=>600)`), "60");
  check("free caller capped at 60", free(`SELECT jsonb_array_length(visible_rows) FROM ${envelope}(p_limit=>600)`), "60");
  check("paid caller gets 600", paid(`SELECT jsonb_array_length(visible_rows) FROM ${envelope}(p_limit=>6000)`), "600");
  check("negative limit stays bounded", anon(`SELECT jsonb_array_length(visible_rows) FROM ${envelope}(p_limit=>-5)`), "1");
  check("null limit stays bounded", anon(`SELECT jsonb_array_length(visible_rows) FROM ${envelope}(p_limit=>NULL)`), "1");
  check("excluded listings are absent", paid(`SELECT count(*) FROM ${envelope}(p_limit=>600),jsonb_array_elements(visible_rows) r WHERE r->>'title' LIKE 'Excluded%'`), "0");
  check("city filtering retains pool metadata", anon(`SELECT total_raw||':'||jsonb_array_length(visible_rows)||':'||array_length(facet_cities,1) FROM ${envelope}(p_limit=>60,p_city=>'Patras')`), "250:60:2");
  check("bid range filters server-side", anon(`SELECT total_raw||':'||jsonb_array_length(visible_rows) FROM ${envelope}(p_bid_min=>10000,p_bid_max=>20000)`), "11:11");
  check("unknown city returns honest empty result", anon(`SELECT pool_exists||':'||total_raw||':'||jsonb_array_length(visible_rows) FROM ${envelope}(p_city=>'Nowhere')`), "true:0:0");
  check("missing daily pool is explicitly empty", anon(`SELECT pool_exists||':'||total_raw||':'||jsonb_array_length(visible_rows) FROM ${envelope}(p_pool_tag=>'auction_pool:1900-01-01')`), "false:0:0");
  check("priority stream remains available", anon(`SELECT total_raw||':'||jsonb_array_length(visible_rows) FROM ${envelope}(p_stream=>'priority')`), "10:10");
  check("private fields are absent", anon(`SELECT EXISTS(SELECT 1 FROM ${envelope}(),jsonb_array_elements(visible_rows) r WHERE r ? 'owner_email' OR r ? 'private_notes')`), "f");
  check("at most three ordered card images", anon(`SELECT jsonb_array_length(visible_rows->0->'listing_images')||':'||(visible_rows->0->'listing_images'->0->>'sort_order') FROM ${envelope}()`), "3:1");
  check("stable first auction identity", anon(`SELECT visible_rows->0->>'id' FROM ${envelope}()`), sql("SELECT md5('1')::UUID"));
  for (const role of ["anon", "authenticated"]) {
    const denied = command("psql", [...baseArgs, "-c", `SET ROLE ${role}; SELECT * FROM public.get_public_auction_candidates()`], "failure");
    assert.match(denied.stderr, /permission denied/); checks++;
    const tableDenied = command("psql", [...baseArgs, "-c", `SET ROLE ${role}; SELECT * FROM public.listings`], "failure");
    assert.match(tableDenied.stderr, /permission denied/); checks++;
  }
  check("paid entitlement is caller-derived", paid("SELECT public.get_current_auction_listing_visible_limit()"), "600");
  check("free entitlement is caller-derived", free("SELECT public.get_current_auction_listing_visible_limit()"), "60");
  check("non-auction data, history and entitlement unchanged", sql(untouched), before);
  file(migration);
  check("repeat application leaves existing data unchanged", sql(untouched), before);
  check("repeat application retains bounded public access", anon(`SELECT jsonb_array_length(visible_rows) FROM ${envelope}(p_limit=>600)`), "60");
  check("anonymous direct RPC cannot apply premium ownership filter", anon(`SELECT total_raw FROM ${envelope}(p_ownership=>'bare')`), "600");
  check("free direct RPC cannot apply premium round filter", free(`SELECT total_raw FROM ${envelope}(p_round=>'3plus')`), "600");
  check("free direct RPC cannot apply premium yield filter", free(`SELECT total_raw FROM ${envelope}(p_yield=>'not-a-tier')`), "600");
  check("paid premium filters remain functional", paid(`SELECT total_raw FROM ${envelope}(p_ownership=>'bare')`), "0");
  check("public caller cannot revive expired auctions with a backdated clock", anon(`SELECT count(*) FROM ${envelope}(p_today=>'1900-01-01'),jsonb_array_elements(visible_rows) r WHERE r->>'title'='Excluded fixture 5'`), "0");
  check("public caller cannot reclassify priority with a future clock", anon(`SELECT total_raw FROM ${envelope}(p_stream=>'priority',p_now=>'2999-01-01')`), "10");
  check("null public clock retains current eligible auctions", anon(`SELECT total_raw FROM ${envelope}(p_today=>NULL,p_now=>NULL)`), "600");
  sql("GRANT EXECUTE ON FUNCTION public.get_public_auction_candidates(INTEGER,TEXT,DATE,TIMESTAMPTZ,TEXT) TO anon");
  sql(auctionCapabilitiesSql(readFileSync(migration,"utf8")),"failure");checks++;
  file(migration);
  // Exercise real fixture INSERT/DELETE statements against local tables. The publication
  // mock tests scope and SQL syntax; actual publication behavior is a staging gate.
  sql(`ALTER TABLE public.listings ADD COLUMN owner_id uuid, ADD COLUMN description text, ADD COLUMN postal_code text, ADD COLUMN created_at timestamptz, ADD COLUMN updated_at timestamptz;
    CREATE TABLE public.profiles(user_id uuid PRIMARY KEY,role text,participant_type text,force_pro_access boolean,display_name text);
    CREATE TABLE public.listing_reports(reporter_id uuid,entity_id uuid);
    CREATE TABLE public.favorites(user_id uuid,listing_id uuid);
    CREATE FUNCTION public.get_public_catalogue_publication(bigint) RETURNS TABLE(snapshot_minute timestamptz) LANGUAGE sql AS $$ SELECT now()-interval '1 day' $$;
    CREATE FUNCTION private.publish_public_catalogue() RETURNS TABLE(publication_id bigint) LANGUAGE sql AS $$ SELECT 1::bigint $$;
    CREATE FUNCTION public.get_public_catalogue_listing(bigint,uuid,text) RETURNS TABLE(id uuid) LANGUAGE sql AS $$ SELECT id FROM public.listings WHERE id=$2 $$;`);
  const fixtureState={run_id:"123456",tag:"auction-recovery:123456",listings:Array.from({length:650},()=>randomUUID()),users:["free","paid"].map(tier=>({id:randomUUID(),tier,email:`auction-123456-${tier}@maiprop.demo`}))};
  sql(`INSERT INTO public.profiles(user_id) VALUES ${fixtureState.users.map(u=>`('${u.id}')`).join(",")}`);
  const existingCount=sql("SELECT count(*) FROM public.listings");
  sql(auctionFixtureSql(fixtureState,"seed"));
  check("staging SQL creates 650 run-owned auction fixtures",sql("SELECT count(*) FROM public.listings WHERE tags @> ARRAY['auction-recovery:123456']"),"650");
  check("staging profiles preserve tier distinction",sql("SELECT string_agg(force_pro_access::text,',' ORDER BY display_name) FROM public.profiles"),"false,true");
  sql(auctionFixtureSql(fixtureState,"cleanup"));
  check("fixture cleanup preserves all earlier auction records",sql("SELECT count(*) FROM public.listings"),existingCount);
  before=sql(untouched);
  sql(`DROP FUNCTION public.get_visible_auction_candidate_envelope(INTEGER,TEXT,DATE,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,INTEGER,INTEGER,NUMERIC,NUMERIC,TEXT,TEXT,TEXT);
    DROP FUNCTION public.get_current_auction_listing_visible_limit();
    DROP FUNCTION public.get_public_auction_candidates(INTEGER,TEXT,DATE,TIMESTAMPTZ,TEXT);
    DROP INDEX public.idx_listings_public_auction_order_v1;
    CREATE INDEX idx_listings_public_auction_order_v1 ON public.listings(id);`);
  const badIndex = file(migration, "failure");
  assert.match(badIndex.stderr, /auction_recovery_order_index_invalid/); checks++;
  check("incompatible index rolls back all restored functions", sql(`SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('get_public_auction_candidates','get_current_auction_listing_visible_limit','get_visible_auction_candidate_envelope')`), "0");
  check("failed transaction preserves existing data and history", sql(untouched), before);
  sql("GRANT EXECUTE ON FUNCTION public.get_auction_listing_visible_limit(UUID) TO anon");
  const exposedHelper = file(migration, "failure");
  assert.match(exposedHelper.stderr, /auction_entitlement_helper_must_already_be_private/); checks++;
  sql("REVOKE EXECUTE ON FUNCTION public.get_auction_listing_visible_limit(UUID) FROM anon; DROP FUNCTION public.get_auction_listing_visible_limit(UUID)");
  const missingHelper = file(migration, "failure");
  assert.match(missingHelper.stderr, /auction_recovery_dependency_missing/); checks++;
  console.log(`Auction-only PostgreSQL recovery: ${checks} checks passed, including repeat application.`);
} catch (error) {
  if (started) {
    const log = readFileSync(join(workspace, "postgres.log"), "utf8");
    console.error(log.slice(-4000));
  }
  throw error;
} finally {
  const serverMayBeRunning = started || existsSync(join(dataDir, "postmaster.pid"));
  let stopped = !serverMayBeRunning;
  if (serverMayBeRunning) {
    const result = command("pg_ctl", ["-D", dataDir, "-m", "fast", "-w", "stop"]);
    stopped = result.status === 0 && !existsSync(join(dataDir, "postmaster.pid"));
  }
  const target = resolve(workspace);
  if (stopped && target.startsWith(temporaryRoot + sep) && target.includes("maiprop-auction-db-test-")) {
    rmSync(target, { recursive: true, force: true });
  }
}
