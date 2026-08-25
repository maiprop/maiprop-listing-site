import { describe, expect, it } from "vitest";

import { buildPagesRuntimePatch } from "./build-cloudflare-pages-runtime-patch.mjs";

const stagingValues = {
  SUPABASE_URL: "https://staging-ref.supabase.co",
  SUPABASE_PROJECT_ID: "staging-ref",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_staging",
  VITE_SUPABASE_URL: "https://staging-ref.supabase.co",
  VITE_SUPABASE_PROJECT_ID: "staging-ref",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_staging",
  VITE_APP_URL: "https://staging.example.pages.dev",
  VITE_PUBLIC_API_ORIGIN: "https://staging.example.pages.dev",
  VITE_APP_ENVIRONMENT: "staging",
  MAIPROP_TURN_TTL_SECONDS: "21600",
};

const productionValues = {
  SUPABASE_URL: "https://production-ref.supabase.co",
  SUPABASE_PROJECT_ID: "production-ref",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_production",
  VITE_SUPABASE_URL: "https://production-ref.supabase.co",
  VITE_SUPABASE_PROJECT_ID: "production-ref",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_production",
  VITE_APP_URL: "https://portal.maiprop.co",
  VITE_PUBLIC_API_ORIGIN: "https://portal.maiprop.co",
  VITE_APP_ENVIRONMENT: "production",
  MAIPROP_TURN_TTL_SECONDS: "21600",
  VITE_STRIPE_PUBLISHABLE_KEY: "pk_live_production",
  VITE_STRIPE_RUNTIME_MODE: "live",
  VITE_BILLING_MODE: "live",
  VITE_STRIPE_PRICE_PARTICIPANT_MONTHLY: "price_participant_monthly",
  VITE_STRIPE_PRICE_PARTICIPANT_ANNUAL: "price_participant_annual",
  VITE_STRIPE_PRICE_AGENT_MONTHLY: "price_agent_monthly",
  VITE_STRIPE_PRICE_AGENT_ANNUAL: "price_agent_annual",
  VITE_STRIPE_PRICE_DEVELOPER_MONTHLY: "price_developer_monthly",
  VITE_STRIPE_PRICE_DEVELOPER_ANNUAL: "price_developer_annual",
  VITE_STRIPE_PRICE_PROFESSIONAL_MONTHLY: "price_professional_monthly",
  VITE_STRIPE_PRICE_PROFESSIONAL_ANNUAL: "price_professional_annual",
};

function project(bindings = {}) {
  return {
    success: true,
    result: {
      deployment_configs: {
        production: {
          env_vars: bindings,
        },
      },
    },
  };
}

describe("Cloudflare Pages runtime patch builder", () => {
  it("builds an isolated staging patch and deletes unexpected plaintext bindings", () => {
    const result = buildPagesRuntimePatch({
      target: "staging",
      currentProject: project({
        VITE_SUPABASE_ANON_KEY: { type: "plain_text", value: "obsolete" },
        SITE_LOCK_PASSWORD: { type: "secret_text" },
      }),
      plainTextValues: stagingValues,
      secretValues: {
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_staging",
        CLOUDFLARE_TURN_KEY_ID: "staging-turn-key",
        CLOUDFLARE_TURN_API_TOKEN: "staging-turn-token",
      },
    });

    expect(result.patch).toEqual({
      deployment_configs: {
        production: {
          compatibility_date: "2026-05-19",
          env_vars: {
            ...Object.fromEntries(
              Object.entries(stagingValues).map(([name, value]) => [
                name,
                { type: "plain_text", value },
              ]),
            ),
            SUPABASE_SERVICE_ROLE_KEY: {
              type: "secret_text",
              value: "sb_secret_staging",
            },
            CLOUDFLARE_TURN_KEY_ID: {
              type: "secret_text",
              value: "staging-turn-key",
            },
            CLOUDFLARE_TURN_API_TOKEN: {
              type: "secret_text",
              value: "staging-turn-token",
            },
            VITE_SUPABASE_ANON_KEY: null,
          },
        },
      },
    });
    expect(result.patch.deployment_configs.production.env_vars)
      .not.toHaveProperty("SITE_LOCK_PASSWORD");
    expect(result.evidence).toEqual({
      schema_version: 1,
      evidence_type: "cloudflare-pages-runtime-patch-plan",
      target: "staging",
      compatibility_date: "2026-05-19",
      plain_text_bindings: Object.keys(stagingValues).sort(),
      secret_text_bindings: [
        "CLOUDFLARE_TURN_API_TOKEN",
        "CLOUDFLARE_TURN_KEY_ID",
        "SUPABASE_SERVICE_ROLE_KEY",
      ],
      preserved_secret_bindings: ["SITE_LOCK_PASSWORD"],
      deleted_bindings: ["VITE_SUPABASE_ANON_KEY"],
    });
    expect(JSON.stringify(result.evidence)).not.toContain("sb_secret_staging");
    expect(JSON.stringify(result.evidence)).not.toContain("staging-turn-token");
  });

  it("preserves already-provisioned required secrets when replacements are omitted", () => {
    const result = buildPagesRuntimePatch({
      target: "production",
      currentProject: project({
        CLOUDFLARE_TURN_KEY_ID: { type: "secret_text" },
        CLOUDFLARE_TURN_API_TOKEN: { type: "secret_text" },
      }),
      plainTextValues: productionValues,
      secretValues: {},
    });

    expect(result.patch.deployment_configs.production.env_vars)
      .not.toHaveProperty("CLOUDFLARE_TURN_KEY_ID");
    expect(result.patch.deployment_configs.production.env_vars)
      .not.toHaveProperty("CLOUDFLARE_TURN_API_TOKEN");
    expect(result.evidence.preserved_secret_bindings).toEqual([
      "CLOUDFLARE_TURN_API_TOKEN",
      "CLOUDFLARE_TURN_KEY_ID",
    ]);
  });

  it("fails closed for missing required secrets, wrong modes, or unexpected secret bindings", () => {
    expect(() =>
      buildPagesRuntimePatch({
        target: "staging",
        currentProject: project(),
        plainTextValues: stagingValues,
        secretValues: {},
      }),
    ).toThrow(/required staging secret binding SUPABASE_SERVICE_ROLE_KEY/i);

    expect(() =>
      buildPagesRuntimePatch({
        target: "production",
        currentProject: project(),
        plainTextValues: {
          ...productionValues,
          VITE_STRIPE_RUNTIME_MODE: "test",
        },
        secretValues: {
          CLOUDFLARE_TURN_KEY_ID: "production-turn-key",
          CLOUDFLARE_TURN_API_TOKEN: "production-turn-token",
        },
      }),
    ).toThrow(/must equal live/i);

    expect(() =>
      buildPagesRuntimePatch({
        target: "production",
        currentProject: project({
          DATABASE_URL: { type: "secret_text" },
        }),
        plainTextValues: productionValues,
        secretValues: {
          CLOUDFLARE_TURN_KEY_ID: "production-turn-key",
          CLOUDFLARE_TURN_API_TOKEN: "production-turn-token",
        },
      }),
    ).toThrow(/unexpected secret binding DATABASE_URL/i);
  });
});
