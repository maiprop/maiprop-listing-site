import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertPromotionEntitlementTarget,
  provePromotionMutationPrivilege,
} from "./promotion_entitlement_target.mjs";
import {
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_REF,
} from "../../scripts/staging-load-dataset.mjs";

const STAGING_MUTATION_ACKNOWLEDGEMENT =
  `MUTATE_STAGING_${STAGING_PROJECT_REF}`;

const stagingDatabaseUrl =
  `postgresql://postgres.${STAGING_PROJECT_REF}:password` +
  "@aws-0-eu-west-3.pooler.supabase.com:5432/postgres?sslmode=require";

describe("promotion entitlement mutation target guard", () => {
  it("preserves local-only execution without a staging acknowledgement", () => {
    assert.deepEqual(
      assertPromotionEntitlementTarget({
        databaseUrl:
          "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      }),
      {
        target: "local",
        projectRef: "local",
        isLocal: true,
      },
    );
  });

  it("accepts the exact TLS staging database identity", () => {
    assert.deepEqual(
      assertPromotionEntitlementTarget({
        databaseUrl: stagingDatabaseUrl,
        target: "staging",
        acknowledgement: STAGING_MUTATION_ACKNOWLEDGEMENT,
      }),
      {
        target: "staging",
        projectRef: STAGING_PROJECT_REF,
        isLocal: false,
      },
    );
  });

  it("does not trust a forged allowlist naming production", () => {
    assert.throws(
      () =>
        assertPromotionEntitlementTarget({
          databaseUrl:
            `postgresql://postgres.${PRODUCTION_PROJECT_REF}:password` +
            "@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require",
          target: "staging",
          acknowledgement: STAGING_MUTATION_ACKNOWLEDGEMENT,
          allowedProjectRefs: [PRODUCTION_PROJECT_REF],
        }),
      /does not match staging|production/,
    );
  });

  it("rejects a staging-prefixed database host lookalike", () => {
    assert.throws(
      () =>
        assertPromotionEntitlementTarget({
          databaseUrl:
            `postgresql://postgres.${STAGING_PROJECT_REF}:password` +
            `@${STAGING_PROJECT_REF}.pooler.supabase.com.attacker.example:5432/postgres?sslmode=require`,
          target: "staging",
          acknowledgement: STAGING_MUTATION_ACKNOWLEDGEMENT,
        }),
      /Supabase direct or pooler hostname/,
    );
  });

  it("requires TLS for the remote staging database", () => {
    assert.throws(
      () =>
        assertPromotionEntitlementTarget({
          databaseUrl:
            `postgresql://postgres.${STAGING_PROJECT_REF}:password` +
            "@aws-0-eu-west-3.pooler.supabase.com:5432/postgres",
          target: "staging",
          acknowledgement: STAGING_MUTATION_ACKNOWLEDGEMENT,
        }),
      /sslmode=require/,
    );
  });

  it("requires the fixed acknowledgement for remote mutation", () => {
    assert.throws(
      () =>
        assertPromotionEntitlementTarget({
          databaseUrl: stagingDatabaseUrl,
          target: "staging",
          acknowledgement: "",
        }),
      /acknowledgement/,
    );
  });
});

describe("promotion entitlement database privilege gate", () => {
  it("fails before mutation when the database caller lacks fixture privileges", async () => {
    let mutationCalls = 0;
    const runReadOnlyProbe = async () => ({
      code: 0,
      stdout: "insufficient",
      stderr: "",
    });

    await assert.rejects(
      async () => {
        await provePromotionMutationPrivilege(runReadOnlyProbe);
        mutationCalls += 1;
      },
      /required fixture mutation privileges/,
    );
    assert.equal(mutationCalls, 0);
  });
});
