/**
 * Inventory or remove synthetic professional directory fixtures.
 *
 * Dry-run is read-only:
 *   node scripts/cleanup-professional-fixtures.mjs
 *
 * Default apply archives matching rows so they disappear from the public
 * directory without breaking historical consultation/CRM references:
 *   I_KNOW_THIS_IS_PROD=yes CONFIRM_PROFESSIONAL_FIXTURE_CLEANUP=archive-professional-fixtures node scripts/cleanup-professional-fixtures.mjs --apply
 *
 * Hard delete is intentionally separate and also deletes direct child rows:
 *   I_KNOW_THIS_IS_PROD=yes CONFIRM_PROFESSIONAL_FIXTURE_CLEANUP=archive-professional-fixtures node scripts/cleanup-professional-fixtures.mjs --apply --hard-delete
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNotProduction } from "./_prod-guard.mjs";

const SCRIPT_NAME = "cleanup-professional-fixtures.mjs";
const CONFIRM_VALUE = "archive-professional-fixtures";
const APPLY = process.argv.includes("--apply");
const HARD_DELETE = process.argv.includes("--hard-delete");
const SELECT_COLUMNS = "id,user_id,display_name,title,category,city,archived_at,created_at";
const FIXTURE_OR_FILTER = [
  "display_name.ilike.Codex E2E%",
  "title.ilike.Codex E2E%",
  "display_name.ilike.Trial Professional%",
  "title.ilike.Trial Professional%",
  "display_name.ilike.Code Live Probe Professional%",
  "title.ilike.Code Live Probe Professional%",
  "display_name.ilike.Stripe Diagnostic Profile%",
  "title.ilike.Stripe Diagnostic Profile%",
  "display_name.ilike.Stripe Payment E2E%",
  "title.ilike.Stripe Payment E2E%",
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
  if (env.CONFIRM_PROFESSIONAL_FIXTURE_CLEANUP !== CONFIRM_VALUE) {
    console.error(`Refusing to mutate. Set CONFIRM_PROFESSIONAL_FIXTURE_CLEANUP=${CONFIRM_VALUE}.`);
    process.exit(2);
  }
  assertNotProduction(url, SCRIPT_NAME);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

async function deleteIn(table, column, values) {
  if (values.length === 0) return 0;
  const { error, count } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .in(column, values);
  if (error) throw new Error(`${table}.${column} cleanup failed: ${error.message}`);
  return count ?? 0;
}

async function fetchFixtureProfessionals() {
  const { data, error } = await supabase
    .from("professionals")
    .select(SELECT_COLUMNS)
    .or(FIXTURE_OR_FILTER)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data ?? [];
}

function summarize(rows) {
  const byCategory = new Map();
  const archived = rows.filter((row) => row.archived_at).length;
  for (const row of rows) {
    byCategory.set(row.category ?? "(null)", (byCategory.get(row.category ?? "(null)") ?? 0) + 1);
  }
  return {
    total: rows.length,
    archived,
    active: rows.length - archived,
    by_category: Object.fromEntries(byCategory),
  };
}

async function archiveProfessionals(rows) {
  const activeIds = rows.filter((row) => !row.archived_at).map((row) => row.id);
  if (activeIds.length === 0) return 0;
  const { error, count } = await supabase
    .from("professionals")
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { count: "exact" })
    .in("id", activeIds);
  if (error) throw new Error(`professionals archive failed: ${error.message}`);
  return count ?? 0;
}

async function hardDeleteProfessionals(rows) {
  const ids = rows.map((row) => row.id);
  const deleted = {};
  deleted.professional_review_responses = await deleteIn("professional_review_responses", "professional_id", ids);
  deleted.professional_reviews = await deleteIn("professional_reviews", "professional_id", ids);
  deleted.professional_availability = await deleteIn("professional_availability", "professional_id", ids);
  deleted.professional_services = await deleteIn("professional_services", "professional_id", ids);
  deleted.professionals = await deleteIn("professionals", "id", ids);
  return deleted;
}

async function run() {
  const rows = await fetchFixtureProfessionals();
  console.log(JSON.stringify({ mode: APPLY ? (HARD_DELETE ? "hard-delete" : "archive") : "dry-run", summary: summarize(rows) }, null, 2));
  for (const row of rows.slice(0, 25)) {
    console.log(`- ${row.id} | ${row.category ?? "(no category)"} | ${row.archived_at ? "archived" : "active"} | ${row.display_name || row.title || "(untitled)"}`);
  }
  if (rows.length > 25) console.log(`... ${rows.length - 25} more row(s) omitted`);

  if (!APPLY || rows.length === 0) return;

  if (HARD_DELETE) {
    console.log(JSON.stringify({ deleted: await hardDeleteProfessionals(rows) }, null, 2));
  } else {
    console.log(JSON.stringify({ archived: await archiveProfessionals(rows) }, null, 2));
  }
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
