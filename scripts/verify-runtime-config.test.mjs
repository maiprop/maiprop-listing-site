import { describe, expect, it } from "vitest";
import {
  parseRuntimeConfigScript,
  validateRuntimeConfig,
} from "./verify-runtime-config.mjs";

const expected = {
  supabaseUrl: "https://xsiehskfgeoqyazcgauv.supabase.co",
  supabaseProjectId: "xsiehskfgeoqyazcgauv",
  supabasePublishableKey: "staging-publishable-key",
  appUrl: "https://maiprop-listing-site-staging.pages.dev",
};

const stagingStripeBindings = {
  VITE_STRIPE_PUBLISHABLE_KEY: {
    type: "plain_text",
    value: "pk_test_staging_public_key",
  },
  VITE_STRIPE_RUNTIME_MODE: { type: "plain_text", value: "test" },
  VITE_BILLING_MODE: { type: "plain_text", value: "test" },
  VITE_STRIPE_PRICE_PARTICIPANT_MONTHLY: {
    type: "plain_text",
    value: "price_staging_participant_monthly",
  },
};

const productionStripeBindings = {
  VITE_STRIPE_PUBLISHABLE_KEY: {
    type: "plain_text",
    value: "pk_live_production_public_key",
  },
  VITE_STRIPE_RUNTIME_MODE: { type: "plain_text", value: "live" },
  VITE_BILLING_MODE: { type: "plain_text", value: "live" },
  VITE_STRIPE_PRICE_PARTICIPANT_MONTHLY: {
    type: "plain_text",
    value: "price_production_participant_monthly",
  },
};

describe("runtime config verification", () => {
  it("parses and accepts the exact isolated staging runtime", () => {
    const source = `window.__MAIPROP_RUNTIME_CONFIG__=${JSON.stringify({
      VITE_SUPABASE_URL: expected.supabaseUrl,
      VITE_SUPABASE_PROJECT_ID: expected.supabaseProjectId,
      VITE_SUPABASE_PUBLISHABLE_KEY: expected.supabasePublishableKey,
      VITE_APP_URL: expected.appUrl,
      VITE_PUBLIC_API_ORIGIN: expected.appUrl,
    })};\n`;

    const config = parseRuntimeConfigScript(source);
    expect(validateRuntimeConfig(config, expected)).toEqual({
      supabase_url: expected.supabaseUrl,
      supabase_project_id: expected.supabaseProjectId,
      supabase_publishable_key_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      app_url: expected.appUrl,
      public_api_origin: expected.appUrl,
      stripe_runtime: {
        status: "test-or-disabled",
        publishable_key: "absent",
        runtime_mode: "absent",
        billing_mode: "absent",
        price_binding_count: 0,
        production_price_reuse: false,
        api_binding_match: false,
      },
    });
  });

  it("proves live Stripe test bindings match the API-attested staging project", () => {
    const config = {
      VITE_SUPABASE_URL: expected.supabaseUrl,
      VITE_SUPABASE_PROJECT_ID: expected.supabaseProjectId,
      VITE_SUPABASE_PUBLISHABLE_KEY: expected.supabasePublishableKey,
      VITE_APP_URL: expected.appUrl,
      VITE_PUBLIC_API_ORIGIN: expected.appUrl,
      VITE_STRIPE_PUBLISHABLE_KEY: "pk_test_staging_public_key",
      VITE_STRIPE_RUNTIME_MODE: "test",
      VITE_BILLING_MODE: "test",
      VITE_STRIPE_PRICE_PARTICIPANT_MONTHLY:
        "price_staging_participant_monthly",
    };

    const evidence = validateRuntimeConfig(config, expected, {
      stagingBindings: stagingStripeBindings,
      productionBindings: productionStripeBindings,
    });
    expect(evidence.stripe_runtime).toEqual({
      status: "test-or-disabled",
      publishable_key: "test",
      runtime_mode: "test",
      billing_mode: "test",
      price_binding_count: 1,
      production_price_reuse: false,
      api_binding_match: true,
    });
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain("pk_test_staging_public_key");
    expect(serialized).not.toContain("pk_live_production_public_key");
    expect(serialized).not.toContain("price_staging_participant_monthly");
    expect(serialized).not.toContain("price_production_participant_monthly");
  });

  it("rejects live Stripe values and production price IDs at runtime", () => {
    const base = {
      VITE_SUPABASE_URL: expected.supabaseUrl,
      VITE_SUPABASE_PROJECT_ID: expected.supabaseProjectId,
      VITE_SUPABASE_PUBLISHABLE_KEY: expected.supabasePublishableKey,
      VITE_APP_URL: expected.appUrl,
      VITE_PUBLIC_API_ORIGIN: expected.appUrl,
    };

    expect(() =>
      validateRuntimeConfig(
        {
          ...base,
          VITE_STRIPE_PUBLISHABLE_KEY: "pk_live_not_allowed",
        },
        expected,
      ),
    ).toThrow(/Stripe/i);
    expect(() =>
      validateRuntimeConfig(
        {
          ...base,
          VITE_STRIPE_PRICE_PARTICIPANT_MONTHLY:
            "price_production_participant_monthly",
        },
        expected,
        {
          stagingBindings: {
            VITE_STRIPE_PRICE_PARTICIPANT_MONTHLY: {
              type: "plain_text",
              value: "price_production_participant_monthly",
            },
          },
          productionBindings: productionStripeBindings,
        },
      ),
    ).toThrow(/production Stripe price/i);
  });

  it("rejects a live runtime that differs from the API-attested staging binding", () => {
    expect(() =>
      validateRuntimeConfig(
        {
          VITE_SUPABASE_URL: expected.supabaseUrl,
          VITE_SUPABASE_PROJECT_ID: expected.supabaseProjectId,
          VITE_SUPABASE_PUBLISHABLE_KEY: expected.supabasePublishableKey,
          VITE_APP_URL: expected.appUrl,
          VITE_PUBLIC_API_ORIGIN: expected.appUrl,
          VITE_STRIPE_PUBLISHABLE_KEY: "pk_test_different_key",
          VITE_STRIPE_RUNTIME_MODE: "test",
          VITE_BILLING_MODE: "test",
          VITE_STRIPE_PRICE_PARTICIPANT_MONTHLY:
            "price_staging_participant_monthly",
        },
        expected,
        {
          stagingBindings: stagingStripeBindings,
          productionBindings: productionStripeBindings,
        },
      ),
    ).toThrow(/API-attested Pages binding/i);
  });

  it("rejects stale production aliases even when server aliases are correct", () => {
    const config = {
      VITE_SUPABASE_URL: "https://qvvicunqcrwpioqnvzxf.supabase.co",
      VITE_SUPABASE_PROJECT_ID: "qvvicunqcrwpioqnvzxf",
      VITE_SUPABASE_PUBLISHABLE_KEY: "production-key",
      VITE_APP_URL: expected.appUrl,
      VITE_PUBLIC_API_ORIGIN: expected.appUrl,
    };

    expect(() => validateRuntimeConfig(config, expected)).toThrow(
      /VITE_SUPABASE_URL/,
    );
  });

  it("rejects malformed scripts and a mismatched stable origin", () => {
    expect(() =>
      parseRuntimeConfigScript("throw new Error('missing');"),
    ).toThrow(/runtime configuration assignment/i);
    expect(() =>
      validateRuntimeConfig(
        {
          VITE_SUPABASE_URL: expected.supabaseUrl,
          VITE_SUPABASE_PROJECT_ID: expected.supabaseProjectId,
          VITE_SUPABASE_PUBLISHABLE_KEY: expected.supabasePublishableKey,
          VITE_APP_URL: "https://portal.maiprop.co",
          VITE_PUBLIC_API_ORIGIN: "https://portal.maiprop.co",
        },
        expected,
      ),
    ).toThrow(/VITE_APP_URL/);
  });
});
