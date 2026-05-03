/**
 * One-off: delete ALL rows from the listings table.
 * Requires SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_URL (or SUPABASE_URL) in .env
 * Run: node scripts/wipe-all-listings.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import * as readline from "readline";
import { assertNotProduction } from "./_prod-guard.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const envPath = join(root, ".env");

function loadEnv() {
  if (!existsSync(envPath)) return {};
  const text = readFileSync(envPath, "utf8");
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...process.env, ...loadEnv() };
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

assertNotProduction(url, "wipe-all-listings.mjs");

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function run() {
  const { count, error: countErr } = await supabase
    .from("listings")
    .select("*", { count: "exact", head: true });

  if (countErr) {
    console.error("Count error:", countErr.message);
    process.exit(1);
  }

  console.log(`Found ${count ?? "unknown"} listing(s) in the database.`);

  if (!count) {
    console.log("Nothing to delete. Done.");
    return;
  }

  const answer = await confirm(`\nAre you sure you want to permanently delete ALL ${count} listing(s)? Type "yes" to confirm: `);
  if (answer !== "yes") {
    console.log("Aborted.");
    return;
  }

  const { error: deleteErr } = await supabase
    .from("listings")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // matches all rows

  if (deleteErr) {
    console.error("Delete error:", deleteErr.message);
    process.exit(1);
  }

  console.log(`✅  Deleted all ${count} listing(s).`);
}

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
