/**
 * Production safety guard for seed scripts.
 *
 * Any script that writes to the database via the service-role key MUST call
 * `assertNotProduction()` before doing so. This prevents accidental runs like:
 *
 *   $ SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-mock-users.ts
 *
 * from nuking 20,000 real users in production.
 *
 * The guard is intentionally conservative: any of the following will block:
 *   - SUPABASE_URL matches the known production project ref
 *   - NODE_ENV === "production"
 *   - The URL host does NOT contain "staging", "dev", "local", or "test"
 *     and the project ref is not explicitly allowlisted for non-production use
 *
 * To override (e.g., you really do want to seed prod), set
 * `I_KNOW_THIS_IS_PROD=yes` in the environment. This is logged loudly.
 */

const PRODUCTION_SUPABASE_REFS = new Set<string>([
  // Known production project ref. Update this set if the prod project changes.
  "qvvicunqcrwpioqnvzxf",
]);

const SAFE_HOST_SUBSTRINGS = ["staging", "dev", "local", "test", "127.0.0.1"];

function getExplicitlyAllowedNonProdRefs(): Set<string> {
  const values = [
    process.env.SAFE_SUPABASE_PROJECT_REFS,
    process.env.E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS,
  ];

  return new Set(
    values
      .flatMap((value) => value?.split(",") ?? [])
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function assertNotProduction(
  supabaseUrl: string | undefined,
  scriptName: string,
): void {
  const override = process.env.I_KNOW_THIS_IS_PROD === "yes";

  if (!supabaseUrl) {
    // No URL configured — nothing can be written, allow to proceed and let the
    // caller error out with a clearer message.
    return;
  }

  let host: string;
  let ref: string;
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
    // Busy wait so the override is deliberately painful.
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
