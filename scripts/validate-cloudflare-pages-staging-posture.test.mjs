import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildCloudflarePagesGitAutoDeployPostStateEvidence,
  buildCloudflarePagesProductionPostureEvidence,
  buildCloudflarePagesProductionRuntimeSnapshotEvidence,
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
  VITE_STRIPE_PRICE_AGENT_ANNUAL: "price_production_agent_annual",
  VITE_STRIPE_PRICE_DEVELOPER_MONTHLY: "price_production_developer_monthly",
  VITE_STRIPE_PRICE_DEVELOPER_ANNUAL: "price_production_developer_annual",
  VITE_STRIPE_PRICE_PROFESSIONAL_MONTHLY:
    "price_production_professional_monthly",
  VITE_STRIPE_PRICE_PROFESSIONAL_ANNUAL:
    "price_production_professional_annual",
};

function envVars(values, { includeServiceRole = true } = {}) {
  return {
    ...Object.fromEntries(
      Object.entries(values).map(([name, value]) => [
        name,
        { type: "plain_text", value },
      ]),
    ),
    ...(includeServiceRole
      ? {
          SUPABASE_SERVICE_ROLE_KEY: {
            type: "secret_text",
            value: "test-service-role-secret",
          },
        }
      : {}),
    CLOUDFLARE_TURN_KEY_ID: {
      type: "secret_text",
      value: "test-turn-key-id",
    },
    CLOUDFLARE_TURN_API_TOKEN: {
      type: "secret_text",
      value: "test-turn-api-token",
    },
  };
}

function projectEnvelope({
  name,
  source = null,
  values,
  includeServiceRole = true,
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
          env_vars: envVars(values, { includeServiceRole }),
        },
      },
    },
  };
}

const options = {
  stagingProjectName: "maiprop-listing-site-staging",
  productionProjectName: "maiprop-listing-site",
  stagingProjectId: "maiprop-listing-site-staging-id",
  productionProjectId: "maiprop-listing-site-id",
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
      staging_bindings: "allowlisted-isolated-schema-and-plaintext-values",
      secret_bindings: "allowlisted-name-and-type",
      authenticated_live_functional_proof_required: true,
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
          project_id: options.stagingProjectId,
          project_name: options.stagingProjectName,
          source_connected: false,
          production_deployments_enabled: false,
          preview_deployment_setting: "none",
          all_automatic_deployments_disabled: true,
          status: "disabled",
        },
        {
          role: "production",
          project_id: options.productionProjectId,
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

  it("accepts Cloudflare's optional source omission for Direct Upload", () => {
    const stagingApi = projectEnvelope({
      name: options.stagingProjectName,
      values: stagingValues,
    });
    delete stagingApi.result.source;

    const evidence = buildCloudflarePagesStagingPostureEvidence({
      ...options,
      stagingApi,
      productionApi: projectEnvelope({
        name: options.productionProjectName,
        values: productionValues,
      }),
    });

    expect(evidence.projects[0]).toMatchObject({
      role: "staging",
      source_connected: false,
      all_automatic_deployments_disabled: true,
      status: "disabled",
    });
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
      stagingProjectId: options.stagingProjectId,
      productionProjectId: options.productionProjectId,
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

  it("rejects staging bindings outside the explicit required and optional schema", () => {
    const stagingApi = projectEnvelope({
      name: options.stagingProjectName,
      values: stagingValues,
    });
    stagingApi.result.deployment_configs.production.env_vars.STRIPE_SECRET_KEY = {
      type: "secret_text",
      value: "must-not-be-bound",
    };

    expect(() =>
      buildCloudflarePagesStagingPostureEvidence({
        ...options,
        stagingApi,
        productionApi: projectEnvelope({
          name: options.productionProjectName,
          values: productionValues,
        }),
      })
    ).toThrow(/unexpected staging Pages binding STRIPE_SECRET_KEY/i);
  });

  it("allows SITE_LOCK_PASSWORD only as an optional redacted secret binding", () => {
    const stagingApi = projectEnvelope({
      name: options.stagingProjectName,
      values: stagingValues,
    });
    stagingApi.result.deployment_configs.production.env_vars.SITE_LOCK_PASSWORD = {
      type: "secret_text",
      value: "unreadable-secret-placeholder",
    };

    const evidence = buildCloudflarePagesStagingPostureEvidence({
      ...options,
      stagingApi,
      productionApi: projectEnvelope({
        name: options.productionProjectName,
        values: productionValues,
      }),
    });
    expect(evidence.status).toBe("passed");
    expect(JSON.stringify(evidence)).not.toContain(
      "unreadable-secret-placeholder",
    );

    stagingApi.result.deployment_configs.production.env_vars.SITE_LOCK_PASSWORD = {
      type: "plain_text",
      value: "unsafe-plaintext",
    };
    expect(() =>
      buildCloudflarePagesStagingPostureEvidence({
        ...options,
        stagingApi,
        productionApi: projectEnvelope({
          name: options.productionProjectName,
          values: productionValues,
        }),
      })
    ).toThrow(/SITE_LOCK_PASSWORD must be secret_text/i);
  });

  it("rejects malformed staging binding objects", () => {
    const stagingApi = projectEnvelope({
      name: options.stagingProjectName,
      values: stagingValues,
    });
    stagingApi.result.deployment_configs.production.env_vars.SUPABASE_URL = {
      type: "plain_text",
      value: 42,
    };

    expect(() =>
      buildCloudflarePagesStagingPostureEvidence({
        ...options,
        stagingApi,
        productionApi: projectEnvelope({
          name: options.productionProjectName,
          values: productionValues,
        }),
      })
    ).toThrow(/staging Pages binding SUPABASE_URL.*string value/i);

    const nullOptionalApi = projectEnvelope({
      name: options.stagingProjectName,
      values: stagingValues,
    });
    nullOptionalApi.result.deployment_configs.production.env_vars
      .VITE_STRIPE_RUNTIME_MODE = null;
    expect(() =>
      buildCloudflarePagesStagingPostureEvidence({
        ...options,
        stagingApi: nullOptionalApi,
        productionApi: projectEnvelope({
          name: options.productionProjectName,
          values: productionValues,
        }),
      })
    ).toThrow(/staging Pages binding VITE_STRIPE_RUNTIME_MODE.*malformed/i);
  });
});

describe("Cloudflare production Pages posture validation", () => {
  const productionRuntimeValues = {
    ...productionValues,
    ...productionStripeValues,
    VITE_APP_ENVIRONMENT: "production",
    MAIPROP_TURN_TTL_SECONDS: "21600",
  };
  const productionOptions = {
    stagingProjectName: options.stagingProjectName,
    productionProjectName: options.productionProjectName,
    stagingProjectId: options.stagingProjectId,
    productionProjectId: options.productionProjectId,
    productionAppUrl: productionValues.VITE_APP_URL,
    productionSupabaseProjectId: productionValues.SUPABASE_PROJECT_ID,
    productionSupabaseUrl: productionValues.SUPABASE_URL,
    productionSupabasePublishableKey:
      productionValues.SUPABASE_PUBLISHABLE_KEY,
    expectedProductionStripeBindings: productionStripeValues,
  };

  it("captures a read-only pre-provisioned runtime schema without treating secret placeholders as values", () => {
    const productionApi = projectEnvelope({
      name: options.productionProjectName,
      values: productionRuntimeValues,
      includeServiceRole: false,
    });
    const before = buildCloudflarePagesProductionRuntimeSnapshotEvidence({
      productionApi,
      productionProjectName: options.productionProjectName,
      productionProjectId: options.productionProjectId,
    });
    expect(before).toMatchObject({
      schema_version: 2,
      evidence_type: "maiprop-pages-production-runtime-snapshot",
      status: "captured",
      project_id: options.productionProjectId,
      project_name: options.productionProjectName,
      production_branch: "main",
      compatibility_date: "2026-05-19",
      values_redacted: true,
      secret_values_recoverable: false,
      runtime_strategy: "preprovisioned-verified-runtime",
      secret_verification: "binding-name-and-type-only",
    });
    expect(before.metadata_sha256).toMatch(/^[0-9a-f]{64}$/);

    const changedSecrets = structuredClone(productionApi);
    changedSecrets.result.deployment_configs.production.env_vars
      .CLOUDFLARE_TURN_KEY_ID.value = "unreadable-cloudflare-placeholder";
    changedSecrets.result.deployment_configs.production.env_vars
      .CLOUDFLARE_TURN_API_TOKEN.value = "another-placeholder";
    const changedSecretSnapshot =
      buildCloudflarePagesProductionRuntimeSnapshotEvidence({
        productionApi: changedSecrets,
        productionProjectName: options.productionProjectName,
        productionProjectId: options.productionProjectId,
      });
    expect(changedSecretSnapshot.metadata_sha256).toBe(before.metadata_sha256);

    const changedBranch = structuredClone(productionApi);
    changedBranch.result.production_branch = "release-candidate";
    const changedBranchSnapshot =
      buildCloudflarePagesProductionRuntimeSnapshotEvidence({
        productionApi: changedBranch,
        productionProjectName: options.productionProjectName,
        productionProjectId: options.productionProjectId,
      });
    expect(changedBranchSnapshot.production_branch).toBe("release-candidate");
    expect(changedBranchSnapshot.metadata_sha256).not.toBe(
      before.metadata_sha256,
    );

    const serialized = JSON.stringify({ before, changedSecretSnapshot });
    expect(serialized).not.toContain("pk_live_");
    expect(serialized).not.toContain("price_production_");
    expect(serialized).not.toContain("production-publishable");
    expect(serialized).not.toContain("test-turn-");
    expect(serialized).not.toContain("unreadable-cloudflare-placeholder");
    expect(serialized).not.toContain("another-placeholder");
  });

  it("requires exact production bindings and emits no runtime values", () => {
    const evidence = buildCloudflarePagesProductionPostureEvidence({
      ...productionOptions,
      stagingApi: projectEnvelope({
        name: options.stagingProjectName,
        values: stagingValues,
      }),
      productionApi: projectEnvelope({
        name: options.productionProjectName,
        values: productionRuntimeValues,
        includeServiceRole: false,
      }),
    });

    expect(evidence).toEqual({
      schema_version: 1,
      evidence_type: "maiprop-pages-production-posture",
      status: "passed",
      compatibility_date: "2026-05-19",
      production_bindings: "allowlisted-schema-and-plaintext-values",
      secret_bindings: "allowlisted-name-and-type",
      authenticated_live_functional_proof_required: true,
      stripe_runtime: {
        status: "live",
        publishable_key: "live",
        runtime_mode: "live",
        billing_mode: "live",
        price_binding_count: 8,
      },
      projects: [
        expect.objectContaining({
          role: "staging",
          project_id: options.stagingProjectId,
          project_name: options.stagingProjectName,
          all_automatic_deployments_disabled: true,
        }),
        expect.objectContaining({
          role: "production",
          project_id: options.productionProjectId,
          project_name: options.productionProjectName,
          all_automatic_deployments_disabled: true,
        }),
      ],
    });
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain("production-publishable");
    expect(serialized).not.toContain("pk_live_");
    expect(serialized).not.toContain("price_production_");
    expect(serialized).not.toContain("supabase.co");
    expect(serialized).not.toContain("portal.maiprop.co");
  });

  it("allows a pre-provisioned production site lock without exposing its value", () => {
    const productionApi = projectEnvelope({
      name: options.productionProjectName,
      values: productionRuntimeValues,
      includeServiceRole: false,
    });
    productionApi.result.deployment_configs.production.env_vars
      .SITE_LOCK_PASSWORD = {
        type: "secret_text",
        value: "unreadable-production-placeholder",
      };

    const evidence = buildCloudflarePagesProductionPostureEvidence({
      ...productionOptions,
      stagingApi: projectEnvelope({
        name: options.stagingProjectName,
        values: stagingValues,
      }),
      productionApi,
    });
    expect(evidence.status).toBe("passed");
    expect(JSON.stringify(evidence)).not.toContain(
      "unreadable-production-placeholder",
    );

    productionApi.result.deployment_configs.production.env_vars
      .SITE_LOCK_PASSWORD = {
        type: "plain_text",
        value: "unsafe-production-plaintext",
      };
    expect(() =>
      buildCloudflarePagesProductionPostureEvidence({
        ...productionOptions,
        stagingApi: projectEnvelope({
          name: options.stagingProjectName,
          values: stagingValues,
        }),
        productionApi,
      })
    ).toThrow(/SITE_LOCK_PASSWORD must be secret_text/i);
  });

  it("rejects privileged Supabase secrets and non-live production Stripe bindings", () => {
    expect(() =>
      buildCloudflarePagesProductionPostureEvidence({
        ...productionOptions,
        stagingApi: projectEnvelope({
          name: options.stagingProjectName,
          values: stagingValues,
        }),
        productionApi: projectEnvelope({
          name: options.productionProjectName,
          values: productionRuntimeValues,
        }),
      }),
    ).toThrow(/service role/i);

    expect(() =>
      buildCloudflarePagesProductionPostureEvidence({
        ...productionOptions,
        stagingApi: projectEnvelope({
          name: options.stagingProjectName,
          values: stagingValues,
        }),
        productionApi: projectEnvelope({
          name: options.productionProjectName,
          values: {
            ...productionRuntimeValues,
            VITE_STRIPE_PUBLISHABLE_KEY: "pk_test_not_production",
          },
          includeServiceRole: false,
        }),
      }),
    ).toThrow(/production Stripe/i);
  });

  it("requires exact unique protected production Stripe identities", () => {
    expect(() =>
      buildCloudflarePagesProductionPostureEvidence({
        ...productionOptions,
        stagingApi: projectEnvelope({
          name: options.stagingProjectName,
          values: stagingValues,
        }),
        productionApi: projectEnvelope({
          name: options.productionProjectName,
          values: {
            ...productionRuntimeValues,
            VITE_STRIPE_PUBLISHABLE_KEY: "pk_live_wrong_account",
          },
          includeServiceRole: false,
        }),
      }),
    ).toThrow(/exact protected production Stripe/i);

    expect(() =>
      buildCloudflarePagesProductionPostureEvidence({
        ...productionOptions,
        expectedProductionStripeBindings: {
          ...productionStripeValues,
          VITE_STRIPE_PRICE_AGENT_ANNUAL:
            productionStripeValues.VITE_STRIPE_PRICE_AGENT_MONTHLY,
        },
        stagingApi: projectEnvelope({
          name: options.stagingProjectName,
          values: stagingValues,
        }),
        productionApi: projectEnvelope({
          name: options.productionProjectName,
          values: productionRuntimeValues,
          includeServiceRole: false,
        }),
      }),
    ).toThrow(/unique/i);
  });

  it("rejects stale core production bindings or enabled Git deployments", () => {
    expect(() =>
      buildCloudflarePagesProductionPostureEvidence({
        ...productionOptions,
        stagingApi: projectEnvelope({
          name: options.stagingProjectName,
          values: stagingValues,
        }),
        productionApi: projectEnvelope({
          name: options.productionProjectName,
          values: {
            ...productionRuntimeValues,
            VITE_PUBLIC_API_ORIGIN: "https://stale.example",
          },
          includeServiceRole: false,
        }),
      }),
    ).toThrow(/production Pages bindings/i);

    expect(() =>
      buildCloudflarePagesProductionPostureEvidence({
        ...productionOptions,
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
          values: productionRuntimeValues,
          includeServiceRole: false,
        }),
      }),
    ).toThrow(/automatic deployments disabled/i);
  });

  it("rejects missing production billing bindings and mismatched immutable project IDs", () => {
    const missingPrice = { ...productionRuntimeValues };
    delete missingPrice.VITE_STRIPE_PRICE_PROFESSIONAL_ANNUAL;
    expect(() =>
      buildCloudflarePagesProductionPostureEvidence({
        ...productionOptions,
        stagingApi: projectEnvelope({
          name: options.stagingProjectName,
          values: stagingValues,
        }),
        productionApi: projectEnvelope({
          name: options.productionProjectName,
          values: missingPrice,
          includeServiceRole: false,
        }),
      }),
    ).toThrow(/required/i);

    expect(() =>
      buildCloudflarePagesProductionPostureEvidence({
        ...productionOptions,
        productionProjectId: "wrong-production-project-id",
        stagingApi: projectEnvelope({
          name: options.stagingProjectName,
          values: stagingValues,
        }),
        productionApi: projectEnvelope({
          name: options.productionProjectName,
          values: productionRuntimeValues,
          includeServiceRole: false,
        }),
      }),
    ).toThrow(/immutable project/i);
  });

  it("rejects production bindings outside the explicit schema", () => {
    const productionApi = projectEnvelope({
      name: options.productionProjectName,
      values: productionRuntimeValues,
      includeServiceRole: false,
    });
    productionApi.result.deployment_configs.production.env_vars.DATABASE_URL = {
      type: "secret_text",
      value: "must-not-be-bound",
    };

    expect(() =>
      buildCloudflarePagesProductionPostureEvidence({
        ...productionOptions,
        stagingApi: projectEnvelope({
          name: options.stagingProjectName,
          values: stagingValues,
        }),
        productionApi,
      })
    ).toThrow(/unexpected production Pages binding DATABASE_URL/i);
  });

  it("rejects missing or malformed production binding maps", () => {
    for (const invalidEnvVars of [undefined, null, []]) {
      const productionApi = projectEnvelope({
        name: options.productionProjectName,
        values: productionRuntimeValues,
        includeServiceRole: false,
      });
      productionApi.result.deployment_configs.production.env_vars =
        invalidEnvVars;

      expect(() =>
        buildCloudflarePagesProductionRuntimeSnapshotEvidence({
          productionApi,
          productionProjectName: options.productionProjectName,
          productionProjectId: options.productionProjectId,
        })
      ).toThrow(/production Pages runtime bindings are missing or invalid/i);
    }
  });
});

describe("Cloudflare Pages posture CLI", () => {
  it("requires an explicit mode before reading project files", () => {
    const result = spawnSync(
      process.execPath,
      [
        resolve(
          import.meta.dirname,
          "validate-cloudflare-pages-staging-posture.mjs",
        ),
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--mode is required");
    expect(result.stderr).not.toContain("--staging-project-file");
  });

  it("rejects unknown modes before interpreting them as staging validation", () => {
    const result = spawnSync(
      process.execPath,
      [
        resolve(
          import.meta.dirname,
          "validate-cloudflare-pages-staging-posture.mjs",
        ),
        "--mode",
        "stagin",
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Unsupported Cloudflare Pages posture mode: stagin",
    );
    expect(result.stderr).not.toContain("--staging-project-file");
  });
});
