import { describe, expect, it, vi } from "vitest";
import {
  assertExistingFixtureUsersAreSafe,
  assertIsolatedStagingTarget,
  prepareIsolatedSecurityFixtures,
  resetVerifiedPlatformAdmin,
} from "./prepare-isolated-security-fixtures.mjs";
import {
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_REF,
} from "./staging-load-dataset.mjs";

const STAGING_MUTATION_ACKNOWLEDGEMENT =
  `MUTATE_STAGING_${STAGING_PROJECT_REF}`;

function stagingEnv(overrides = {}) {
  return {
    E2E_SECURITY_USE_ISOLATED_STAGING: "true",
    E2E_ALLOW_DESTRUCTIVE_LIVE_TESTS: "true",
    E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS: STAGING_PROJECT_REF,
    STAGING_MUTATION_ACKNOWLEDGEMENT:
      STAGING_MUTATION_ACKNOWLEDGEMENT,
    VITE_SUPABASE_PROJECT_ID: STAGING_PROJECT_REF,
    VITE_SUPABASE_URL:
      `https://${STAGING_PROJECT_REF}.supabase.co`,
    VITE_SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-test-key",
    RLS_USER_A_EMAIL: "buyer-a@example.test",
    RLS_USER_B_EMAIL: "seller-b@example.test",
    RLS_USER_PASSWORD: "not-a-secret",
    RLS_ADMIN_EMAIL: "platform-admin@example.test",
    RLS_ADMIN_PASSWORD: "admin-not-a-secret",
    ONBOARDING_TEST_EMAIL: "onboarding@example.test",
    ONBOARDING_TEST_PASSWORD: "not-a-secret",
    ...overrides,
  };
}

describe("isolated security fixture target guard", () => {
  it("accepts only the repository-owned staging project identity", () => {
    expect(assertIsolatedStagingTarget(stagingEnv())).toMatchObject({
      projectRef: STAGING_PROJECT_REF,
      apiUrl:
        `https://${STAGING_PROJECT_REF}.supabase.co`,
    });
  });

  it("does not trust a forged caller-controlled allowlist", () => {
    const forgedRef = "abcdefghijklmnopqrst";
    expect(() =>
      assertIsolatedStagingTarget(
        stagingEnv({
          E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS: forgedRef,
          VITE_SUPABASE_PROJECT_ID: forgedRef,
          VITE_SUPABASE_URL: `https://${forgedRef}.supabase.co`,
        }),
      ),
    ).toThrow(/Staging mutation target/);
  });

  it("rejects the production project even when the allowlist names it", () => {
    expect(() =>
      assertIsolatedStagingTarget(
        stagingEnv({
          E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS:
            PRODUCTION_PROJECT_REF,
          VITE_SUPABASE_PROJECT_ID:
            PRODUCTION_PROJECT_REF,
          VITE_SUPABASE_URL:
            `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
        }),
      ),
    ).toThrow(/production Supabase project/);
  });

  it("rejects a staging-prefixed host lookalike", () => {
    expect(() =>
      assertIsolatedStagingTarget(
        stagingEnv({
          VITE_SUPABASE_URL:
            `https://${STAGING_PROJECT_REF}.supabase.co.attacker.example`,
        }),
      ),
    ).toThrow(/exact MaiProp staging API host/);
  });

  it("requires HTTPS for the remote staging API", () => {
    expect(() =>
      assertIsolatedStagingTarget(
        stagingEnv({
          VITE_SUPABASE_URL:
            `http://${STAGING_PROJECT_REF}.supabase.co`,
        }),
      ),
    ).toThrow(/over HTTPS/);
  });

  it("requires the fixed staging mutation acknowledgement", () => {
    expect(() =>
      assertIsolatedStagingTarget(
        stagingEnv({ STAGING_MUTATION_ACKNOWLEDGEMENT: "" }),
      ),
    ).toThrow(/acknowledgement/i);
  });
});

describe("isolated security fixture privilege gate", () => {
  it("resets credentials only for an existing verified platform admin", async () => {
    const adminUser = {
      id: "verified-admin-id",
      email: "platform-admin@example.test",
      app_metadata: { provider: "email", providers: ["email"] },
    };
    const updatedUser = { ...adminUser, email_confirmed_at: "2026-09-05T00:00:00Z" };
    const updateUserById = vi.fn().mockResolvedValue({
      data: { user: updatedUser },
      error: null,
    });
    const profileQuery = {
      select: vi.fn(() => profileQuery),
      eq: vi.fn(() => profileQuery),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { role: "admin", is_platform_admin: false },
        error: null,
      }),
    };
    const admin = {
      auth: { admin: { updateUserById } },
      from: vi.fn(() => profileQuery),
    };

    await expect(
      resetVerifiedPlatformAdmin(
        admin,
        adminUser,
        "platform-admin@example.test",
        "admin-not-a-secret",
      ),
    ).resolves.toBe(updatedUser);
    expect(updateUserById).toHaveBeenCalledWith(adminUser.id, {
      password: "admin-not-a-secret",
      email_confirm: true,
    });
  });

  it("does not create or promote an identity that is not already a platform admin", async () => {
    const mutation = vi.fn(() => {
      throw new Error("admin mutation must not run");
    });
    const profileQuery = {
      select: vi.fn(() => profileQuery),
      eq: vi.fn(() => profileQuery),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { role: "seller", is_platform_admin: true },
        error: null,
      }),
    };
    const admin = {
      auth: { admin: { updateUserById: mutation, createUser: mutation } },
      from: vi.fn(() => profileQuery),
    };

    await expect(
      resetVerifiedPlatformAdmin(
        admin,
        {
          id: "ordinary-user-id",
          email: "ordinary@example.test",
          app_metadata: { provider: "email", providers: ["email"] },
        },
        "ordinary@example.test",
        "admin-not-a-secret",
      ),
    ).rejects.toThrow(/not an existing platform admin/i);
    expect(mutation).not.toHaveBeenCalled();
  });

  it("adopts only a non-admin canonical staging demo identity into server-owned metadata", async () => {
    const existingUser = {
      id: "canonical-seller-id",
      email: "seller.pro@maiprop.demo",
      app_metadata: { provider: "email", providers: ["email"] },
    };
    const updateUserById = vi.fn().mockResolvedValue({
      data: {
        user: {
          ...existingUser,
          app_metadata: {
            ...existingUser.app_metadata,
            e2e_fixture: "isolated-security",
          },
        },
      },
      error: null,
    });
    const queryResults = {
      profiles: {
        data: [{
          user_id: existingUser.id,
          role: "seller",
          is_platform_admin: false,
        }],
        error: null,
      },
      user_roles: { data: [], error: null },
    };
    const admin = {
      auth: { admin: { updateUserById } },
      from: vi.fn((table) => {
        const query = {
          select: vi.fn(() => query),
          in: vi.fn().mockResolvedValue(queryResults[table]),
        };
        return query;
      }),
    };

    await expect(
      assertExistingFixtureUsersAreSafe(
        admin,
        new Map([[existingUser.email, existingUser]]),
        { allowCanonicalDemoAdoption: true },
      ),
    ).resolves.toBeUndefined();
    expect(updateUserById).toHaveBeenCalledWith(existingUser.id, {
      app_metadata: {
        provider: "email",
        providers: ["email"],
        e2e_fixture: "isolated-security",
      },
    });
    expect(existingUser.app_metadata.e2e_fixture).toBe("isolated-security");
  });

  it("rejects target evidence before constructing an admin client", async () => {
    const createAdminClient = vi.fn();

    await expect(
      prepareIsolatedSecurityFixtures({
        env: stagingEnv({
          VITE_SUPABASE_URL:
            `https://${STAGING_PROJECT_REF}.supabase.co.attacker.example`,
        }),
        createAdminClient,
      }),
    ).rejects.toThrow(/exact MaiProp staging API host/);

    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("fails before resetting or deleting users when admin privilege is absent", async () => {
    const mutation = vi.fn(() => {
      throw new Error("mutation must not run");
    });
    const listUsers = vi.fn().mockResolvedValue({
      data: { users: [] },
      error: { message: "not authorized" },
    });
    const createAdminClient = vi.fn(() => ({
      auth: {
        admin: {
          listUsers,
          createUser: mutation,
          updateUserById: mutation,
          deleteUser: mutation,
        },
      },
      from: mutation,
    }));

    await expect(
      prepareIsolatedSecurityFixtures({
        env: stagingEnv(),
        createAdminClient,
      }),
    ).rejects.toThrow(/validate staging Auth admin privilege/);

    expect(createAdminClient).toHaveBeenCalledOnce();
    expect(listUsers).toHaveBeenCalledOnce();
    expect(mutation).not.toHaveBeenCalled();
  });

  it("rejects protected existing identities before any fixture mutation", async () => {
    const mutation = vi.fn(() => {
      throw new Error("mutation must not run");
    });
    const protectedUser = {
      id: "admin-user-id",
      email: "buyer-a@example.test",
      user_metadata: { e2e_fixture: "isolated-security" },
    };
    const listUsers = vi.fn().mockResolvedValue({
      data: { users: [protectedUser] },
      error: null,
    });
    const queryResults = {
      profiles: {
        data: [{
          user_id: protectedUser.id,
          role: "admin",
          is_platform_admin: true,
        }],
        error: null,
      },
      user_roles: {
        data: [{ user_id: protectedUser.id, role: "admin" }],
        error: null,
      },
    };
    const createAdminClient = vi.fn(() => ({
      auth: {
        admin: {
          listUsers,
          createUser: mutation,
          updateUserById: mutation,
          deleteUser: mutation,
        },
      },
      from: vi.fn((table) => {
        const query = {
          select: vi.fn(() => query),
          in: vi.fn().mockResolvedValue(queryResults[table]),
        };
        return query;
      }),
    }));

    await expect(
      prepareIsolatedSecurityFixtures({
        env: stagingEnv(),
        createAdminClient,
      }),
    ).rejects.toThrow(/protected admin identity/i);

    expect(mutation).not.toHaveBeenCalled();
  });

  it("does not replace an existing user without the disposable fixture marker", async () => {
    const mutation = vi.fn(() => {
      throw new Error("mutation must not run");
    });
    const existingUser = {
      id: "existing-onboarding-id",
      email: "onboarding@example.test",
      user_metadata: {},
    };
    const listUsers = vi.fn().mockResolvedValue({
      data: { users: [existingUser] },
      error: null,
    });
    const createAdminClient = vi.fn(() => ({
      auth: {
        admin: {
          listUsers,
          createUser: mutation,
          updateUserById: mutation,
          deleteUser: mutation,
        },
      },
      from: vi.fn(() => {
        const query = {
          select: vi.fn(() => query),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
        return query;
      }),
    }));

    await expect(
      prepareIsolatedSecurityFixtures({
        env: stagingEnv(),
        createAdminClient,
      }),
    ).rejects.toThrow(/disposable staging fixture/i);

    expect(mutation).not.toHaveBeenCalled();
  });

  it("does not trust a user-editable metadata marker for fixture ownership", async () => {
    const mutation = vi.fn(() => {
      throw new Error("mutation must not run");
    });
    const existingUser = {
      id: "forged-fixture-id",
      email: "onboarding@example.test",
      user_metadata: { e2e_fixture: "isolated-security" },
      app_metadata: {},
    };
    const listUsers = vi.fn().mockResolvedValue({
      data: { users: [existingUser] },
      error: null,
    });
    const createAdminClient = vi.fn(() => ({
      auth: {
        admin: {
          listUsers,
          createUser: mutation,
          updateUserById: mutation,
          deleteUser: mutation,
        },
      },
      from: vi.fn(() => {
        const query = {
          select: vi.fn(() => query),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
        return query;
      }),
    }));

    await expect(
      prepareIsolatedSecurityFixtures({
        env: stagingEnv(),
        createAdminClient,
      }),
    ).rejects.toThrow(/server-owned disposable staging fixture/i);

    expect(mutation).not.toHaveBeenCalled();
  });
});
