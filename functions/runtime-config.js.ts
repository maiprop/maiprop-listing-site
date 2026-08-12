type RuntimeConfigEnv = {
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_PROJECT_ID?: string;
  VITE_SUPABASE_PROJECT_ID?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_APP_URL?: string;
  VITE_APP_ENVIRONMENT?: string;
  VITE_PUBLIC_API_ORIGIN?: string;
  VITE_MAPBOX_TOKEN?: string;
  VITE_SENTRY_DSN?: string;
  VITE_STRIPE_PUBLISHABLE_KEY?: string;
  VITE_STRIPE_RUNTIME_MODE?: string;
  VITE_BILLING_MODE?: string;
  VITE_GOOGLE_MAPS_API_KEY?: string;
  VITE_ENABLE_GOOGLE_PLACES_AUTOCOMPLETE?: string;
  VITE_PLAUSIBLE_DOMAIN?: string;
  VITE_VIEW_TRACKING_SAMPLE_RATE?: string;
  VITE_WEB_VITALS_SAMPLE_RATE?: string;
  VITE_STRIPE_PRICE_PARTICIPANT_MONTHLY?: string;
  VITE_STRIPE_PRICE_PARTICIPANT_ANNUAL?: string;
  VITE_STRIPE_PRICE_AGENT_MONTHLY?: string;
  VITE_STRIPE_PRICE_AGENT_ANNUAL?: string;
  VITE_STRIPE_PRICE_DEVELOPER_MONTHLY?: string;
  VITE_STRIPE_PRICE_DEVELOPER_ANNUAL?: string;
  VITE_STRIPE_PRICE_PROFESSIONAL_MONTHLY?: string;
  VITE_STRIPE_PRICE_PROFESSIONAL_ANNUAL?: string;
};

export const PUBLIC_RUNTIME_CONFIG_KEYS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_APP_URL",
  "VITE_APP_ENVIRONMENT",
  "VITE_PUBLIC_API_ORIGIN",
  "VITE_MAPBOX_TOKEN",
  "VITE_SENTRY_DSN",
  "VITE_STRIPE_PUBLISHABLE_KEY",
  "VITE_STRIPE_RUNTIME_MODE",
  "VITE_BILLING_MODE",
  "VITE_GOOGLE_MAPS_API_KEY",
  "VITE_ENABLE_GOOGLE_PLACES_AUTOCOMPLETE",
  "VITE_PLAUSIBLE_DOMAIN",
  "VITE_VIEW_TRACKING_SAMPLE_RATE",
  "VITE_WEB_VITALS_SAMPLE_RATE",
  "VITE_STRIPE_PRICE_PARTICIPANT_MONTHLY",
  "VITE_STRIPE_PRICE_PARTICIPANT_ANNUAL",
  "VITE_STRIPE_PRICE_AGENT_MONTHLY",
  "VITE_STRIPE_PRICE_AGENT_ANNUAL",
  "VITE_STRIPE_PRICE_DEVELOPER_MONTHLY",
  "VITE_STRIPE_PRICE_DEVELOPER_ANNUAL",
  "VITE_STRIPE_PRICE_PROFESSIONAL_MONTHLY",
  "VITE_STRIPE_PRICE_PROFESSIONAL_ANNUAL",
] as const;

type PublicRuntimeKey = typeof PUBLIC_RUNTIME_CONFIG_KEYS[number];

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function buildRuntimeConfig(
  env: RuntimeConfigEnv,
): Partial<Record<PublicRuntimeKey, string>> {
  const aliases: Partial<Record<PublicRuntimeKey, string | undefined>> = {
    VITE_SUPABASE_URL:
      nonEmpty(env.VITE_SUPABASE_URL) ?? nonEmpty(env.SUPABASE_URL),
    VITE_SUPABASE_PROJECT_ID:
      nonEmpty(env.VITE_SUPABASE_PROJECT_ID) ??
      nonEmpty(env.SUPABASE_PROJECT_ID),
    VITE_SUPABASE_PUBLISHABLE_KEY:
      nonEmpty(env.VITE_SUPABASE_PUBLISHABLE_KEY) ??
      nonEmpty(env.VITE_SUPABASE_ANON_KEY) ??
      nonEmpty(env.SUPABASE_PUBLISHABLE_KEY),
  };

  const config: Partial<Record<PublicRuntimeKey, string>> = {};
  for (const key of PUBLIC_RUNTIME_CONFIG_KEYS) {
    const value = aliases[key] ?? nonEmpty(env[key]);
    if (value !== undefined) config[key] = value;
  }
  return config;
}

export const onRequestGet: PagesFunction<RuntimeConfigEnv> = async (context) => {
  const config = buildRuntimeConfig(context.env);
  const required = [
    config.VITE_SUPABASE_URL,
    config.VITE_SUPABASE_PUBLISHABLE_KEY,
  ];
  const ready = required.every(Boolean);
  const body = ready
    ? `window.__MAIPROP_RUNTIME_CONFIG__=${JSON.stringify(config)};\n`
    : 'throw new Error("Maiprop public runtime configuration is incomplete.");\n';

  return new Response(body, {
    status: ready ? 200 : 503,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
};
