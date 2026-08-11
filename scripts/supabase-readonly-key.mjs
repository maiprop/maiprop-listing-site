const KEY_NAMES = [
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY",
];

function decodeJwtRole(value) {
  const parts = value.split(".");
  if (parts.length !== 3) return "";
  try {
    return (
      JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))?.role ??
      ""
    );
  } catch {
    return "";
  }
}

function isReadOnlyKey(value) {
  if (value.startsWith("sb_publishable_")) return true;
  if (value.startsWith("sb_secret_")) return false;
  return decodeJwtRole(value) === "anon";
}

export function getSupabaseReadOnlyKey(env = process.env) {
  for (const name of KEY_NAMES) {
    const value = env[name]?.trim();
    if (value && isReadOnlyKey(value)) return value;
  }
  throw new Error(
    "A read-only Supabase publishable or anon key is required for public pricing metadata verification.",
  );
}
