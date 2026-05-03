/**
 * Production safety guard for plain-JS seed/admin scripts (.mjs).
 *
 * Mirrors the TypeScript guard in scripts/_prod-guard.ts. Any script that
 * writes to the database via the service-role key MUST call
 * `assertNotProduction()` before doing so. This prevents accidental runs
 * like `SUPABASE_SERVICE_ROLE_KEY=... node scripts/wipe-all-listings.mjs`
 * from destroying production data.
 *
 * Override: set `I_KNOW_THIS_IS_PROD=yes` in the environment. This is logged
 * loudly and pauses for 5 s to give the operator time to abort.
 */

const PRODUCTION_SUPABASE_REFS = new Set([
  // Known production project ref. Keep in sync with scripts/_prod-guard.ts.
  "qvvicunqcrwpioqnvzxf",
]);

const SAFE_HOST_SUBSTRINGS = ["staging", "dev", "local", "test", "127.0.0.1"];

export function assertNotProduction(supabaseUrl, scriptName) {
  const override = process.env.I_KNOW_THIS_IS_PROD === "yes";

  if (!supabaseUrl) return;

  let host, ref;
  try {
    const u = new URL(supabaseUrl);
    host = u.hostname;
    ref = host.split(".")[0] ?? "";
  } catch {
    throw new Error(`[prod-guard] Invalid SUPABASE URL: ${supabaseUrl}`);
  }

  const isKnownProd = PRODUCTION_SUPABASE_REFS.has(ref);
  const looksSafe = SAFE_HOST_SUBSTRINGS.some((s) => host.includes(s));
  const nodeEnvProd = process.env.NODE_ENV === "production";

  const appearsProduction = isKnownProd || nodeEnvProd || !looksSafe;
  if (!appearsProduction) return;

  const banner = "═".repeat(76);
  console.error(`\n${banner}`);
  console.error(`  ⚠  PRODUCTION SAFETY GUARD TRIGGERED`);
  console.error(banner);
  console.error(`  script:       ${scriptName}`);
  console.error(`  supabase:     ${host}`);
  console.error(`  ref:          ${ref}`);
  console.error(`  known prod:   ${isKnownProd}`);
  console.error(`  NODE_ENV:     ${process.env.NODE_ENV ?? "(unset)"}`);
  console.error(banner);

  if (override) {
    console.error(`  OVERRIDE: I_KNOW_THIS_IS_PROD=yes — proceeding in 5s...`);
    console.error(`  Press Ctrl-C NOW if this is not intended.`);
    console.error(banner + "\n");
    const until = Date.now() + 5000;
    while (Date.now() < until) { /* busy-wait so override is deliberately painful */ }
    return;
  }

  console.error(`  Refusing to run. This appears to be a production database.`);
  console.error(`  To override, set I_KNOW_THIS_IS_PROD=yes in your environment.`);
  console.error(banner + "\n");
  process.exit(2);
}
