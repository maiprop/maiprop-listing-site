/**
 * Production safety guard for seed/destructive scripts (.mjs flavour).
 *
 * Mirrors `_prod-guard.ts` for use from plain Node ESM (.mjs) scripts that
 * cannot import the TS file directly. Keep the two implementations in sync.
 *
 * Any .mjs script that writes to the database via the service-role key MUST
 * call `assertNotProduction()` before doing so.
 *
 * Random hosted Supabase refs must be explicitly allowlisted through
 * SAFE_SUPABASE_PROJECT_REFS or E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS.
 *
 * Override with `I_KNOW_THIS_IS_PROD=yes` if you really do mean to seed prod.
 */

const PRODUCTION_SUPABASE_REFS = new Set([
  // Known production project ref. Update this set if the prod project changes.
  "qvvicunqcrwpioqnvzxf",
]);

const SAFE_HOST_SUBSTRINGS = ["staging", "dev", "local", "test", "127.0.0.1"];

function getExplicitlyAllowedNonProdRefs() {
  return new Set(
    [
      process.env.SAFE_SUPABASE_PROJECT_REFS,
      process.env.E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS,
    ]
      .flatMap((value) => value?.split(",") ?? [])
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

/**
 * @param {string | undefined} supabaseUrl
 * @param {string} scriptName
 */
export function assertNotProduction(supabaseUrl, scriptName) {
  const override = process.env.I_KNOW_THIS_IS_PROD === "yes";

  if (!supabaseUrl) {
    // No URL configured — nothing can be written, allow to proceed and let the
    // caller error out with a clearer message.
    return;
  }

  let host;
  let ref;
  try {
    const u = new URL(supabaseUrl);
    host = u.hostname;
    ref = host.split(".")[0] ?? "";
  } catch {
    throw new Error(`[prod-guard] Invalid SUPABASE URL: ${supabaseUrl}`);
  }

  const isKnownProd = PRODUCTION_SUPABASE_REFS.has(ref);
  const isExplicitlyAllowedNonProd = getExplicitlyAllowedNonProdRefs().has(ref);
  const looksSafe = SAFE_HOST_SUBSTRINGS.some((s) => host.includes(s));
  const nodeEnvProd = process.env.NODE_ENV === "production";

  const appearsProduction = isKnownProd || nodeEnvProd ||
    (!looksSafe && !isExplicitlyAllowedNonProd);

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
    // eslint-disable-next-line no-empty
    while (Date.now() < until) {}
    return;
  }

  console.error(`  Refusing to run. This appears to be a production database.`);
  console.error(`  To override, set I_KNOW_THIS_IS_PROD=yes in your environment.`);
  console.error(banner + "\n");
  process.exit(2);
}
