import { describe, expect, it } from "vitest";
import {
  assertStagingMutationTarget,
  MAIPROP_PRODUCTION_SUPABASE_PROJECT_REF,
  MAIPROP_STAGING_MUTATION_ACKNOWLEDGEMENT,
  MAIPROP_STAGING_SUPABASE_PROJECT_REF,
} from "./assert-staging-mutation-target.mjs";

const validTarget = {
  projectRef: MAIPROP_STAGING_SUPABASE_PROJECT_REF,
  acknowledgement: MAIPROP_STAGING_MUTATION_ACKNOWLEDGEMENT,
};

describe("assertStagingMutationTarget", () => {
  it("accepts the exact MaiProp staging project and acknowledgement", () => {
    expect(assertStagingMutationTarget(validTarget)).toEqual({
      projectRef: MAIPROP_STAGING_SUPABASE_PROJECT_REF,
      databaseProjectRef: null,
    });
  });

  it("rejects the production project even with the staging acknowledgement", () => {
    expect(() =>
      assertStagingMutationTarget({
        ...validTarget,
        projectRef: MAIPROP_PRODUCTION_SUPABASE_PROJECT_REF,
      }),
    ).toThrow(/production Supabase project/);
  });

  it("rejects arbitrary non-production projects", () => {
    expect(() =>
      assertStagingMutationTarget({
        ...validTarget,
        projectRef: "abcdefghijklmnopqrst",
      }),
    ).toThrow(/Staging mutation target/);
  });

  it("requires the exact staging mutation acknowledgement", () => {
    expect(() =>
      assertStagingMutationTarget({
        ...validTarget,
        acknowledgement: "MUTATE_STAGING",
      }),
    ).toThrow(/acknowledgement/);
  });

  it("proves pooler and direct database URLs target staging", () => {
    const password = encodeURIComponent("not-a-secret:test");
    const pooler = assertStagingMutationTarget({
      ...validTarget,
      databaseUrl:
        `postgresql://postgres.${MAIPROP_STAGING_SUPABASE_PROJECT_REF}:${password}` +
        "@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require",
    });
    const direct = assertStagingMutationTarget({
      ...validTarget,
      databaseUrl:
        `postgresql://postgres:${password}@db.${MAIPROP_STAGING_SUPABASE_PROJECT_REF}` +
        ".supabase.co:5432/postgres?sslmode=require",
    });

    expect(pooler.databaseProjectRef).toBe(
      MAIPROP_STAGING_SUPABASE_PROJECT_REF,
    );
    expect(direct.databaseProjectRef).toBe(
      MAIPROP_STAGING_SUPABASE_PROJECT_REF,
    );
  });

  it("accepts only an exactly-bound temporary login role that assumes postgres", () => {
    const role = "cli_login_01234567";
    for (const username of [role, `${role}.${MAIPROP_STAGING_SUPABASE_PROJECT_REF}`]) {
      const host = username === role
        ? `db.${MAIPROP_STAGING_SUPABASE_PROJECT_REF}.supabase.co`
        : "aws-0-eu-central-1.pooler.supabase.com";
      expect(assertStagingMutationTarget({
        ...validTarget,
        ephemeralRole: role,
        databaseUrl: `postgresql://${username}:temporary@${host}:5432/postgres?sslmode=require&options=-c+role%3Dpostgres`,
      }).databaseProjectRef).toBe(MAIPROP_STAGING_SUPABASE_PROJECT_REF);
    }
    for (const ephemeralRole of [undefined, "cli_login_other", "postgres"]) {
      expect(() => assertStagingMutationTarget({
        ...validTarget,
        ephemeralRole,
        databaseUrl: `postgresql://${role}:temporary@db.${MAIPROP_STAGING_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require&options=-c+role%3Dpostgres`,
      })).toThrow();
    }
  });

  it("rejects a database URL whose embedded project differs", () => {
    expect(() =>
      assertStagingMutationTarget({
        ...validTarget,
        databaseUrl:
          "postgresql://postgres.qvvicunqcrwpioqnvzxf:password" +
          "@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require",
      }),
    ).toThrow(/does not match staging/);
  });

  it("rejects an arbitrary host even when the username embeds staging", () => {
    expect(() =>
      assertStagingMutationTarget({
        ...validTarget,
        databaseUrl:
          `postgresql://postgres.${MAIPROP_STAGING_SUPABASE_PROJECT_REF}:password` +
          "@attacker.example:5432/postgres?sslmode=require",
      }),
    ).toThrow(/Supabase direct or pooler hostname/);
  });

  it("requires TLS and the postgres database", () => {
    expect(() =>
      assertStagingMutationTarget({
        ...validTarget,
        databaseUrl:
          `postgresql://postgres.${MAIPROP_STAGING_SUPABASE_PROJECT_REF}:password` +
          "@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
      }),
    ).toThrow(/sslmode=require/);

    expect(() =>
      assertStagingMutationTarget({
        ...validTarget,
        databaseUrl:
          `postgresql://postgres.${MAIPROP_STAGING_SUPABASE_PROJECT_REF}:password` +
          "@aws-0-eu-central-1.pooler.supabase.com:5432/template1?sslmode=require",
      }),
    ).toThrow(/postgres database/);
  });

  it("rejects every libpq query parameter that could override the inspected authority", () => {
    const role = "cli_login_01234567";
    const overrides = [
      "host=attacker.example",
      "hostaddr=127.0.0.1",
      "port=6543",
      "user=postgres",
      "password=override",
      "dbname=template1",
      "service=attacker",
      "servicefile=%2Ftmp%2Fservice.conf",
      "target_session_attrs=read-write",
      "connect_timeout=10",
      "unknown_key=value",
      "sslmode=require&sslmode=require",
      "options=-c%20role%3Dpostgres",
    ];
    for (const parameter of overrides) {
      expect(() => assertStagingMutationTarget({
        ...validTarget,
        databaseUrl: `postgresql://postgres:password@db.${MAIPROP_STAGING_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require&${parameter}`,
      })).toThrow(/database|parameter|option|TLS/i);
      expect(() => assertStagingMutationTarget({
        ...validTarget,
        ephemeralRole: role,
        databaseUrl: `postgresql://${role}:temporary@db.${MAIPROP_STAGING_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require&options=-c%20role%3Dpostgres&${parameter}`,
      })).toThrow(/database|parameter|option|TLS/i);
    }
  });
});
