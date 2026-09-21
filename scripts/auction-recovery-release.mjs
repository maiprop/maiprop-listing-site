import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { AUCTION_LIVE_BASE, AUCTION_SOURCE_OVERLAYS } from "./prepare-auction-only-source.mjs";
import { createReleaseArtifact, verifyReleaseArtifact } from "./production-release-artifact.mjs";

export const AUCTION_RECOVERY_MIGRATION = Object.freeze({
  version: "20260921055243",
  name: "restore_auction_only_reader_capabilities",
  path: "supabase/migrations/20260921055243_restore_auction_only_reader_capabilities.sql",
  sha256: "358340988a8acc7042f283a07a5c267a43171d93e5acc5b42171eb1534225a3c",
});
export const AUCTION_HISTORY_SQL = `SELECT coalesce(json_agg(t ORDER BY version),'[]'::json) FROM (
 SELECT version,name,encode(sha256(convert_to(coalesce(array_to_json(statements)::text,''),'UTF8')),'hex') AS statements_sha256,
 coalesce(cardinality(statements),0) AS statement_count FROM supabase_migrations.schema_migrations) t`;
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const read = path => JSON.parse(readFileSync(path, "utf8"));
function fail(message) { throw new Error(`Auction recovery: ${message}`); }
export function validateAuctionRecoverySource(source, sha) {
  if (source?.schema_version !== 1 || source.scope !== "auction-only-source-preparation" || source.source_sha !== sha || !/^[a-f0-9]{64}$/.test(source.source_sha256 ?? "")) fail("source identity mismatch");
  if (source.base_sha !== AUCTION_LIVE_BASE) fail("baseline mismatch");
  if (JSON.stringify(source.changed_paths) !== JSON.stringify([...AUCTION_SOURCE_OVERLAYS].sort())) fail("overlay mismatch");
  return source;
}
export function validateAuctionRecoveryHistory(before, after) {
  const v = AUCTION_RECOVERY_MIGRATION.version;
  if (!Array.isArray(before) || !Array.isArray(after)) fail("history inventories are required");
  const sorted = rows => rows.slice().sort((a,b) => String(a.version).localeCompare(String(b.version)));
  if (new Set(before.map(r => r.version)).size !== before.length || new Set(after.map(r => r.version)).size !== after.length) fail("duplicate history versions");
  if (JSON.stringify(sorted(before.filter(r => r.version !== v))) !== JSON.stringify(sorted(after.filter(r => r.version !== v)))) fail("unrelated migration history changed");
  const added = after.find(r => r.version === v);
  if (!added || added.name !== AUCTION_RECOVERY_MIGRATION.name || added.statement_count < 1) fail("recovery migration is absent or malformed");
  const previous = before.find(r => r.version === v);
  if (previous && JSON.stringify(previous) !== JSON.stringify(added)) fail("existing recovery history changed");
  return true;
}
export function validateAuctionRecoveryControl(c) {
  if (!/^[a-f0-9]{40}$/.test(c.sha ?? "") || [c.currentMain,c.checkout,c.workflowSha].some(v => v !== c.sha) || c.ref !== "refs/heads/main" || c.event !== "workflow_dispatch" || c.attempt !== "1" || c.actor !== "krenios" || c.triggeringActor !== c.actor) fail("untrusted release control identity");
  const ci = c.ci;
  if (!ci || ci.conclusion !== "success" || ci.event !== "push" || ci.head_branch !== "main" || ci.head_sha !== c.sha || ci.run_attempt !== 1 || ci.path !== ".github/workflows/ci.yml" || ci.actor?.login !== ci.triggering_actor?.login) fail("successful original main CI is required");
  return true;
}
export function verifyAuctionMigration(root) {
  const bytes = readFileSync(join(root, AUCTION_RECOVERY_MIGRATION.path));
  if (hash(bytes) !== AUCTION_RECOVERY_MIGRATION.sha256) fail("migration digest mismatch");
  return bytes;
}
export function verifyAuctionArtifact(root, sha, runId) {
  const manifest = verifyReleaseArtifact(root, { releaseSha: sha, runId, runAttempt: "1" });
  const scope = read(join(root, "dist/auction-recovery.json"));
  validateAuctionRecoverySource(scope.source, sha);
  if (JSON.stringify(scope.migration) !== JSON.stringify(AUCTION_RECOVERY_MIGRATION)) fail("migration scope mismatch");
  verifyAuctionMigration(root);
  return manifest;
}
export function validateAuctionStagingProof(root, sha, runId) {
  const smoke=read(join(root,"smoke.json")), db=read(join(root,"database.json")), cleanup=read(join(root,"fixture-cleanup.json"));
  if(smoke.release_sha!==sha || smoke.run_id!==runId || smoke.scope!=="auctions" || smoke.anonymous_total!==60 || smoke.free_limit!==60 || smoke.paid_limit!==600 || ![smoke.pagination,smoke.city_filter,smoke.uuid_and_provider_details,smoke.authenticated_actions].every(v=>v===true)) fail("staging behavior proof is incomplete");
  if(![db.capabilities,db.unrelated_schema_unchanged,db.history_preserved].every(v=>v===true) || cleanup.run_id!==runId || cleanup.listings_removed!==650 || cleanup.accounts_removed!==2) fail("staging database or cleanup proof is incomplete");
  return true;
}
export function auctionCapabilitiesSql(sqlText) {
  const expected = ["get_public_auction_candidates", "get_current_auction_listing_visible_limit", "get_visible_auction_candidate_envelope"].map(name => {
    const start = sqlText.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    const rest = sqlText.slice(start);
    const delimiter = rest.match(/AS (\$[a-z_]*\$)/i);
    if (start < 0 || !delimiter) fail("missing function definition");
    const bodyStart = delimiter.index + delimiter[0].length;
    const bodyEnd = rest.indexOf(delimiter[1]+";",bodyStart);
    const bodyHash = createHash("md5").update(rest.slice(bodyStart,bodyEnd)).digest("hex");
    return `('${name}','${bodyHash}')`;
  });
  const postcheck = sqlText.slice(sqlText.lastIndexOf("DO $$"), sqlText.indexOf("NOTIFY pgrst"));
  if (!postcheck.includes("auction_recovery_order_index_invalid")) fail("missing capability assertions");
  const dependencies=sqlText.slice(sqlText.indexOf("DO $$"),sqlText.indexOf("CREATE OR REPLACE FUNCTION"));
  return `${dependencies}\n${postcheck}\nSELECT count(*)=3 AND bool_and(p.prosecdef AND p.provolatile='s' AND pg_get_userbyid(p.proowner)='postgres' AND md5(p.prosrc)=e.body_hash)
    FROM (VALUES ${expected.join(",")}) e(name,body_hash) LEFT JOIN pg_proc p ON p.proname=e.name AND p.pronamespace='public'::regnamespace;`;
}

// Catalog-only fingerprint: live application writes never affect this comparison.
export const AUCTION_UNRELATED_SCHEMA_SQL = `WITH objects AS (
 SELECT 'routine:'||p.oid::regprocedure::text AS identity, pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'') AS definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.prokind IN ('f','p')
 AND NOT (n.nspname='public' AND p.proname IN ('get_public_auction_candidates','get_current_auction_listing_visible_limit','get_visible_auction_candidate_envelope'))
 UNION ALL SELECT 'relation:'||c.oid::regclass::text, concat_ws('|',c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relacl,pg_get_userbyid(c.relowner))
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND c.relname<>'idx_listings_public_auction_order_v1'
 UNION ALL SELECT 'column:'||a.attrelid::regclass::text||':'||a.attname, concat_ws('|',a.atttypid::regtype,a.atttypmod,a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid))
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE n.nspname IN ('public','private') AND a.attnum>0 AND NOT a.attisdropped AND c.relname<>'idx_listings_public_auction_order_v1'
 UNION ALL SELECT 'constraint:'||conrelid::regclass::text||':'||conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace IN ('public'::regnamespace,'private'::regnamespace)
 UNION ALL SELECT 'policy:'||polrelid::regclass::text||':'||polname,concat_ws('|',polcmd,polpermissive,polroles,pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid)) FROM pg_policy
 WHERE polrelid IN (SELECT oid FROM pg_class WHERE relnamespace IN ('public'::regnamespace,'private'::regnamespace))
 UNION ALL SELECT 'index:'||indexrelid::regclass::text,pg_get_indexdef(indexrelid) FROM pg_index WHERE indrelid IN (SELECT oid FROM pg_class WHERE relnamespace IN ('public'::regnamespace,'private'::regnamespace)) AND indexrelid<>coalesce(to_regclass('public.idx_listings_public_auction_order_v1'),0)
 UNION ALL SELECT 'trigger:'||tgrelid::regclass::text||':'||tgname,pg_get_triggerdef(oid)||tgenabled::text FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace IN ('public'::regnamespace,'private'::regnamespace))
 UNION ALL SELECT 'enum:'||enumtypid::regtype::text||':'||enumlabel,enumsortorder::text FROM pg_enum WHERE enumtypid IN (SELECT oid FROM pg_type WHERE typnamespace IN ('public'::regnamespace,'private'::regnamespace))
) SELECT encode(sha256(convert_to(string_agg(identity||'='||definition,E'\\n' ORDER BY identity),'UTF8')),'hex') FROM objects;`;

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "package") {
    const [prepared, out, sha, tree, runId] = args;
    const source = validateAuctionRecoverySource(read(`${prepared}.manifest.json`), sha);
    verifyAuctionMigration(process.cwd());
    const publicSource = { schema_version: source.schema_version, scope: source.scope, base_sha: source.base_sha, source_sha: source.source_sha, source_sha256: source.source_sha256, changed_paths: source.changed_paths };
    writeFileSync(join(prepared,"dist/auction-recovery.json"), JSON.stringify({ schema_version: 1, marker_identity: "control commit and build recipe; source records the bounded website overlay", source: publicSource, migration: AUCTION_RECOVERY_MIGRATION },null,2)+"\n");
    createReleaseArtifact({ distDir: join(prepared,"dist"), sbomPath: join(prepared,"sbom.cdx.json"), supabaseDir: "supabase", outDir: out, releaseSha: sha, sourceTree: tree, runId, runAttempt: "1" });
    verifyAuctionArtifact(out,sha,runId);
    return;
  }
  if (command === "verify") { verifyAuctionArtifact(args[0],args[1],args[2]); return; }
  if (command === "staging-proof") { validateAuctionStagingProof(args[0],args[1],args[2]); return; }
  if (command === "history-sql") { process.stdout.write(AUCTION_HISTORY_SQL); return; }
  if (command === "schema-sql") { process.stdout.write(AUCTION_UNRELATED_SCHEMA_SQL); return; }
  if (command === "history-check") { validateAuctionRecoveryHistory(read(args[0]),read(args[1])); return; }
  if (command === "capabilities-sql") { process.stdout.write(auctionCapabilitiesSql(verifyAuctionMigration(args[0]).toString())); return; }
  if (command === "prepare-db") {
    const [artifact, historyPath, work] = args;
    const history = read(historyPath); verifyAuctionMigration(artifact);
    if (existsSync(work)) fail("database workspace already exists");
    mkdirSync(join(work,"supabase/migrations"),{ recursive:true });
    writeFileSync(join(work,"supabase/config.toml"),'[api]\nenabled = false\n');
    for (const row of history) {
      if (!/^\d+$/.test(row.version)) fail("non-numeric remote migration version");
      if (row.version === AUCTION_RECOVERY_MIGRATION.version) continue;
      writeFileSync(join(work,"supabase/migrations",`${row.version}_remote_history_placeholder.sql`),"-- Existing remote history only; never pending SQL.\n");
    }
    writeFileSync(join(work,AUCTION_RECOVERY_MIGRATION.path),verifyAuctionMigration(artifact));
    writeFileSync(join(work,"remote-numeric-history.txt"),history.map(r=>r.version).join("\n")+"\n");
    writeFileSync(join(work,"contract.json"),JSON.stringify({hotfix:{migrations:[AUCTION_RECOVERY_MIGRATION]}}));
    return;
  }
  if (command === "control") {
    const [currentMain,checkout,ciPath] = args;
    validateAuctionRecoveryControl({sha:process.env.RELEASE_SHA,currentMain,checkout,workflowSha:process.env.GITHUB_WORKFLOW_SHA,ref:process.env.GITHUB_REF,event:process.env.GITHUB_EVENT_NAME,attempt:process.env.GITHUB_RUN_ATTEMPT,actor:process.env.GITHUB_ACTOR,triggeringActor:process.env.GITHUB_TRIGGERING_ACTOR,ci:read(ciPath)});
    return;
  }
  fail("unknown release command");
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
