/**
 * Inventory or delete synthetic public fixture listings from Supabase.
 *
 * Dry-run is the default and is read-only. Deletion requires:
 *   I_KNOW_THIS_IS_PROD=yes CONFIRM_FIXTURE_CLEANUP=delete-public-fixture-listings node scripts/cleanup-production-fixtures.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNotProduction } from "./_prod-guard.mjs";
import { findPublicApiFixtureMarker } from "./public-api-fixture-guard.mjs";

const SCRIPT_NAME = "cleanup-production-fixtures.mjs";
const CONFIRM_VALUE = "delete-public-fixture-listings";
const APPLY = process.argv.includes("--apply");
const SELECT_COLUMNS = "id,title,address,description,city,status,listing_type,is_featured,tags,created_at";
const FIXTURE_TEXT_OR_FILTER = [
  "title.ilike.%supervisor-%",
  "address.ilike.%supervisor-%",
  "description.ilike.%supervisor-%",
  "title.ilike.%E2E-FULL-PUBLISH-%",
  "address.ilike.%E2E-FULL-PUBLISH-%",
  "description.ilike.%E2E-FULL-PUBLISH-%",
  "title.ilike.%qa-full-publish%",
  "address.ilike.%qa-full-publish%",
  "description.ilike.%qa-full-publish%",
  "title.ilike.%Devin Test%",
  "address.ilike.%Devin Test%",
  "description.ilike.%Devin Test%",
  "title.ilike.%Test Free Listing%",
  "address.ilike.%Test Free Listing%",
  "description.ilike.%Test Free Listing%",
].join(",");
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const envPath = join(root, ".env");

function loadEnv() {
  if (!existsSync(envPath)) return {};
  const text = readFileSync(envPath, "utf8");
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) out[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...process.env, ...loadEnv() };
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Need VITE_SUPABASE_URL or SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

if (APPLY) {
  if (env.CONFIRM_FIXTURE_CLEANUP !== CONFIRM_VALUE) {
    console.error(`Refusing to delete. Set CONFIRM_FIXTURE_CLEANUP=${CONFIRM_VALUE}.`);
    process.exit(2);
  }
  assertNotProduction(url, SCRIPT_NAME);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

async function fetchFixtureListings() {
  const textResult = await supabase
    .from("listings")
    .select(SELECT_COLUMNS)
    .or(FIXTURE_TEXT_OR_FILTER)
    .order("created_at", { ascending: false })
    .limit(500);

  if (textResult.error) throw textResult.error;

  const tagResult = await supabase
    .from("listings")
    .select(SELECT_COLUMNS)
    .contains("tags", ["qa-full-publish"])
    .order("created_at", { ascending: false })
    .limit(500);

  if (tagResult.error) throw tagResult.error;

  const byId = new Map();
  for (const row of [...(textResult.data ?? []), ...(tagResult.data ?? [])]) {
    if (findPublicApiFixtureMarker(row)) byId.set(row.id, row);
  }

  return [...byId.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

function summarize(rows) {
  const byStatus = new Map();
  const byType = new Map();
  const byMarker = new Map();
  for (const row of rows) {
    byStatus.set(row.status ?? "(null)", (byStatus.get(row.status ?? "(null)") ?? 0) + 1);
    byType.set(row.listing_type ?? "(null)", (byType.get(row.listing_type ?? "(null)") ?? 0) + 1);
    const marker = findPublicApiFixtureMarker(row)?.marker ?? "unknown";
    byMarker.set(marker, (byMarker.get(marker) ?? 0) + 1);
  }
  return {
    total: rows.length,
    featured: rows.filter((row) => row.is_featured).length,
    by_marker: Object.fromEntries(byMarker),
    by_status: Object.fromEntries(byStatus),
    by_listing_type: Object.fromEntries(byType),
  };
}

async function run() {
  const rows = await fetchFixtureListings();
  const summary = summarize(rows);
  console.log(JSON.stringify({ mode: APPLY ? "apply" : "dry-run", summary }, null, 2));

  for (const row of rows.slice(0, 25)) {
    const marker = findPublicApiFixtureMarker(row)?.marker ?? "unknown";
    console.log(`- ${row.id} | ${marker} | ${row.status}/${row.listing_type} | ${row.title || row.address || "(untitled)"}`);
  }
  if (rows.length > 25) console.log(`... ${rows.length - 25} more row(s) omitted`);

  if (!APPLY || rows.length === 0) return;

  const ids = rows.map((row) => row.id);
  const { error: imageDeleteError } = await supabase.from("listing_images").delete().in("listing_id", ids);
  if (imageDeleteError) throw imageDeleteError;

  const { error: listingDeleteError } = await supabase.from("listings").delete().in("id", ids);
  if (listingDeleteError) throw listingDeleteError;

  console.log(`Deleted ${ids.length} public fixture listing(s).`);
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
