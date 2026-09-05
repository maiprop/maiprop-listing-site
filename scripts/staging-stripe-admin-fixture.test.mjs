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
  E2E_ADMIN_EMAIL: "authoritative-admin@example.test",
};

function profileQuery(profile) {
  return {
    select() {
      return {
        eq() {
          return {
            async maybeSingle() {
              return { data: profile, error: null };
            },
          };
        },
      };
    },
  };
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

  it("authenticates the exact existing authoritative admin without mutating its identity", async () => {
    const existingUser = {
      id: "authoritative-admin-id",
      email: stagingEnv.E2E_ADMIN_EMAIL,
    };
    const admin = {
      from: vi.fn(() =>
        profileQuery({
          user_id: existingUser.id,
          role: "admin",
          is_platform_admin: true,
        }),
      ),
      auth: {
        admin: {
          listUsers: vi.fn(async () => ({
            data: { users: [existingUser] },
            error: null,
          })),
          generateLink: vi.fn(async () => ({
            data: {
              properties: { hashed_token: "one-time-token-hash" },
              user: existingUser,
            },
            error: null,
          })),
          signOut: vi.fn(async () => ({ error: null })),
          getUserById: vi.fn(async () => ({
            data: { user: existingUser },
            error: null,
          })),
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

    const state = await createStagingStripeAdminFixture({
      env: stagingEnv,
      admin,
      actor,
    });

    expect(state).toEqual({
      userId: existingUser.id,
      accessToken: "fixture-access-token",
    });
    expect(admin.auth.admin.generateLink).toHaveBeenCalledWith({
      type: "recovery",
      email: stagingEnv.E2E_ADMIN_EMAIL,
    });
    expect(actor.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "one-time-token-hash",
      type: "recovery",
    });
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();

    await cleanupStagingStripeAdminFixture({ env: stagingEnv, admin, state });

    expect(admin.auth.admin.signOut).toHaveBeenCalledWith(
      "fixture-access-token",
      "local",
    );
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("fails before magic-link generation when the configured admin does not already exist", async () => {
    const generateLink = vi.fn();
    const admin = {
      auth: {
        admin: {
          listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })),
          generateLink,
        },
      },
    };

    await expect(
      createStagingStripeAdminFixture({
        env: stagingEnv,
        admin,
        actor: {},
      }),
    ).rejects.toThrow(/existing authoritative staging admin/i);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("revokes only the generated session when token verification returns the wrong user", async () => {
    const existingUser = {
      id: "authoritative-admin-id",
      email: stagingEnv.E2E_ADMIN_EMAIL,
    };
    const signOut = vi.fn(async () => ({ error: null }));
    const admin = {
      from: vi.fn(() =>
        profileQuery({
          user_id: existingUser.id,
          role: "admin",
          is_platform_admin: true,
        }),
      ),
      auth: {
        admin: {
          listUsers: vi.fn(async () => ({
            data: { users: [existingUser] },
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

  it("fails closed when the Auth user scan reaches its pagination cap", async () => {
    const users = Array.from({ length: 1000 }, (_, index) => ({
      id: `unrelated-${index}`,
      email: `unrelated-${index}@example.test`,
    }));
    const generateLink = vi.fn();
    const listUsers = vi.fn(async () => ({ data: { users }, error: null }));
    const admin = { auth: { admin: { listUsers, generateLink } } };

    await expect(
      createStagingStripeAdminFixture({ env: stagingEnv, admin, actor: {} }),
    ).rejects.toThrow(/pagination cap/i);
    expect(listUsers).toHaveBeenCalledTimes(20);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("fails cleanup when Auth verification has an operational error", async () => {
    const admin = {
      auth: {
        admin: {
          signOut: vi.fn(async () => ({ error: null })),
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
