const KEY_NAMES = [
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY",
];

const FORBIDDEN_PRIVILEGED_KEY_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SB_SERVICE_ROLE_KEY",
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
  const configuredPrivilegedKeys = FORBIDDEN_PRIVILEGED_KEY_NAMES.filter(
    (name) => String(env[name] ?? "").trim().length > 0,
  );
  if (configuredPrivilegedKeys.length > 0) {
    throw new Error(
      `Privileged Supabase keys are forbidden for read-only verification: ${configuredPrivilegedKeys.join(", ")}.`,
    );
  }
  for (const name of KEY_NAMES) {
    const value = env[name]?.trim();
    if (value && isReadOnlyKey(value)) return value;
  }
  throw new Error(
    "A read-only Supabase publishable or anon key is required for public pricing metadata verification.",
  );
}
