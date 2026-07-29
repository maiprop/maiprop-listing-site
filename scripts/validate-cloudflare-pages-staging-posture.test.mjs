import { describe, expect, it } from "vitest";

import {
  buildCloudflarePagesGitAutoDeployPostStateEvidence,
  buildCloudflarePagesStagingPostureEvidence,
} from "./validate-cloudflare-pages-staging-posture.mjs";

const stagingValues = {
  SUPABASE_URL: "https://staging-ref.supabase.co",
  SUPABASE_PROJECT_ID: "staging-ref",
  SUPABASE_PUBLISHABLE_KEY: "staging-publishable",
  VITE_SUPABASE_URL: "https://staging-ref.supabase.co",
  VITE_SUPABASE_PROJECT_ID: "staging-ref",
  VITE_SUPABASE_PUBLISHABLE_KEY: "staging-publishable",
  VITE_APP_URL: "https://staging.portal.example",
  VITE_PUBLIC_API_ORIGIN: "https://staging.portal.example",
  VITE_APP_ENVIRONMENT: "staging",
  MAIPROP_TURN_TTL_SECONDS: "21600",
};

const productionValues = {
  SUPABASE_URL: "https://production-ref.supabase.co",
  SUPABASE_PROJECT_ID: "production-ref",
  SUPABASE_PUBLISHABLE_KEY: "production-publishable",
  VITE_SUPABASE_URL: "https://production-ref.supabase.co",
  VITE_SUPABASE_PROJECT_ID: "production-ref",
  VITE_SUPABASE_PUBLISHABLE_KEY: "production-publishable",
  VITE_APP_URL: "https://portal.maiprop.co",
  VITE_PUBLIC_API_ORIGIN: "https://portal.maiprop.co",
};

const stagingStripeValues = {
  VITE_STRIPE_PUBLISHABLE_KEY: "pk_test_staging_public_key",
  VITE_STRIPE_RUNTIME_MODE: "test",
  VITE_BILLING_MODE: "test",
  VITE_STRIPE_PRICE_PARTICIPANT_MONTHLY: "price_staging_participant_monthly",
  VITE_STRIPE_PRICE_PARTICIPANT_ANNUAL: "price_staging_participant_annual",
  VITE_STRIPE_PRICE_AGENT_MONTHLY: "price_staging_agent_monthly",
};

const productionStripeValues = {
  VITE_STRIPE_PUBLISHABLE_KEY: "pk_live_production_public_key",
  VITE_STRIPE_RUNTIME_MODE: "live",
  VITE_BILLING_MODE: "live",
  VITE_STRIPE_PRICE_PARTICIPANT_MONTHLY:
    "price_production_participant_monthly",
  VITE_STRIPE_PRICE_PARTICIPANT_ANNUAL:
    "price_production_participant_annual",
  VITE_STRIPE_PRICE_AGENT_MONTHLY: "price_production_agent_monthly",
};

function envVars(values) {
  return {
    ...Object.fromEntries(
      Object.entries(values).map(([name, value]) => [
        name,
        { type: "plain_text", value },
      ]),
    ),
    SUPABASE_SERVICE_ROLE_KEY: { type: "secret_text" },
    CLOUDFLARE_TURN_KEY_ID: { type: "secret_text" },
    CLOUDFLARE_TURN_API_TOKEN: { type: "secret_text" },
  };
}

function projectEnvelope({
  name,
  source = null,
  values,
}) {
  return {
    success: true,
    result: {
      id: `${name}-id`,
      name,
      source,
      production_branch: "main",
      deployment_configs: {
        production: {
          compatibility_date: "2026-05-19",
          env_vars: envVars(values),
        },
      },
    },
  };
}

const options = {
  stagingProjectName: "maiprop-listing-site-staging",
  productionProjectName: "maiprop-listing-site",
  stagingAppUrl: stagingValues.VITE_APP_URL,
  stagingSupabaseProjectId: stagingValues.SUPABASE_PROJECT_ID,
  stagingSupabaseUrl: stagingValues.SUPABASE_URL,
  stagingSupabasePublishableKey: stagingValues.SUPABASE_PUBLISHABLE_KEY,
};

describe("Cloudflare staging Pages posture validation", () => {
  it("accepts direct-upload projects and emits only redacted posture", () => {
    const evidence = buildCloudflarePagesStagingPostureEvidence({
      ...options,
      stagingApi: projectEnvelope({
        name: options.stagingProjectName,
        values: stagingValues,
      }),
      productionApi: projectEnvelope({
        name: options.productionProjectName,
        values: productionValues,
      }),
    });

    expect(evidence).toEqual({
      schema_version: 2,
      evidence_type: "maiprop-pages-git-auto-deploy-posture",
      status: "passed",
      compatibility_date: "2026-05-19",
      staging_bindings: "isolated",
      stripe_runtime: {
        status: "test-or-disabled",
        publishable_key: "absent",
        runtime_mode: "absent",
        billing_mode: "absent",
        price_binding_count: 0,
        production_price_reuse: false,
      },
      projects: [
        {
          role: "staging",
          project_name: options.stagingProjectName,
          source_connected: false,
          production_deployments_enabled: false,
          preview_deployment_setting: "none",
          all_automatic_deployments_disabled: true,
          status: "disabled",
        },
        {
          role: "production",
          project_name: options.productionProjectName,
          source_connected: false,
          production_deployments_enabled: false,
          preview_deployment_setting: "none",
          all_automatic_deployments_disabled: true,
          status: "disabled",
        },
      ],
    });
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain("staging-publishable");
    expect(serialized).not.toContain("production-publishable");
    expect(serialized).not.toContain("supabase.co");
    expect(serialized).not.toContain("portal.maiprop.co");
  });

  it("accepts only redacted Stripe test-mode staging bindings", () => {
    const evidence = buildCloudflarePagesStagingPostureEvidence({
      ...options,
      stagingApi: projectEnvelope({
        name: options.stagingProjectName,
        values: {
          ...stagingValues,
          ...stagingStripeValues,
        },
      }),
      productionApi: projectEnvelope({
        name: options.productionProjectName,
        values: {
          ...productionValues,
          ...productionStripeValues,
        },
      }),
    });

    expect(evidence.stripe_runtime).toEqual({
      status: "test-or-disabled",
      publishable_key: "test",
      runtime_mode: "test",
      billing_mode: "test",
      price_binding_count: 3,
      production_price_reuse: false,
    });
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain("pk_test_");
    expect(serialized).not.toContain("pk_live_");
    expect(serialized).not.toContain("price_staging_");
    expect(serialized).not.toContain("price_production_");
  });

  it("accepts a Git source only when production and preview deploys are disabled", () => {
    const privateSource = {
      type: "github",
      config: {
        owner: "private-owner",
        repo_name: "private-repository",
        production_deployments_enabled: false,
        preview_deployment_setting: "none",
      },
    };
    const evidence = buildCloudflarePagesStagingPostureEvidence({
      ...options,
      stagingApi: projectEnvelope({
        name: options.stagingProjectName,
        source: privateSource,
        values: stagingValues,
      }),
      productionApi: projectEnvelope({
        name: options.productionProjectName,
        source: privateSource,
        values: productionValues,
      }),
    });

    expect(evidence.projects.every((entry) => entry.source_connected)).toBe(true);
    expect(JSON.stringify(evidence)).not.toContain("private-owner");
    expect(JSON.stringify(evidence)).not.toContain("private-repository");
  });

  it("rejects either project when Git automatic deploys are enabled", () => {
    expect(() =>
      buildCloudflarePagesStagingPostureEvidence({
        ...options,
        stagingApi: projectEnvelope({
          name: options.stagingProjectName,
          values: stagingValues,
        }),
        productionApi: projectEnvelope({
          name: options.productionProjectName,
          source: {
            type: "github",
            config: {
              production_deployments_enabled: true,
              preview_deployment_setting: "none",
            },
          },
          values: productionValues,
        }),
      }),
    ).toThrow(
      "Both staging and production Pages projects must have Git automatic deployments disabled.",
    );
  });

  it("captures redacted two-project post-state before strict lock validation", () => {
    const privateSource = {
      type: "github",
      config: {
        owner: "private-owner",
        repo_name: "private-repository",
        production_deployments_enabled: false,
        preview_deployment_setting: "all",
      },
    };
    const evidence = buildCloudflarePagesGitAutoDeployPostStateEvidence({
      stagingApi: projectEnvelope({
        name: options.stagingProjectName,
        values: stagingValues,
      }),
      productionApi: projectEnvelope({
        name: options.productionProjectName,
        source: privateSource,
        values: productionValues,
      }),
      stagingProjectName: options.stagingProjectName,
      productionProjectName: options.productionProjectName,
    });

    expect(evidence).toMatchObject({
      schema_version: 1,
      evidence_type: "maiprop-pages-git-auto-deploy-post-state",
      status: "not-locked",
      projects: [
        {
          role: "staging",
          all_automatic_deployments_disabled: true,
        },
        {
          role: "production",
          production_deployments_enabled: false,
          preview_deployment_setting: "all",
          all_automatic_deployments_disabled: false,
        },
      ],
    });
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain("private-owner");
    expect(serialized).not.toContain("private-repository");
    expect(serialized).not.toContain("production-publishable");
  });

  it("rejects production-valued bindings on the staging project", () => {
    expect(() =>
      buildCloudflarePagesStagingPostureEvidence({
        ...options,
        stagingApi: projectEnvelope({
          name: options.stagingProjectName,
          values: {
            ...stagingValues,
            VITE_PUBLIC_API_ORIGIN: productionValues.VITE_PUBLIC_API_ORIGIN,
          },
        }),
        productionApi: projectEnvelope({
          name: options.productionProjectName,
          values: productionValues,
        }),
      }),
    ).toThrow(
      "Staging Pages bindings must not contain production-valued catalogue or origin variables.",
    );
  });

  it("rejects Stripe live mode or a live publishable key on staging", () => {
    for (const unsafeValues of [
      { VITE_STRIPE_PUBLISHABLE_KEY: "pk_live_not_allowed" },
      { VITE_STRIPE_RUNTIME_MODE: "live" },
      { VITE_BILLING_MODE: "live" },
    ]) {
      expect(() =>
        buildCloudflarePagesStagingPostureEvidence({
          ...options,
          stagingApi: projectEnvelope({
            name: options.stagingProjectName,
            values: {
              ...stagingValues,
              ...unsafeValues,
            },
          }),
          productionApi: projectEnvelope({
            name: options.productionProjectName,
            values: {
              ...productionValues,
              ...productionStripeValues,
            },
          }),
        }),
      ).toThrow(/Stripe/i);
    }
  });

  it("rejects a test key reused from the production Pages project", () => {
    expect(() =>
      buildCloudflarePagesStagingPostureEvidence({
        ...options,
        stagingApi: projectEnvelope({
          name: options.stagingProjectName,
          values: {
            ...stagingValues,
            VITE_STRIPE_PUBLISHABLE_KEY: "pk_test_shared_key",
          },
        }),
        productionApi: projectEnvelope({
          name: options.productionProjectName,
          values: {
            ...productionValues,
            VITE_STRIPE_PUBLISHABLE_KEY: "pk_test_shared_key",
          },
        }),
      }),
    ).toThrow(/must not reuse the production Pages value/i);
  });

  it("rejects any staging price ID reused from the production project", () => {
    expect(() =>
      buildCloudflarePagesStagingPostureEvidence({
        ...options,
        stagingApi: projectEnvelope({
          name: options.stagingProjectName,
          values: {
            ...stagingValues,
            VITE_STRIPE_PUBLISHABLE_KEY: "pk_test_staging_public_key",
            VITE_STRIPE_PRICE_AGENT_MONTHLY:
              productionStripeValues.VITE_STRIPE_PRICE_PARTICIPANT_MONTHLY,
          },
        }),
        productionApi: projectEnvelope({
          name: options.productionProjectName,
          values: {
            ...productionValues,
            ...productionStripeValues,
          },
        }),
      }),
    ).toThrow(/production Stripe price/i);
  });
});
