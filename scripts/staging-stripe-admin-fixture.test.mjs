import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  cleanupStagingStripeAdminFixture,
  createStagingStripeAdminFixture,
} from "./staging-stripe-admin-fixture.mjs";

const stagingEnv = {
  STAGING_SUPABASE_PROJECT_ID: "xsiehskfgeoqyazcgauv",
  STAGING_SUPABASE_URL: "https://xsiehskfgeoqyazcgauv.supabase.co",
  STAGING_SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
  STAGING_MUTATION_ACKNOWLEDGEMENT: "MUTATE_STAGING_xsiehskfgeoqyazcgauv",
};

function authoritativeProfilesQuery(profiles, error = null) {
  const query = {
    eq: vi.fn(() => query),
    then(onFulfilled, onRejected) {
      return Promise.resolve({ data: profiles, error }).then(
        onFulfilled,
        onRejected,
      );
    },
  };
  return { select: vi.fn(() => query), query };
}

describe("staging Stripe admin session", () => {
  it("supplies the pinned ws transport to Supabase clients on Node 20", async () => {
    const source = await readFile(
      resolve("scripts/staging-stripe-admin-fixture.mjs"),
      "utf8",
    );

    expect(source).toContain('import WebSocket from "ws";');
    expect(source).toContain("realtime: { transport: WebSocket }");
  });

  it("derives the single authoritative admin from profile truth without an email secret", async () => {
    const existingUser = {
      id: "authoritative-admin-id",
      email: "current-admin@example.test",
    };
    const profiles = authoritativeProfilesQuery([
      {
        user_id: existingUser.id,
        role: "admin",
        is_platform_admin: true,
      },
    ]);
    const getUserById = vi.fn(async () => ({
      data: { user: existingUser },
      error: null,
    }));
    const generateLink = vi.fn(async () => ({
      data: {
        properties: { hashed_token: "one-time-token-hash" },
        user: existingUser,
      },
      error: null,
    }));
    const admin = {
      from: vi.fn(() => profiles),
      auth: {
        admin: {
          getUserById,
          generateLink,
          createUser: vi.fn(),
          deleteUser: vi.fn(),
        },
      },
      rpc: vi.fn(),
    };
    const actor = {
      auth: {
        verifyOtp: vi.fn(async () => ({
          data: {
            user: existingUser,
            session: { access_token: "fixture-access-token" },
          },
          error: null,
        })),
      },
    };

    await expect(
      createStagingStripeAdminFixture({ env: stagingEnv, admin, actor }),
    ).resolves.toEqual({
      userId: existingUser.id,
      accessToken: "fixture-access-token",
    });
    expect(profiles.query.eq).toHaveBeenNthCalledWith(1, "role", "admin");
    expect(profiles.query.eq).toHaveBeenNthCalledWith(
      2,
      "is_platform_admin",
      true,
    );
    expect(getUserById).toHaveBeenCalledWith(existingUser.id);
    expect(generateLink).toHaveBeenCalledWith({
      type: "recovery",
      email: existingUser.email,
    });
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["zero", []],
    [
      "multiple",
      [
        { user_id: "admin-1", role: "admin", is_platform_admin: true },
        { user_id: "admin-2", role: "admin", is_platform_admin: true },
      ],
    ],
  ])(
    "fails closed with %s authoritative admin profiles",
    async (_label, rows) => {
      const profiles = authoritativeProfilesQuery(rows);
      const getUserById = vi.fn();
      const admin = {
        from: vi.fn(() => profiles),
        auth: { admin: { getUserById } },
      };

      await expect(
        createStagingStripeAdminFixture({ env: stagingEnv, admin, actor: {} }),
      ).rejects.toThrow(/exactly one authoritative staging admin profile/i);
      expect(getUserById).not.toHaveBeenCalled();
    },
  );

  it("fails closed when the authoritative profile and Auth identity mismatch", async () => {
    const profiles = authoritativeProfilesQuery([
      { user_id: "profile-admin", role: "admin", is_platform_admin: true },
    ]);
    const generateLink = vi.fn();
    const admin = {
      from: vi.fn(() => profiles),
      auth: {
        admin: {
          getUserById: vi.fn(async () => ({
            data: {
              user: { id: "different-admin", email: "admin@example.test" },
            },
            error: null,
          })),
          generateLink,
        },
      },
    };

    await expect(
      createStagingStripeAdminFixture({ env: stagingEnv, admin, actor: {} }),
    ).rejects.toThrow(/identity mismatch/i);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("revokes only the generated session when token verification returns the wrong user", async () => {
    const existingUser = {
      id: "authoritative-admin-id",
      email: "current-admin@example.test",
    };
    const profiles = authoritativeProfilesQuery([
      {
        user_id: existingUser.id,
        role: "admin",
        is_platform_admin: true,
      },
    ]);
    const signOut = vi.fn(async () => ({ error: null }));
    const admin = {
      from: vi.fn(() => profiles),
      auth: {
        admin: {
          getUserById: vi.fn(async () => ({
            data: { user: existingUser },
            error: null,
          })),
          generateLink: vi.fn(async () => ({
            data: {
              properties: { hashed_token: "one-time-token-hash" },
              user: existingUser,
            },
            error: null,
          })),
          signOut,
        },
      },
    };
    const actor = {
      auth: {
        verifyOtp: vi.fn(async () => ({
          data: {
            user: { id: "wrong-user-id" },
            session: { access_token: "wrong-session-token" },
          },
          error: null,
        })),
      },
    };

    await expect(
      createStagingStripeAdminFixture({ env: stagingEnv, admin, actor }),
    ).rejects.toThrow(/identity mismatch/i);
    expect(signOut).toHaveBeenCalledWith("wrong-session-token", "local");
  });

  it("fails cleanup when Auth verification has an operational error", async () => {
    const signOut = vi.fn(async () => ({ error: null }));
    const admin = {
      auth: {
        admin: {
          signOut,
          getUserById: vi.fn(async () => ({
            data: { user: null },
            error: {
              message: "Auth service unavailable",
              status: 503,
              code: "unexpected_failure",
            },
          })),
        },
      },
    };

    await expect(
      cleanupStagingStripeAdminFixture({
        env: stagingEnv,
        admin,
        state: {
          userId: "authoritative-admin-id",
          accessToken: "fixture-access-token",
        },
      }),
    ).rejects.toThrow(/Auth service unavailable/);
    expect(signOut).toHaveBeenCalledWith("fixture-access-token", "local");
  });

  it("fails cleanup if the authoritative admin no longer exists", async () => {
    const admin = {
      auth: {
        admin: {
          signOut: vi.fn(async () => ({ error: null })),
          getUserById: vi.fn(async () => ({
            data: { user: null },
            error: {
              message: "User not found",
              status: 404,
              code: "user_not_found",
            },
          })),
        },
      },
    };

    await expect(
      cleanupStagingStripeAdminFixture({
        env: stagingEnv,
        admin,
        state: {
          userId: "authoritative-admin-id",
          accessToken: "fixture-access-token",
        },
      }),
    ).rejects.toThrow(/User not found/);
  });
});
