/**
 * Shared environment resolution for seed scripts.
 *
 * Reads SUPABASE_URL and SERVICE_ROLE_KEY from environment variables.
 * Fails fast with a clear error if either is missing — never falls back
 * to a hardcoded production URL.
 */

export function getSeedEnv(): { supabaseUrl: string; serviceRoleKey: string } {
  const supabaseUrl =
    process.env.VITE_SUPABASE_URL ??
    process.env.VITE_SUPABASE_PROJECT_URL ??
    process.env.SUPABASE_URL;

  if (!supabaseUrl) {
    console.error(
      "Missing SUPABASE_URL. Set VITE_SUPABASE_URL, VITE_SUPABASE_PROJECT_URL, or SUPABASE_URL in .env or as an env var.",
    );
    process.exit(1);
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Set it in .env or pass as env var.",
    );
    process.exit(1);
  }

  return { supabaseUrl, serviceRoleKey };
}
