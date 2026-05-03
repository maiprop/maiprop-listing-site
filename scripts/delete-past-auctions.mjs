/**
 * One-off: delete all auction listings whose auction_date is today or before.
 * Requires SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_URL (or SUPABASE_URL).
 * Run: node scripts/delete-past-auctions.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { assertNotProduction } from "./_prod-guard.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const envPath = join(root, ".env");

function loadEnv() {
  if (!existsSync(envPath)) return {};
  const text = readFileSync(envPath, "utf8");
  const out = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...process.env, ...loadEnv() };
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. in .env)");
  process.exit(1);
}

assertNotProduction(url, "delete-past-auctions.mjs");

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

// End of today UTC
const now = new Date();
const endOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
const endOfTodayISO = endOfToday.toISOString();

async function run() {
  const { data: rows, error: selectErr } = await supabase
    .from("listings")
    .select("id, title, auction_date")
    .eq("listing_type", "auction")
    .not("auction_date", "is", null)
    .lte("auction_date", endOfTodayISO);

  if (selectErr) {
    console.error("Select error:", selectErr.message);
    process.exit(1);
  }

  if (!rows?.length) {
    console.log("No auctions with date on or before today. Done.");
    return;
  }

  console.log(`Found ${rows.length} auction(s) to delete (auction_date <= ${endOfTodayISO}):`);
  rows.forEach((r) => console.log(`  - ${r.id} | ${r.title || "—"} | ${r.auction_date}`));

  const ids = rows.map((r) => r.id);
  const { error: deleteErr } = await supabase.from("listings").delete().in("id", ids);

  if (deleteErr) {
    console.error("Delete error:", deleteErr.message);
    process.exit(1);
  }

  console.log(`Deleted ${ids.length} listing(s).`);
}

run();
