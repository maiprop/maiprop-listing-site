export type PublicRuntimeConfig = Record<string, string>;

const LOCAL_HOSTS = new Set(["", "localhost", "127.0.0.1", "::1"]);
const REQUIRED_RUNTIME_KEYS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
] as const;

function runtimeConfig(): PublicRuntimeConfig | null {
  if (typeof window === "undefined") return null;
  const value = window.__MAIPROP_RUNTIME_CONFIG__;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const config = Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" &&
        typeof entry[1] === "string" &&
        entry[1].trim().length > 0,
    ),
  );
  return REQUIRED_RUNTIME_KEYS.every((key) => Boolean(config[key]))
    ? config
    : null;
}

export function hasRuntimeConfig(): boolean {
  return runtimeConfig() !== null;
}

export function getRuntimeConfigSnapshot(): PublicRuntimeConfig {
  const config = runtimeConfig();
  return config ?? {};
}

export function getRuntimeValue(name: string): string | undefined {
  const configured = runtimeConfig()?.[name];
  if (typeof configured === "string") return configured;

  const buildValue = (import.meta.env as Record<string, unknown>)[name];
  return typeof buildValue === "string" ? buildValue : undefined;
}

export function assertRuntimeConfigLoaded({
  productionBuild,
  hostname,
}: {
  productionBuild: boolean;
  hostname: string;
}): void {
  if (!productionBuild || LOCAL_HOSTS.has(hostname.toLowerCase())) return;
  if (hasRuntimeConfig()) return;

  throw new Error(
    "Public runtime configuration did not load from /runtime-config.js. " +
      "Refusing to start a deployed build with compile-time placeholder values.",
  );
}
