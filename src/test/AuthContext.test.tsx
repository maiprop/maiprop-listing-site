/**
 * Tests for AuthProvider + useAuth.
 *
 * The provider wires three Supabase touchpoints:
 *   1. supabase.auth.onAuthStateChange  \u2014 the source of session updates.
 *   2. supabase.auth.getSession         \u2014 restores the session on mount.
 *   3. supabase.functions.invoke        \u2014 check-subscription edge function.
 *
 * We mock all of them and drive the auth-state callback synchronously so
 * the React tree reflects the desired state without real network.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, renderHook, waitFor } from "@testing-library/react";

const {
  authActivityMock,
  authStateCallbackHolder,
  realtimeCallbacks,
  supabaseMock,
} = vi.hoisted(() => {
  // Holder<T> lets us reassign the captured onAuthStateChange listener
  // between tests so each test can drive the provider with a fresh shape.
  const authStateCallbackHolder: { current: ((event: string, session: unknown) => void) | null } = {
    current: null,
  };
  const realtimeCallbacks: Array<{
    table: string;
    callback: () => void;
  }> = [];

  const supabaseMock = {
    auth: {
      onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
        authStateCallbackHolder.current = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      signUp: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      setSession: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    channel: vi.fn(() => {
      const channel = {
        on: vi.fn((
          _event: string,
          filter: { table: string },
          callback: () => void,
        ) => {
          realtimeCallbacks.push({ table: filter.table, callback });
          return channel;
        }),
        subscribe: vi.fn(() => channel),
      };
      return channel;
    }),
    removeChannel: vi.fn().mockResolvedValue(undefined),
  };

  const authActivityMock = {
    recordUserAuthActivity: vi.fn().mockResolvedValue("auth-event-1"),
  };

  return {
    authActivityMock,
    authStateCallbackHolder,
    realtimeCallbacks,
    supabaseMock,
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseMock,
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/config", () => ({ APP_ORIGIN: "https://test.maiprop" }));
vi.mock("@/lib/authActivity", () => ({
  recordUserAuthActivity: (...args: unknown[]) => authActivityMock.recordUserAuthActivity(...args),
}));

import {
  AuthProvider,
  buildAuthorizationFingerprint,
  profileNeedsOnboarding,
  sessionIdFromAccessToken,
  unavailableSubscriptionState,
  useAuth,
} from "@/contexts/AuthContext";
import { appQueryClient } from "@/lib/appQueryClient";
import {
  accountQueryKey,
  authorizationQueryKey,
  resetIdentityQueryStateForTests,
} from "@/lib/identityQueryBoundary";

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function wrap({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

function base64UrlJson(value: Record<string, unknown>) {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function jwtWithSessionId(
  sessionId: string | null,
  tokenVersion = "one",
) {
  const payload: Record<string, unknown> = {
    exp: 4_102_444_800,
    token_version: tokenVersion,
  };
  if (sessionId !== null) payload.session_id = sessionId;
  return [
    base64UrlJson({ alg: "none", typ: "JWT" }),
    base64UrlJson(payload),
    base64UrlJson({ signature: "fixture" }),
  ].join(".");
}

function sessionFixture(
  userId: string,
  sessionId: string | null,
  tokenVersion = "one",
  accessToken = jwtWithSessionId(sessionId, tokenVersion),
) {
  return {
    access_token: accessToken,
    refresh_token: `refresh-${userId}-${tokenVersion}`,
    token_type: "bearer",
    expires_in: 3_600,
    expires_at: 4_102_444_800,
    user: {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email: `${userId}@example.test`,
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-08-24T00:00:00.000Z",
      updated_at: "2026-08-24T00:00:00.000Z",
    },
  };
}

beforeEach(() => {
  appQueryClient.clear();
  resetIdentityQueryStateForTests();
  authStateCallbackHolder.current = null;
  realtimeCallbacks.length = 0;
  vi.clearAllMocks();
  // Reinstall default behaviour after clearAllMocks wipes implementations.
  supabaseMock.auth.onAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
    authStateCallbackHolder.current = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  supabaseMock.auth.getSession.mockReset();
  supabaseMock.auth.getSession.mockResolvedValue({ data: { session: null } });
  supabaseMock.auth.signOut.mockReset();
  supabaseMock.auth.signOut.mockResolvedValue({ error: null });
  supabaseMock.auth.setSession.mockReset();
  supabaseMock.auth.setSession.mockResolvedValue({ data: { user: null, session: null }, error: null });
  supabaseMock.auth.signInWithPassword.mockReset();
  supabaseMock.auth.signInWithPassword.mockResolvedValue({ error: null });
  supabaseMock.auth.signUp.mockReset();
  supabaseMock.auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: null });
  supabaseMock.from.mockImplementation(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  }));
  supabaseMock.functions.invoke.mockResolvedValue({ data: null, error: null });
  authActivityMock.recordUserAuthActivity.mockResolvedValue("auth-event-1");
  window.history.replaceState({}, "", "/");
});

describe("profileNeedsOnboarding (pure helper)", () => {
  it("returns false for null", () => {
    expect(profileNeedsOnboarding(null)).toBe(false);
  });

  it("returns true when participant_type is missing", () => {
    expect(
      profileNeedsOnboarding({ role: "buyer", participant_type: null } as never),
    ).toBe(true);
  });

  it("returns false when role and participant_type align", () => {
    expect(
      profileNeedsOnboarding({ role: "buyer", participant_type: "buyer" } as never),
    ).toBe(false);
  });

  it("returns false for admin profile regardless of participant_type", () => {
    expect(
      profileNeedsOnboarding({ role: "admin", participant_type: null } as never),
    ).toBe(false);
  });

  it("returns true while a role switch is in progress even if role and participant_type still align", () => {
    expect(
      profileNeedsOnboarding({
        role: "seller",
        participant_type: "seller",
        role_switch_in_progress_at: "2026-05-14T10:00:00.000Z",
      } as never),
    ).toBe(true);
  });

  it("does not trust the legacy bio __type marker", () => {
    expect(
      profileNeedsOnboarding({
        role: null,
        participant_type: null,
        bio: "__type:investor",
      } as never),
    ).toBe(true);
  });
});

describe("subscription outage grace", () => {
  const verified = {
    subscribed: true,
    productId: "prod_agent",
    subscriptionEnd: "2099-01-01T00:00:00.000Z",
    source: "billing_state" as const,
    syncStatus: "synced" as const,
    loading: false,
  };

  it("uses one fixed grace boundary and fails closed after it expires", () => {
    const first = unavailableSubscriptionState(verified, 1_000);
    expect(first.staleUntil).toBe(31_000);

    const repeated = unavailableSubscriptionState(first, 10_000);
    expect(repeated.staleUntil).toBe(31_000);

    const expired = unavailableSubscriptionState(repeated, 31_001);
    expect(expired.subscribed).toBe(false);
    expect(expired.staleUntil).toBeUndefined();
  });
});

describe("useAuth() outside provider", () => {
  it("throws a clear error when no AuthProvider is mounted above", () => {
    // Suppress React's console.error so the assertion error is the only output.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(/useAuth must be used within AuthProvider/);
    errSpy.mockRestore();
  });
});

describe("JWT session identity", () => {
  it("reads only a non-empty session_id from a strict three-part JWT payload", () => {
    expect(sessionIdFromAccessToken(jwtWithSessionId("session-a"))).toBe("session-a");
    expect(sessionIdFromAccessToken(jwtWithSessionId("session-b"))).toBe("session-b");
    expect(sessionIdFromAccessToken(jwtWithSessionId(null))).toBeNull();
    expect(sessionIdFromAccessToken("not-a-jwt")).toBeNull();
  });

  it("rejects structurally invalid header or signature segments before trusting the payload", () => {
    const [header, payload, signature] = jwtWithSessionId("session-a").split(".");

    expect(sessionIdFromAccessToken(["A", payload, signature].join("."))).toBeNull();
    expect(sessionIdFromAccessToken([header, payload, "A"].join("."))).toBeNull();
  });
});

describe("AuthProvider initial state and signed-out flow", () => {
  it("starts loading=true and clears it once getSession returns a null session", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(result.current.subscription.subscribed).toBe(false);
  });

  it("clears every user-scoped slice when onAuthStateChange fires with null", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      authStateCallbackHolder.current?.("SIGNED_OUT", null);
    });
    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(result.current.subscription).toMatchObject({
      subscribed: false,
      productId: null,
      subscriptionEnd: null,
      loading: false,
    });
  });
});

describe("AuthProvider signed-in flow", () => {
  it("coalesces getSession and INITIAL_SESSION profile hydration", async () => {
    const startupProfile = deferred<{ data: Record<string, unknown>; error: null }>();
    const startupMemberships = deferred<{ data: Array<Record<string, unknown>>; error: null }>();
    const profileFrom = vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(() => startupProfile.promise),
    }));
    const membershipsFrom = vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => unknown) => startupMemberships.promise.then(resolve),
    }));
    supabaseMock.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "startup-user" } } },
    });
    supabaseMock.from.mockImplementation((table: string) => (
      table === "profiles" ? profileFrom() : membershipsFrom()
    ));

    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(supabaseMock.from).toHaveBeenCalledTimes(2));

    act(() => {
      authStateCallbackHolder.current?.("INITIAL_SESSION", {
        user: { id: "startup-user" },
      });
    });

    expect(supabaseMock.from).toHaveBeenCalledTimes(2);
    expect(profileFrom).toHaveBeenCalledTimes(1);
    expect(membershipsFrom).toHaveBeenCalledTimes(1);
    expect(result.current.profileLoading).toBe(true);

    const privateKey = accountQueryKey("startup-user", "authorization-probe");
    appQueryClient.setQueryData(privateKey, { pending: true });
    await act(async () => {
      startupProfile.resolve({
        data: {
          user_id: "startup-user",
          role: "developer",
          participant_type: "developer",
          is_platform_admin: false,
          investor_mode: false,
          force_pro_access: false,
          subscription_product_id: null,
          role_switch_in_progress_at: null,
          account_status: "active",
        },
        error: null,
      });
      startupMemberships.resolve({
        data: [{ organization_id: "org-startup", role: "admin", status: "active" }],
        error: null,
      });
    });

    await waitFor(() => expect(result.current.profile?.role).toBe("developer"));
    expect(appQueryClient.getQueryData(privateKey)).toBeUndefined();
    expect(result.current.profileLoading).toBe(false);
  });

  it("replaces startup hydration for every non-startup same-user auth event", async () => {
    const reads = Array.from({ length: 4 }, () => ({
      profile: deferred<{ data: Record<string, unknown>; error: null }>(),
      memberships: deferred<{ data: Array<Record<string, unknown>>; error: null }>(),
    }));
    let profileRead = 0;
    let membershipRead = 0;
    supabaseMock.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "event-user" } } },
    });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        const read = reads[profileRead++];
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn(() => read.profile.promise),
        };
      }
      const read = reads[membershipRead++];
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: (resolve: (value: unknown) => unknown) => read.memberships.promise.then(resolve),
      };
    });

    renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(supabaseMock.from).toHaveBeenCalledTimes(2));
    let expectedCalls = 2;
    for (const event of ["TOKEN_REFRESHED", "USER_UPDATED", "PASSWORD_RECOVERY"]) {
      expectedCalls += 2;
      act(() => {
        authStateCallbackHolder.current?.(event, { user: { id: "event-user" } });
      });
      await waitFor(() => expect(supabaseMock.from).toHaveBeenCalledTimes(expectedCalls));
    }
    expect(profileRead).toBe(4);
    expect(membershipRead).toBe(4);
  });

  it("clears a synchronously failed startup fetch instead of retaining its rejected slot", async () => {
    supabaseMock.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "sync-throw-user" } } },
    });
    supabaseMock.from.mockImplementationOnce(() => {
      throw new Error("synchronous profiles construction failure");
    });

    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.profileLoading).toBe(false));
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);

    const recoveredProfile = deferred<{ data: Record<string, unknown>; error: null }>();
    const recoveredMemberships = deferred<{ data: Array<Record<string, unknown>>; error: null }>();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn(() => recoveredProfile.promise),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: (resolve: (value: unknown) => unknown) => recoveredMemberships.promise.then(resolve),
      };
    });
    act(() => {
      authStateCallbackHolder.current?.("INITIAL_SESSION", { user: { id: "sync-throw-user" } });
    });
    await waitFor(() => expect(supabaseMock.from).toHaveBeenCalledTimes(3));
    expect(result.current.profileLoading).toBe(true);
    await act(async () => {
      recoveredProfile.resolve({ data: { user_id: "sync-throw-user", role: "buyer", participant_type: "buyer" }, error: null });
      recoveredMemberships.resolve({ data: [], error: null });
    });
    await waitFor(() => expect(result.current.profile?.user_id).toBe("sync-throw-user"));
  });

  it("does not call global auth signOut when a same-user different validated session arrives before its queue turn", async () => {
    const oldSession = sessionFixture("same-user", "old-session");
    const newSession = sessionFixture("same-user", "new-session");
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: oldSession } });
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.user?.id).toBe("same-user"));

    let signOut!: Promise<void>;
    act(() => {
      signOut = result.current.signOut();
      authStateCallbackHolder.current?.("SIGNED_IN", newSession);
    });
    await act(async () => {
      await signOut;
    });

    expect(supabaseMock.auth.signOut).not.toHaveBeenCalled();
    expect(result.current.user?.id).toBe("same-user");
    expect(result.current.session?.access_token).toBe(newSession.access_token);
  });

  it("continues global logout for TOKEN_REFRESHED with the same JWT session_id", async () => {
    const session = sessionFixture("token-user", "stable-session", "before");
    const rotatedSession = sessionFixture("token-user", "stable-session", "after");
    const releaseSignOut = deferred<{ error: null }>();
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session } });
    supabaseMock.auth.signOut.mockImplementationOnce(async () => {
      await releaseSignOut.promise;
      authStateCallbackHolder.current?.("SIGNED_OUT", null);
      return { error: null };
    });
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.user?.id).toBe("token-user"));

    let signOut!: Promise<void>;
    act(() => {
      signOut = result.current.signOut();
    });
    await waitFor(() => expect(supabaseMock.auth.signOut).toHaveBeenCalledWith());
    act(() => {
      authStateCallbackHolder.current?.("TOKEN_REFRESHED", rotatedSession);
    });
    expect(result.current.session?.access_token).toBe(session.access_token);
    expect(result.current.profile).toBeNull();
    await act(async () => {
      releaseSignOut.resolve({ error: null });
      await signOut;
    });

    expect(supabaseMock.auth.signOut).toHaveBeenCalledWith();
    expect(result.current.user).toBeNull();
  });

  it("continues global logout for redundant SIGNED_IN with the same JWT session_id", async () => {
    const session = sessionFixture("redundant-user", "redundant-session");
    const redundantSession = sessionFixture("redundant-user", "redundant-session", "rotated");
    const releaseSignOut = deferred<{ error: null }>();
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session } });
    supabaseMock.auth.signOut.mockImplementationOnce(async () => {
      await releaseSignOut.promise;
      authStateCallbackHolder.current?.("SIGNED_OUT", null);
      return { error: null };
    });
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.user?.id).toBe("redundant-user"));

    let signOut!: Promise<void>;
    act(() => {
      signOut = result.current.signOut();
    });
    await waitFor(() => expect(supabaseMock.auth.signOut).toHaveBeenCalledWith());
    act(() => {
      authStateCallbackHolder.current?.("SIGNED_IN", redundantSession);
    });
    expect(result.current.session?.access_token).toBe(session.access_token);
    expect(result.current.profile).toBeNull();
    await act(async () => {
      releaseSignOut.resolve({ error: null });
      await signOut;
    });

    expect(supabaseMock.auth.signOut).toHaveBeenCalledWith();
    expect(result.current.user).toBeNull();
  });

  it("continues global logout after explicit profile refresh", async () => {
    const session = sessionFixture("refresh-during-signout", "refresh-session");
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session } });
    supabaseMock.auth.signOut.mockImplementationOnce(async () => {
      authStateCallbackHolder.current?.("SIGNED_OUT", null);
      return { error: null };
    });
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.user?.id).toBe("refresh-during-signout"));
    const refresh = result.current.refreshProfile;

    let signOut!: Promise<void>;
    act(() => {
      signOut = result.current.signOut();
    });
    await act(async () => {
      await refresh();
      await signOut;
    });

    expect(supabaseMock.auth.signOut).toHaveBeenCalledWith();
    expect(result.current.user).toBeNull();
  });

  it("continues global logout after realtime authorization refresh", async () => {
    const session = sessionFixture("realtime-during-signout", "realtime-session");
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session } });
    supabaseMock.auth.signOut.mockImplementationOnce(async () => {
      authStateCallbackHolder.current?.("SIGNED_OUT", null);
      return { error: null };
    });
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.user?.id).toBe("realtime-during-signout"));
    await waitFor(() => expect(realtimeCallbacks.some(({ table }) => table === "profiles")).toBe(true));
    const profileCallback = realtimeCallbacks.find(({ table }) => table === "profiles")?.callback;
    expect(profileCallback).toBeDefined();

    let signOut!: Promise<void>;
    act(() => {
      signOut = result.current.signOut();
      profileCallback?.();
    });
    await act(async () => {
      await signOut;
    });

    expect(supabaseMock.auth.signOut).toHaveBeenCalledWith();
    expect(result.current.user).toBeNull();
  });

  it("continues global logout for malformed or missing session_id and never restores it", async () => {
    const missingSessionId = sessionFixture("ambiguous-user", null);
    const malformedSessionId = sessionFixture(
      "ambiguous-user",
      null,
      "malformed",
      "not-a-jwt",
    );
    const releaseSignOut = deferred<{ error: null }>();
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: missingSessionId } });
    supabaseMock.auth.signOut.mockImplementationOnce(async () => {
      await releaseSignOut.promise;
      authStateCallbackHolder.current?.("SIGNED_OUT", null);
      return { error: null };
    });
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.user?.id).toBe("ambiguous-user"));

    let signOut!: Promise<void>;
    act(() => {
      signOut = result.current.signOut();
    });
    await waitFor(() => expect(supabaseMock.auth.signOut).toHaveBeenCalledWith());
    act(() => {
      authStateCallbackHolder.current?.("SIGNED_IN", malformedSessionId);
    });
    expect(result.current.session?.access_token).toBe(missingSessionId.access_token);
    expect(result.current.profile).toBeNull();
    await act(async () => {
      releaseSignOut.resolve({ error: null });
      await signOut;
    });

    expect(supabaseMock.auth.signOut).toHaveBeenCalledWith();
    expect(supabaseMock.auth.setSession).not.toHaveBeenCalled();
    expect(result.current.user).toBeNull();
  });

  it("starts the auth mutation while sign-out telemetry is still pending", async () => {
    const session = sessionFixture("telemetry-user", "telemetry-session");
    const telemetry = deferred<string>();
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session } });
    supabaseMock.auth.signOut.mockImplementationOnce(async () => {
      authStateCallbackHolder.current?.("SIGNED_OUT", null);
      return { error: null };
    });
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.user?.id).toBe("telemetry-user"));
    authActivityMock.recordUserAuthActivity.mockReset();
    authActivityMock.recordUserAuthActivity.mockImplementation(() => telemetry.promise);

    let signOut!: Promise<void>;
    act(() => {
      signOut = result.current.signOut();
    });
    await waitFor(() => expect(supabaseMock.auth.signOut).toHaveBeenCalledWith());
    await act(async () => {
      await signOut;
      telemetry.resolve("telemetry-complete");
    });

    expect(result.current.user).toBeNull();
  });

  it("serializes a Context signIn behind the real global signOut callback", async () => {
    const oldSession = sessionFixture("serialized-old", "serialized-old-session");
    const newSession = sessionFixture("serialized-new", "serialized-new-session");
    const releaseSignOut = deferred<{ error: null }>();
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: oldSession } });
    supabaseMock.auth.signOut.mockImplementationOnce(() => releaseSignOut.promise);
    supabaseMock.auth.signInWithPassword.mockImplementationOnce(async () => {
      authStateCallbackHolder.current?.("SIGNED_IN", newSession);
      return { error: null };
    });
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.user?.id).toBe("serialized-old"));

    let signOut!: Promise<void>;
    let signIn!: Promise<{ error: Error | null }>;
    act(() => {
      signOut = result.current.signOut();
    });
    await waitFor(() => expect(supabaseMock.auth.signOut).toHaveBeenCalledWith());
    act(() => {
      signIn = result.current.signIn("new@example.test", "password");
    });
    expect(supabaseMock.auth.signInWithPassword).not.toHaveBeenCalled();

    await act(async () => {
      authStateCallbackHolder.current?.("SIGNED_OUT", null);
      releaseSignOut.resolve({ error: null });
      await signOut;
    });
    await waitFor(() => expect(supabaseMock.auth.signInWithPassword).toHaveBeenCalledTimes(1));
    await act(async () => {
      expect((await signIn).error).toBeNull();
    });

    expect(result.current.user?.id).toBe("serialized-new");
  });

  it("recovers a validated external session after the real global SIGNED_OUT callback", async () => {
    const oldSession = sessionFixture("recovery-old", "recovery-old-session");
    const externalSession = sessionFixture("recovery-new", "recovery-new-session");
    const releaseSignedOut = deferred<void>();
    const externalProfile = {
      user_id: "recovery-new",
      display_name: "Recovered external session",
      role: "developer",
      participant_type: "developer",
      is_platform_admin: false,
      investor_mode: false,
      force_pro_access: false,
      subscription_product_id: null,
      role_switch_in_progress_at: null,
      account_status: "active",
    };
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: oldSession } });
    supabaseMock.from.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: table === "profiles" ? externalProfile : null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
    }));
    supabaseMock.auth.signOut.mockImplementationOnce(async () => {
      await releaseSignedOut.promise;
      authStateCallbackHolder.current?.("SIGNED_OUT", null);
      return { error: null };
    });
    supabaseMock.auth.setSession.mockImplementationOnce(async ({ access_token, refresh_token }) => {
      expect(access_token).toBe(externalSession.access_token);
      expect(refresh_token).toBe(externalSession.refresh_token);
      authStateCallbackHolder.current?.("SIGNED_IN", externalSession);
      return { data: { user: externalSession.user, session: externalSession }, error: null };
    });
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.user?.id).toBe("recovery-old"));

    let signOut!: Promise<void>;
    act(() => {
      signOut = result.current.signOut();
    });
    await waitFor(() => expect(supabaseMock.auth.signOut).toHaveBeenCalledWith());
    act(() => {
      authStateCallbackHolder.current?.("SIGNED_IN", externalSession);
    });
    expect(result.current.user?.id).toBe("recovery-old");
    expect(result.current.session?.access_token).toBe(oldSession.access_token);
    expect(result.current.profile).toBeNull();
    await act(async () => {
      releaseSignedOut.resolve();
      await signOut;
    });
    await waitFor(() => expect(result.current.profile?.display_name).toBe("Recovered external session"));
    const externalFingerprintKey = authorizationQueryKey(
      "recovery-new",
      buildAuthorizationFingerprint(externalProfile as never, []),
      "external-session-recovery",
    );
    appQueryClient.setQueryData(externalFingerprintKey, { preserved: true });

    expect(supabaseMock.auth.setSession).toHaveBeenCalledTimes(1);
    expect(result.current.user?.id).toBe("recovery-new");
    expect(result.current.profileLoading).toBe(false);
    expect(appQueryClient.getQueryData(externalFingerprintKey)).toEqual({ preserved: true });
  });

  it("restores the latest external session when an older restore callback arrives afterward", async () => {
    const oldSession = sessionFixture("restore-race-old", "restore-race-old-session");
    const candidateC = sessionFixture("restore-race-c", "restore-race-c-session");
    const candidateD = sessionFixture("restore-race-d", "restore-race-d-session");
    const releaseSignedOut = deferred<void>();
    const candidateCStarted = deferred<void>();
    const releaseCandidateC = deferred<void>();
    const profileForUser = {
      "restore-race-c": {
        user_id: "restore-race-c",
        role: "buyer",
        participant_type: "buyer",
      },
      "restore-race-d": {
        user_id: "restore-race-d",
        role: "developer",
        participant_type: "developer",
      },
    };
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: oldSession } });
    supabaseMock.from.mockImplementation((table: string) => {
      let requestedUserId: string | null = null;
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((column: string, value: string) => {
          if (column === "user_id") requestedUserId = value;
          return query;
        }),
        single: vi.fn(() => Promise.resolve({
          data: table === "profiles" && requestedUserId
            ? profileForUser[requestedUserId as keyof typeof profileForUser] ?? null
            : null,
          error: null,
        })),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return query;
    });
    supabaseMock.auth.signOut.mockImplementationOnce(async () => {
      await releaseSignedOut.promise;
      authStateCallbackHolder.current?.("SIGNED_OUT", null);
      return { error: null };
    });
    supabaseMock.auth.setSession.mockImplementation(async ({ access_token, refresh_token }) => {
      if (access_token === candidateC.access_token) {
        expect(refresh_token).toBe(candidateC.refresh_token);
        candidateCStarted.resolve();
        await releaseCandidateC.promise;
        authStateCallbackHolder.current?.("SIGNED_IN", candidateC);
        return { data: { user: candidateC.user, session: candidateC }, error: null };
      }
      expect(access_token).toBe(candidateD.access_token);
      expect(refresh_token).toBe(candidateD.refresh_token);
      authStateCallbackHolder.current?.("SIGNED_IN", candidateD);
      return { data: { user: candidateD.user, session: candidateD }, error: null };
    });
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.user?.id).toBe("restore-race-old"));

    let signOut!: Promise<void>;
    act(() => {
      signOut = result.current.signOut();
    });
    await waitFor(() => expect(supabaseMock.auth.signOut).toHaveBeenCalledWith());
    act(() => {
      authStateCallbackHolder.current?.("SIGNED_IN", candidateC);
    });
    await act(async () => {
      releaseSignedOut.resolve();
      await candidateCStarted.promise;
    });
    act(() => {
      authStateCallbackHolder.current?.("SIGNED_IN", candidateD);
    });
    await act(async () => {
      releaseCandidateC.resolve();
      await signOut;
    });

    await waitFor(() => expect(result.current.profile?.user_id).toBe("restore-race-d"));
    expect(supabaseMock.auth.setSession).toHaveBeenNthCalledWith(1, {
      access_token: candidateC.access_token,
      refresh_token: candidateC.refresh_token,
    });
    expect(supabaseMock.auth.setSession).toHaveBeenNthCalledWith(2, {
      access_token: candidateD.access_token,
      refresh_token: candidateD.refresh_token,
    });
    expect(result.current.user?.id).toBe("restore-race-d");
    expect(result.current.session?.access_token).toBe(candidateD.access_token);
    expect(result.current.profileLoading).toBe(false);
  });

  it("leaves the app signed out when external session restoration returns an error", async () => {
    const oldSession = sessionFixture("restore-error-old", "restore-error-old-session");
    const externalSession = sessionFixture("restore-error-new", "restore-error-new-session");
    const releaseSignedOut = deferred<void>();
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: oldSession } });
    supabaseMock.auth.signOut.mockImplementationOnce(async () => {
      await releaseSignedOut.promise;
      authStateCallbackHolder.current?.("SIGNED_OUT", null);
      return { error: null };
    });
    supabaseMock.auth.setSession.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: new Error("restore failed"),
    });
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.user?.id).toBe("restore-error-old"));

    let signOut!: Promise<void>;
    act(() => {
      signOut = result.current.signOut();
    });
    await waitFor(() => expect(supabaseMock.auth.signOut).toHaveBeenCalledWith());
    act(() => {
      authStateCallbackHolder.current?.("SIGNED_IN", externalSession);
    });
    await act(async () => {
      releaseSignedOut.resolve();
      await signOut;
    });

    expect(supabaseMock.auth.setSession).toHaveBeenCalledTimes(1);
    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(result.current.profileLoading).toBe(false);
  });

  it("keeps zero-argument global logout scope", async () => {
    const session = sessionFixture("global-scope-user", "global-scope-session");
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session } });
    supabaseMock.auth.signOut.mockImplementationOnce(async () => {
      authStateCallbackHolder.current?.("SIGNED_OUT", null);
      return { error: null };
    });
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.user?.id).toBe("global-scope-user"));

    await act(async () => {
      await result.current.signOut();
    });

    expect(supabaseMock.auth.signOut).toHaveBeenCalledWith();
  });

  it("replaces startup hydration from updateProfile and realtime authorization refreshes", async () => {
    const reads = Array.from({ length: 3 }, () => ({
      profile: deferred<{ data: Record<string, unknown>; error: null }>(),
      memberships: deferred<{ data: Array<Record<string, unknown>>; error: null }>(),
    }));
    let profileRead = 0;
    let membershipRead = 0;
    supabaseMock.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "replace-caller-user" } } },
    });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn(() => reads[profileRead++].profile.promise),
          update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: (resolve: (value: unknown) => unknown) => reads[membershipRead++].memberships.promise.then(resolve),
      };
    });

    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(profileRead).toBe(1));
    let update!: Promise<{ error: Error | null }>;
    act(() => {
      update = result.current.updateProfile({ display_name: "Updated" });
    });
    await waitFor(() => expect(profileRead).toBe(2));
    expect(membershipRead).toBe(2);

    const realtimeCallback = realtimeCallbacks.find(({ table }) => table === "profiles")?.callback;
    expect(realtimeCallback).toBeDefined();
    act(() => realtimeCallback?.());
    await waitFor(() => expect(profileRead).toBe(3));
    expect(membershipRead).toBe(3);

    await act(async () => {
      reads[2].profile.resolve({ data: { user_id: "replace-caller-user", role: "developer", participant_type: "developer" }, error: null });
      reads[2].memberships.resolve({ data: [], error: null });
      reads[1].profile.resolve({ data: { user_id: "replace-caller-user", role: "buyer", participant_type: "buyer" }, error: null });
      reads[1].memberships.resolve({ data: [], error: null });
      await update;
    });
  });

  it("does not let a signed-out same-user generation apply a stale profile result", async () => {
    const oldProfile = deferred<{ data: Record<string, unknown>; error: null }>();
    const oldMemberships = deferred<{ data: Array<Record<string, unknown>>; error: null }>();
    const freshProfile = deferred<{ data: Record<string, unknown>; error: null }>();
    const freshMemberships = deferred<{ data: Array<Record<string, unknown>>; error: null }>();
    const profiles = [oldProfile, freshProfile];
    const memberships = [oldMemberships, freshMemberships];
    let profileRead = 0;
    let membershipRead = 0;
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        const read = profiles[profileRead++];
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn(() => read.promise),
        };
      }
      const read = memberships[membershipRead++];
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: (resolve: (value: unknown) => unknown) => read.promise.then(resolve),
      };
    });

    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      authStateCallbackHolder.current?.("SIGNED_IN", { user: { id: "same-user" } });
    });
    await waitFor(() => expect(supabaseMock.from).toHaveBeenCalledTimes(2));

    act(() => {
      authStateCallbackHolder.current?.("SIGNED_OUT", null);
      authStateCallbackHolder.current?.("SIGNED_IN", { user: { id: "same-user" } });
    });
    await waitFor(() => expect(supabaseMock.from).toHaveBeenCalledTimes(4));

    await act(async () => {
      oldProfile.resolve({
        data: { user_id: "same-user", role: "buyer", participant_type: "buyer" },
        error: null,
      });
      oldMemberships.resolve({ data: [], error: null });
    });
    expect(result.current.profile).toBeNull();
    expect(result.current.profileLoading).toBe(true);

    await act(async () => {
      freshProfile.resolve({
        data: { user_id: "same-user", role: "developer", participant_type: "developer" },
        error: null,
      });
      freshMemberships.resolve({ data: [], error: null });
    });
    await waitFor(() => expect(result.current.profile?.role).toBe("developer"));
    expect(result.current.profileLoading).toBe(false);
  });

  it("does not let a different-user generation apply a stale profile result", async () => {
    const oldProfile = deferred<{ data: Record<string, unknown>; error: null }>();
    const oldMemberships = deferred<{ data: Array<Record<string, unknown>>; error: null }>();
    const freshProfile = deferred<{ data: Record<string, unknown>; error: null }>();
    const freshMemberships = deferred<{ data: Array<Record<string, unknown>>; error: null }>();
    const profiles = [oldProfile, freshProfile];
    const memberships = [oldMemberships, freshMemberships];
    let profileRead = 0;
    let membershipRead = 0;
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        const read = profiles[profileRead++];
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn(() => read.promise) };
      }
      const read = memberships[membershipRead++];
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), then: (resolve: (value: unknown) => unknown) => read.promise.then(resolve) };
    });

    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      authStateCallbackHolder.current?.("SIGNED_IN", { user: { id: "user-a" } });
    });
    await waitFor(() => expect(supabaseMock.from).toHaveBeenCalledTimes(2));
    act(() => {
      authStateCallbackHolder.current?.("SIGNED_IN", { user: { id: "user-b" } });
    });
    await waitFor(() => expect(supabaseMock.from).toHaveBeenCalledTimes(4));

    await act(async () => {
      freshProfile.resolve({ data: { user_id: "user-b", role: "developer", participant_type: "developer" }, error: null });
      freshMemberships.resolve({ data: [], error: null });
    });
    await waitFor(() => expect(result.current.profile?.user_id).toBe("user-b"));
    await act(async () => {
      oldProfile.resolve({ data: { user_id: "user-a", role: "buyer", participant_type: "buyer" }, error: null });
      oldMemberships.resolve({ data: [], error: null });
    });
    expect(result.current.profile?.user_id).toBe("user-b");
  });

  it("preserves the fresh authorization fingerprint cache after a stale generation resolves", async () => {
    const oldProfile = deferred<{ data: Record<string, unknown>; error: null }>();
    const oldMemberships = deferred<{ data: Array<Record<string, unknown>>; error: null }>();
    const freshProfile = deferred<{ data: Record<string, unknown>; error: null }>();
    const freshMemberships = deferred<{ data: Array<Record<string, unknown>>; error: null }>();
    const profiles = [oldProfile, freshProfile];
    const memberships = [oldMemberships, freshMemberships];
    let profileRead = 0;
    let membershipRead = 0;
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        const read = profiles[profileRead++];
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn(() => read.promise) };
      }
      const read = memberships[membershipRead++];
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), then: (resolve: (value: unknown) => unknown) => read.promise.then(resolve) };
    });

    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => authStateCallbackHolder.current?.("SIGNED_IN", { user: { id: "fingerprint-user" } }));
    await waitFor(() => expect(supabaseMock.from).toHaveBeenCalledTimes(2));
    act(() => authStateCallbackHolder.current?.("SIGNED_IN", { user: { id: "fingerprint-user" } }));
    await waitFor(() => expect(supabaseMock.from).toHaveBeenCalledTimes(4));

    const seedKey = accountQueryKey("fingerprint-user", "before-fresh-fingerprint");
    appQueryClient.setQueryData(seedKey, { shouldBeInvalidated: true });
    const freshProfileData = {
      user_id: "fingerprint-user",
      role: "developer",
      participant_type: "developer",
      is_platform_admin: false,
      investor_mode: false,
      force_pro_access: false,
      subscription_product_id: null,
      role_switch_in_progress_at: null,
      account_status: "active",
    };
    const freshMembershipData = [{ organization_id: "org-fresh", role: "admin", status: "active" }];
    await act(async () => {
      freshProfile.resolve({ data: freshProfileData, error: null });
      freshMemberships.resolve({ data: freshMembershipData, error: null });
    });
    await waitFor(() => expect(result.current.profile?.role).toBe("developer"));
    expect(appQueryClient.getQueryData(seedKey)).toBeUndefined();

    const freshFingerprint = buildAuthorizationFingerprint(
      freshProfileData as never,
      freshMembershipData as never,
    );
    const freshFingerprintKey = authorizationQueryKey(
      "fingerprint-user",
      freshFingerprint,
      "permissions",
    );
    appQueryClient.setQueryData(freshFingerprintKey, { exactFingerprint: freshFingerprint });
    await act(async () => {
      oldProfile.resolve({ data: { user_id: "fingerprint-user", role: "buyer", participant_type: "buyer" }, error: null });
      oldMemberships.resolve({ data: [], error: null });
    });
    expect(appQueryClient.getQueryData(freshFingerprintKey)).toEqual({
      exactFingerprint: freshFingerprint,
    });
  });

  it("replaces startup profile hydration when refreshProfile is explicit", async () => {
    const startupProfile = deferred<{ data: Record<string, unknown>; error: null }>();
    const startupMemberships = deferred<{ data: Array<Record<string, unknown>>; error: null }>();
    const refreshedProfile = deferred<{ data: Record<string, unknown>; error: null }>();
    const refreshedMemberships = deferred<{ data: Array<Record<string, unknown>>; error: null }>();
    const profiles = [startupProfile, refreshedProfile];
    const memberships = [startupMemberships, refreshedMemberships];
    let profileRead = 0;
    let membershipRead = 0;
    supabaseMock.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "refresh-user" } } },
    });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        const read = profiles[profileRead++];
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn(() => read.promise) };
      }
      const read = memberships[membershipRead++];
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), then: (resolve: (value: unknown) => unknown) => read.promise.then(resolve) };
    });

    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(supabaseMock.from).toHaveBeenCalledTimes(2));
    let refresh!: Promise<void>;
    act(() => {
      refresh = result.current.refreshProfile();
    });
    await waitFor(() => expect(supabaseMock.from).toHaveBeenCalledTimes(4));

    await act(async () => {
      startupProfile.resolve({ data: { user_id: "refresh-user", role: "buyer", participant_type: "buyer" }, error: null });
      startupMemberships.resolve({ data: [], error: null });
    });
    expect(result.current.profile).toBeNull();
    expect(result.current.profileLoading).toBe(true);

    await act(async () => {
      refreshedProfile.resolve({ data: { user_id: "refresh-user", role: "developer", participant_type: "developer" }, error: null });
      refreshedMemberships.resolve({ data: [], error: null });
      await refresh;
    });
    expect(result.current.profile?.role).toBe("developer");
    expect(result.current.profileLoading).toBe(false);
  });

  it("does not let a delayed initial session overwrite a newer auth event", async () => {
    let finishInitialSession!: (value: {
      data: { session: { user: { id: string } } };
    }) => void;
    supabaseMock.auth.getSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishInitialSession = resolve;
        }),
    );

    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await act(async () => {
      authStateCallbackHolder.current?.("SIGNED_IN", {
        user: { id: "newer-user" },
      });
    });
    await waitFor(() => expect(result.current.user?.id).toBe("newer-user"));

    await act(async () => {
      finishInitialSession({
        data: { session: { user: { id: "stale-initial-user" } } },
      });
    });

    expect(result.current.user?.id).toBe("newer-user");
  });

  it("ignores a delayed session restore after the provider unmounts", async () => {
    let finishInitialSession!: (value: {
      data: { session: { user: { id: string } } };
    }) => void;
    supabaseMock.auth.getSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishInitialSession = resolve;
        }),
    );
    const privateKey = accountQueryKey("active-user", "billing-info");
    appQueryClient.setQueryData(privateKey, { invoices: ["invoice-a"] });

    const { unmount } = renderHook(() => useAuth(), { wrapper: wrap });
    unmount();
    await act(async () => {
      finishInitialSession({
        data: { session: { user: { id: "stale-unmounted-user" } } },
      });
      await Promise.resolve();
    });

    expect(appQueryClient.getQueryData(privateKey)).toEqual({
      invoices: ["invoice-a"],
    });
  });

  it("purges the previous account cache before exposing a new user", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      authStateCallbackHolder.current?.("SIGNED_IN", {
        user: { id: "account-a", email: "a@example.com" },
      });
    });
    await waitFor(() => expect(result.current.user?.id).toBe("account-a"));

    const publicKey = ["homepage-featured"] as const;
    const privateKey = accountQueryKey("account-a", "billing-info");
    appQueryClient.setQueryData(publicKey, ["listing-a"]);
    appQueryClient.setQueryData(privateKey, { invoices: ["invoice-a"] });

    await act(async () => {
      authStateCallbackHolder.current?.("SIGNED_IN", {
        user: { id: "account-b", email: "b@example.com" },
      });
    });

    expect(appQueryClient.getQueryData(privateKey)).toBeUndefined();
    expect(appQueryClient.getQueryData(publicKey)).toEqual(["listing-a"]);
    expect(result.current.user?.id).toBe("account-b");
  });

  it("purges private cache when the current user's role changes", async () => {
    let role = "buyer";
    const memberships: Array<{
      organization_id: string;
      role: string;
      status: string;
      updated_at: string;
    }> = [];
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockImplementation(async () => ({
            data: {
              user_id: "same-user",
              role,
              participant_type: role,
              is_platform_admin: false,
              investor_mode: false,
              force_pro_access: false,
              subscription_product_id: null,
              role_switch_in_progress_at: null,
              account_status: "active",
            },
            error: null,
          })),
        };
      }
      const membershipQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(resolve({ data: memberships, error: null }));
        },
      };
      return membershipQuery;
    });

    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      authStateCallbackHolder.current?.("SIGNED_IN", {
        user: { id: "same-user" },
      });
    });
    await waitFor(() => expect(result.current.profile?.role).toBe("buyer"));

    const publicKey = ["homepage-featured"] as const;
    const privateKey = accountQueryKey("same-user", "projects");
    appQueryClient.setQueryData(publicKey, ["listing-a"]);
    appQueryClient.setQueryData(privateKey, ["project-a"]);
    role = "developer";

    await act(async () => {
      await result.current.refreshProfile();
    });

    expect(appQueryClient.getQueryData(privateKey)).toBeUndefined();
    expect(appQueryClient.getQueryData(publicKey)).toEqual(["listing-a"]);
    expect(result.current.profile?.role).toBe("developer");
  });

  it("purges private cache when current organization membership changes", async () => {
    const memberships = [{
      organization_id: "org-a",
      role: "member",
      status: "active",
      updated_at: "2026-07-26T10:00:00Z",
    }];
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              user_id: "org-user",
              role: "developer",
              participant_type: "developer",
              is_platform_admin: false,
              investor_mode: false,
              force_pro_access: false,
              subscription_product_id: null,
              role_switch_in_progress_at: null,
              account_status: "active",
            },
            error: null,
          }),
        };
      }
      const membershipQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(resolve({ data: [...memberships], error: null }));
        },
      };
      return membershipQuery;
    });

    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      authStateCallbackHolder.current?.("SIGNED_IN", {
        user: { id: "org-user" },
      });
    });
    await waitFor(() => expect(result.current.profile?.role).toBe("developer"));

    const privateKey = accountQueryKey("org-user", "projects");
    appQueryClient.setQueryData(privateKey, ["project-a"]);
    memberships[0] = {
      ...memberships[0],
      role: "admin",
      updated_at: "2026-07-26T10:05:00Z",
    };

    const membershipCallback = realtimeCallbacks.find(
      ({ table }) => table === "organization_memberships",
    )?.callback;
    expect(membershipCallback).toBeDefined();
    await act(async () => {
      membershipCallback?.();
    });

    await waitFor(() =>
      expect(appQueryClient.getQueryData(privateKey)).toBeUndefined(),
    );
  });

  it("hydrates user/profile and probes the subscription edge function on SIGNED_IN", async () => {
    // Profile fetch — the chain ends in `.single()` returning the row.
    const selectMock = vi.fn().mockReturnThis();
    const profileRow = {
      user_id: "u-1",
      role: "buyer",
      participant_type: "buyer",
      display_name: "Alice",
      video_link: "https://video.example/alice",
    };
    supabaseMock.from.mockReturnValue({
      select: selectMock,
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: profileRow, error: null }),
    });
    supabaseMock.functions.invoke.mockResolvedValue({
      data: {
        subscribed: true,
        product_id: "prod_pro",
        subscription_end: "2027-01-01",
        status: "active",
      },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      authStateCallbackHolder.current?.("SIGNED_IN", {
        user: { id: "u-1", email: "alice@example.com" },
      });
    });
    await waitFor(() => expect(result.current.user?.id).toBe("u-1"));
    await waitFor(() => expect(result.current.profile?.user_id).toBe("u-1"));
    expect(selectMock).toHaveBeenCalledWith("*");
    expect(result.current.profile?.video_link).toBe("https://video.example/alice");
    await waitFor(() => expect(result.current.subscription.subscribed).toBe(true));
    expect(result.current.subscription).toMatchObject({
      productId: "prod_pro",
      subscriptionEnd: "2027-01-01",
      billingStatus: "active",
    });
    expect(result.current.needsOnboarding).toBe(false);
    await waitFor(() =>
      expect(authActivityMock.recordUserAuthActivity).toHaveBeenCalledWith(expect.objectContaining({
        eventType: "sign_in",
        metadata: expect.objectContaining({ source: "on_auth_state_change" }),
      })),
    );
  });

  it("surfaces needsOnboarding=true when the profile lacks an aligned participant_type", async () => {
    supabaseMock.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { user_id: "u-2", role: "buyer", participant_type: null },
        error: null,
      }),
    });
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      authStateCallbackHolder.current?.("SIGNED_IN", { user: { id: "u-2" } });
    });
    await waitFor(() => expect(result.current.profile?.user_id).toBe("u-2"));
    expect(result.current.needsOnboarding).toBe(true);
  });

  it("does not flip subscription.subscribed when check-subscription errors", async () => {
    supabaseMock.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    supabaseMock.functions.invoke.mockResolvedValue({
      data: null,
      error: new Error("503"),
    });
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      authStateCallbackHolder.current?.("SIGNED_IN", { user: { id: "u-3" } });
    });
    // Subscription stays at default after the failed probe.
    await waitFor(() => expect(result.current.subscription.loading).toBe(false));
    expect(result.current.subscription.subscribed).toBe(false);
  });

  it("retries a transient subscription failure with bounded backoff", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    supabaseMock.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "u-retry" } } },
    });
    supabaseMock.functions.invoke
      .mockResolvedValueOnce({ data: null, error: new Error("503") })
      .mockResolvedValueOnce({
        data: {
          subscribed: true,
          product_id: "prod_agent",
          subscription_end: "2099-01-01T00:00:00.000Z",
          source: "billing_state",
          sync_status: "synced",
          status: "active",
        },
        error: null,
      });

    try {
      const { result } = renderHook(() => useAuth(), { wrapper: wrap });
      await waitFor(() => expect(supabaseMock.functions.invoke).toHaveBeenCalledTimes(1));
      expect(result.current.subscription.syncStatus).toBe("timeout");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });

      await waitFor(() => expect(supabaseMock.functions.invoke).toHaveBeenCalledTimes(2));
      expect(result.current.subscription).toMatchObject({
        subscribed: true,
        productId: "prod_agent",
        source: "billing_state",
        syncStatus: "synced",
        loading: false,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("AuthProvider auth API methods", () => {
  it("signIn delegates to supabase.auth.signInWithPassword", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      const r = await result.current.signIn("a@b.com", "pw");
      expect(r.error).toBeNull();
    });
    expect(supabaseMock.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "a@b.com",
      password: "pw",
    });
  });

  it("signUp returns needsEmailConfirm=true when there's a user but no session", async () => {
    supabaseMock.auth.signUp.mockResolvedValue({
      data: { user: { id: "new-u" }, session: null },
      error: null,
    });
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let outcome!: { error: Error | null; needsEmailConfirm: boolean };
    await act(async () => {
      outcome = await result.current.signUp("new@x.com", "ValidPass1!@#", {
        full_name: "New User",
        phone: "phone-redacted",
      });
    });
    expect(outcome.error).toBeNull();
    expect(outcome.needsEmailConfirm).toBe(true);
  });

  describe("signUp password policy (go-live audit FINDING-1)", () => {
    const meta = { full_name: "New User", phone: "phone-redacted" };

    async function signUpWith(password: string) {
      const { result } = renderHook(() => useAuth(), { wrapper: wrap });
      await waitFor(() => expect(result.current.loading).toBe(false));
      let outcome!: { error: Error | null; needsEmailConfirm: boolean };
      await act(async () => {
        outcome = await result.current.signUp("new@x.com", password, meta);
      });
      return outcome;
    }

    it("rejects passwords shorter than 8 characters", async () => {
      const outcome = await signUpWith("Shrt1!");
      expect(outcome.error?.message).toMatch(/at least 8 characters/i);
      expect(outcome.needsEmailConfirm).toBe(false);
      expect(supabaseMock.auth.signUp).not.toHaveBeenCalled();
    });

    it("rejects passwords without uppercase letters", async () => {
      const outcome = await signUpWith("alllowercase1!");
      expect(outcome.error?.message).toMatch(/uppercase/i);
      expect(supabaseMock.auth.signUp).not.toHaveBeenCalled();
    });

    it("rejects passwords without lowercase letters", async () => {
      const outcome = await signUpWith("ALLUPPERCASE1!");
      expect(outcome.error?.message).toMatch(/lowercase/i);
      expect(supabaseMock.auth.signUp).not.toHaveBeenCalled();
    });

    it("rejects passwords without numbers", async () => {
      const outcome = await signUpWith("NoDigitsHere!@");
      expect(outcome.error?.message).toMatch(/number/i);
      expect(supabaseMock.auth.signUp).not.toHaveBeenCalled();
    });

    it("rejects passwords without special characters", async () => {
      const outcome = await signUpWith("NoSpecials1234");
      expect(outcome.error?.message).toMatch(/special/i);
      expect(supabaseMock.auth.signUp).not.toHaveBeenCalled();
    });

    it("accepts passwords that satisfy every rule", async () => {
      supabaseMock.auth.signUp.mockResolvedValue({
        data: { user: { id: "new-u" }, session: null },
        error: null,
      });
      const outcome = await signUpWith("ValidPass1!@#");
      expect(outcome.error).toBeNull();
      expect(supabaseMock.auth.signUp).toHaveBeenCalled();
    });
  });

  it("signOut clears local profile + subscription", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.signOut();
    });
    expect(authActivityMock.recordUserAuthActivity).toHaveBeenCalledWith({
      eventType: "sign_out",
      metadata: { source: "sign_out" },
    });
    expect(supabaseMock.auth.signOut).toHaveBeenCalled();
    expect(result.current.profile).toBeNull();
    expect(result.current.subscription.subscribed).toBe(false);
  });

  it("updateProfile returns an error when no user is signed in", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let outcome!: { error: Error | null };
    await act(async () => {
      outcome = await result.current.updateProfile({ display_name: "x" });
    });
    expect(outcome.error).toBeInstanceOf(Error);
    expect(outcome.error?.message).toMatch(/Not authenticated/);
  });

  it("updateProfile strips privileged role, participant, and investor access fields from self-service updates", async () => {
    const updateSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    supabaseMock.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: updateSpy,
      single: vi.fn().mockResolvedValue({
        data: { user_id: "u-10", role: "buyer", participant_type: "buyer" },
        error: null,
      }),
    });

    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      authStateCallbackHolder.current?.("SIGNED_IN", { user: { id: "u-10" } });
    });
    await waitFor(() => expect(result.current.user?.id).toBe("u-10"));

    await act(async () => {
      await result.current.updateProfile({
        display_name: "Alice Updated",
        role: "developer",
        participant_type: "developer",
        investor_mode: true,
      } as never);
    });

    expect(updateSpy).toHaveBeenCalledWith({ display_name: "Alice Updated" });
  });

  it("refreshSubscription re-invokes check-subscription using the current session", async () => {
    // Provide a session via getSession and ensure invoke gets called.
    supabaseMock.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "u-9" } } },
    });
    supabaseMock.functions.invoke.mockResolvedValue({
      data: { subscribed: true, product_id: "prod_x", subscription_end: null },
      error: null,
    });
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    // When getSession returns a session, the provider waits for
    // onAuthStateChange to flip loading to false. Drive that callback
    // explicitly so the rest of the test can proceed.
    await act(async () => {
      authStateCallbackHolder.current?.("INITIAL_SESSION", { user: { id: "u-9" } });
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Wipe the bookkeeping from the SIGNED_IN side-effect so we can assert
    // refreshSubscription specifically calls invoke again.
    supabaseMock.functions.invoke.mockClear();
    await act(async () => {
      await result.current.refreshSubscription();
    });
    expect(supabaseMock.functions.invoke).toHaveBeenCalledWith("check-subscription", {});
  });

  it("refreshSubscription reconciles only the exact checkout-success session", async () => {
    supabaseMock.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "u-checkout" } } },
    });
    supabaseMock.functions.invoke.mockResolvedValue({
      data: {
        subscribed: false,
        product_id: null,
        subscription_end: null,
        source: "investor",
        sync_status: "pending",
      },
      error: null,
    });
    window.history.replaceState(
      {},
      "",
      "/pricing?checkout=success&session_id=cs_test_exact_checkout",
    );

    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await act(async () => {
      authStateCallbackHolder.current?.("INITIAL_SESSION", {
        user: { id: "u-checkout" },
      });
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    supabaseMock.functions.invoke.mockClear();

    await act(async () => {
      await result.current.refreshSubscription();
    });

    expect(supabaseMock.functions.invoke).toHaveBeenCalledWith(
      "check-subscription",
      { body: { checkout_session_id: "cs_test_exact_checkout" } },
    );
    expect(result.current.subscription.syncStatus).toBe("pending");
    expect(result.current.subscription.source).toBe("investor");
  });

  it("returns the same verified exact-session outcome to concurrent callers", async () => {
    const sess = sessionFixture("u-receipt", "session-receipt");
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: sess } });
    supabaseMock.from.mockImplementation((table: string) => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        single: vi.fn().mockResolvedValue({
          data: table === "profiles"
            ? { user_id: "u-receipt", role: "buyer", participant_type: "buyer" }
            : null,
          error: null,
        }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return chain;
    });
    const exact = deferred<{ data: Record<string, unknown>; error: null }>();
    supabaseMock.functions.invoke
      .mockResolvedValueOnce({ data: { subscribed: false, product_id: null, subscription_end: null, source: "database", sync_status: "synced" }, error: null })
      .mockImplementationOnce(() => exact.promise);

    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await act(async () => authStateCallbackHolder.current?.("INITIAL_SESSION", sess));
    await waitFor(() => expect(result.current.profile?.participant_type).toBe("buyer"));

    let first!: ReturnType<typeof result.current.refreshSubscription>;
    let second!: ReturnType<typeof result.current.refreshSubscription>;
    act(() => {
      first = result.current.refreshSubscription("cs_test_verified_receipt");
      second = result.current.refreshSubscription("cs_test_verified_receipt");
    });
    await act(async () => {
      exact.resolve({
        data: {
          subscribed: true,
          product_id: "prod_participant",
          plan_key: "pro",
          audience: "participant",
          status: "active",
          subscription_end: "2099-01-01T00:00:00.000Z",
          source: "billing_state",
          sync_status: "synced",
          verified_checkout: {
            checkout_session_id: "cs_test_verified_receipt",
            user_id: "u-receipt",
            kind: "subscription",
            product_id: "prod_participant",
            plan_key: "pro",
            audience: "participant",
            status: "active",
            subscription_end: "2099-01-01T00:00:00.000Z",
          },
        },
        error: null,
      });
    });
    const [firstOutcome, secondOutcome] = await Promise.all([first, second]);
    expect(firstOutcome).toEqual(secondOutcome);
    expect(firstOutcome).toMatchObject({
      status: "verified",
      checkoutSessionId: "cs_test_verified_receipt",
      userId: "u-receipt",
      receipt: { kind: "subscription", status: "active" },
    });
    const exactCalls = supabaseMock.functions.invoke.mock.calls.filter(
      ([, options]) => (options as { body?: { checkout_session_id?: string } } | undefined)?.body?.checkout_session_id === "cs_test_verified_receipt",
    );
    expect(exactCalls).toHaveLength(1);
  });

  it("keeps an old service response without an exact receipt pending", async () => {
    const sess = sessionFixture("u-old-service", "session-old-service");
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: sess } });
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await act(async () => authStateCallbackHolder.current?.("INITIAL_SESSION", sess));
    await waitFor(() => expect(result.current.loading).toBe(false));
    supabaseMock.functions.invoke.mockResolvedValue({
      data: {
        subscribed: true,
        product_id: "prod_existing",
        subscription_end: "2099-01-01T00:00:00.000Z",
        source: "billing_state",
      },
      error: null,
    });

    let outcome!: Awaited<ReturnType<typeof result.current.refreshSubscription>>;
    await act(async () => {
      outcome = await result.current.refreshSubscription("cs_test_old_service");
    });
    expect(outcome).toEqual({
      status: "pending",
      checkoutSessionId: "cs_test_old_service",
      userId: "u-old-service",
      reason: "receipt_unavailable",
    });
    expect(result.current.subscription.subscribed).toBe(true);
  });

  it("makes an exact checkout outcome stale when the current profile audience changes", async () => {
    const sess = sessionFixture("u-role-change", "session-role-change");
    let currentProfile = {
      user_id: "u-role-change",
      role: "buyer",
      participant_type: "buyer",
    };
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: sess } });
    supabaseMock.from.mockImplementation((table: string) => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        single: vi.fn().mockImplementation(async () => ({
          data: table === "profiles" ? currentProfile : null,
          error: null,
        })),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return chain;
    });
    supabaseMock.functions.invoke.mockResolvedValue({
      data: {
        subscribed: false,
        product_id: null,
        subscription_end: null,
        source: "database",
        sync_status: "synced",
      },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await act(async () => authStateCallbackHolder.current?.("INITIAL_SESSION", sess));
    await waitFor(() => expect(result.current.profile?.participant_type).toBe("buyer"));

    const exact = deferred<{ data: Record<string, unknown>; error: null }>();
    supabaseMock.functions.invoke.mockImplementationOnce(() => exact.promise);
    let outcomePromise!: ReturnType<typeof result.current.refreshSubscription>;
    act(() => {
      outcomePromise = result.current.refreshSubscription("cs_test_role_change");
    });
    await waitFor(() => expect(supabaseMock.functions.invoke).toHaveBeenLastCalledWith(
      "check-subscription",
      { body: { checkout_session_id: "cs_test_role_change" } },
    ));

    currentProfile = {
      user_id: "u-role-change",
      role: "agent",
      participant_type: "agent",
    };
    await act(async () => result.current.refreshProfile());
    await waitFor(() => expect(result.current.profile?.participant_type).toBe("agent"));

    exact.resolve({
      data: {
        subscribed: true,
        product_id: "prod_participant",
        plan_key: "pro",
        audience: "participant",
        status: "active",
        subscription_end: "2099-01-01T00:00:00.000Z",
        source: "billing_state",
        sync_status: "synced",
        verified_checkout: {
          checkout_session_id: "cs_test_role_change",
          user_id: "u-role-change",
          kind: "subscription",
          product_id: "prod_participant",
          plan_key: "pro",
          audience: "participant",
          status: "active",
          subscription_end: "2099-01-01T00:00:00.000Z",
        },
      },
      error: null,
    });
    let outcome!: Awaited<typeof outcomePromise>;
    await act(async () => {
      outcome = await outcomePromise;
    });

    expect(outcome).toEqual({
      status: "stale",
      checkoutSessionId: "cs_test_role_change",
      userId: "u-role-change",
    });
    expect(result.current.subscription.subscribed).toBe(false);
  });

  it("rejects an explicit malformed checkout id without downgrading to an ordinary refresh", async () => {
    const sess = sessionFixture("u-invalid-checkout", "session-invalid-checkout");
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: sess } });
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await act(async () => authStateCallbackHolder.current?.("INITIAL_SESSION", sess));
    await waitFor(() => expect(result.current.loading).toBe(false));
    supabaseMock.functions.invoke.mockClear();

    let outcome!: Awaited<ReturnType<typeof result.current.refreshSubscription>>;
    await act(async () => {
      outcome = await result.current.refreshSubscription("not-a-checkout");
    });
    expect(outcome).toMatchObject({ status: "error", reason: "invalid_checkout_id" });
    expect(supabaseMock.functions.invoke).not.toHaveBeenCalled();
  });

  it("does not reconcile an old checkout session against a newly signed-in account", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      authStateCallbackHolder.current?.("SIGNED_IN", {
        user: { id: "checkout-user-a" },
      });
    });
    await waitFor(() => expect(result.current.user?.id).toBe("checkout-user-a"));
    supabaseMock.functions.invoke.mockClear();

    let finishRefreshSession!: (value: {
      data: { session: { user: { id: string } } };
    }) => void;
    supabaseMock.auth.getSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRefreshSession = resolve;
        }),
    );

    let refreshPromise!: Promise<void>;
    act(() => {
      refreshPromise = result.current.refreshSubscription(
        "cs_test_checkout_user_a",
      );
    });
    await act(async () => {
      authStateCallbackHolder.current?.("SIGNED_IN", {
        user: { id: "checkout-user-b" },
      });
    });
    await waitFor(() => expect(result.current.user?.id).toBe("checkout-user-b"));

    await act(async () => {
      finishRefreshSession({
        data: { session: { user: { id: "checkout-user-b" } } },
      });
      await refreshPromise;
    });

    expect(supabaseMock.functions.invoke).not.toHaveBeenCalledWith(
      "check-subscription",
      { body: { checkout_session_id: "cs_test_checkout_user_a" } },
    );
  });

  it("reconciles the exact session during an onboarding success restore", async () => {
    supabaseMock.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "u-onboarding-checkout" } } },
    });
    supabaseMock.functions.invoke.mockResolvedValue({
      data: {
        subscribed: true,
        product_id: "prod_professional",
        subscription_end: null,
        source: "stripe",
        sync_status: "synced",
      },
      error: null,
    });
    window.history.replaceState(
      {},
      "",
      "/dashboard?pro=success&session_id=cs_test_onboarding_checkout",
    );

    renderHook(() => useAuth(), { wrapper: wrap });

    await waitFor(() => {
      expect(supabaseMock.functions.invoke).toHaveBeenCalledWith(
        "check-subscription",
        { body: { checkout_session_id: "cs_test_onboarding_checkout" } },
      );
    });
  });

  it("queues exact-session reconciliation behind an in-flight login check", async () => {
    supabaseMock.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "u-checkout-race" } } },
    });
    let finishLoginCheck!: (value: {
      data: Record<string, unknown>;
      error: null;
    }) => void;
    supabaseMock.functions.invoke
      .mockImplementationOnce(() =>
        new Promise((resolve) => {
          finishLoginCheck = resolve;
        })
      )
      .mockResolvedValue({
        data: {
          subscribed: false,
          product_id: null,
          subscription_end: null,
          source: "database",
          sync_status: "pending",
        },
        error: null,
      });

    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => {
      expect(supabaseMock.functions.invoke).toHaveBeenCalledWith(
        "check-subscription",
        {},
      );
    });
    window.history.replaceState(
      {},
      "",
      "/pricing?checkout=success&session_id=cs_test_queued_checkout",
    );

    let refreshPromise!: Promise<void>;
    act(() => {
      refreshPromise = result.current.refreshSubscription();
    });
    await act(async () => {
      finishLoginCheck({
        data: {
          subscribed: false,
          product_id: null,
          subscription_end: null,
          source: "database",
          sync_status: "synced",
        },
        error: null,
      });
      await refreshPromise;
    });

    expect(supabaseMock.functions.invoke).toHaveBeenCalledWith(
      "check-subscription",
      { body: { checkout_session_id: "cs_test_queued_checkout" } },
    );
  });

  it("coalesces duplicate exact-session reconciliation callers behind one request", async () => {
    supabaseMock.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "u-checkout-coalesce" } } },
    });
    let finishLoginCheck!: (value: {
      data: Record<string, unknown>;
      error: null;
    }) => void;
    supabaseMock.functions.invoke
      .mockImplementationOnce(() =>
        new Promise((resolve) => {
          finishLoginCheck = resolve;
        }),
      )
      .mockResolvedValue({
        data: {
          subscribed: true,
          product_id: "prod_participant",
          subscription_end: "2099-01-01T00:00:00.000Z",
          source: "stripe",
          sync_status: "synced",
        },
        error: null,
      });

    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(supabaseMock.functions.invoke).toHaveBeenCalledTimes(1));

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.refreshSubscription("cs_test_same_checkout");
      second = result.current.refreshSubscription("cs_test_same_checkout");
    });
    await act(async () => {
      finishLoginCheck({
        data: {
          subscribed: false,
          product_id: null,
          subscription_end: null,
          source: "database",
          sync_status: "synced",
        },
        error: null,
      });
      await Promise.all([first, second]);
    });

    const exactCalls = supabaseMock.functions.invoke.mock.calls.filter(
      ([name, options]) => name === "check-subscription" &&
        (options as { body?: { checkout_session_id?: string } } | undefined)?.body?.checkout_session_id ===
          "cs_test_same_checkout",
    );
    expect(exactCalls).toHaveLength(1);
  });

  it("discards a delayed entitlement response after the authenticated user changes", async () => {
    let finishUserACheck!: (value: {
      data: Record<string, unknown>;
      error: null;
    }) => void;
    supabaseMock.functions.invoke
      .mockImplementationOnce(() =>
        new Promise((resolve) => {
          finishUserACheck = resolve;
        }),
      )
      .mockResolvedValueOnce({
        data: {
          subscribed: false,
          product_id: null,
          subscription_end: null,
          source: "database",
          sync_status: "synced",
        },
        error: null,
      });

    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await act(async () => {
      authStateCallbackHolder.current?.("SIGNED_IN", { user: { id: "user-a" } });
    });
    await waitFor(() => expect(supabaseMock.functions.invoke).toHaveBeenCalledTimes(1));

    await act(async () => {
      authStateCallbackHolder.current?.("SIGNED_IN", { user: { id: "user-b" } });
    });
    await waitFor(() => expect(supabaseMock.functions.invoke).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.user?.id).toBe("user-b"));
    expect(result.current.subscription.subscribed).toBe(false);

    await act(async () => {
      finishUserACheck({
        data: {
          subscribed: true,
          product_id: "prod_user_a",
          subscription_end: "2099-01-01T00:00:00.000Z",
          source: "stripe",
          sync_status: "synced",
        },
        error: null,
      });
    });

    expect(result.current.user?.id).toBe("user-b");
    expect(result.current.subscription.subscribed).toBe(false);
    expect(result.current.subscription.productId).toBeNull();
  });

  it("preserves previously verified access when a refresh exceeds the subscription deadline", async () => {
    supabaseMock.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "user-timeout" } } },
    });
    supabaseMock.functions.invoke.mockResolvedValueOnce({
      data: {
        subscribed: true,
        product_id: "prod_agent",
        subscription_end: "2099-01-01T00:00:00.000Z",
        source: "stripe",
        sync_status: "synced",
      },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.subscription.subscribed).toBe(true));

    vi.useFakeTimers({ shouldAdvanceTime: true });
    supabaseMock.functions.invoke.mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    try {
      let refreshPromise!: Promise<void>;
      await act(async () => {
        refreshPromise = result.current.refreshSubscription();
        await vi.advanceTimersByTimeAsync(6_500);
        await refreshPromise;
      });

      expect(result.current.subscription).toMatchObject({
        subscribed: true,
        productId: "prod_agent",
        source: "stripe",
        syncStatus: "timeout",
        loading: false,
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(result.current.subscription.subscribed).toBe(false);
      expect(result.current.subscription.syncStatus).toBe("timeout");
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves previously verified access for the Edge deadline envelope", async () => {
    supabaseMock.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "user-edge-deadline" } } },
    });
    supabaseMock.functions.invoke
      .mockResolvedValueOnce({
        data: {
          subscribed: true,
          product_id: "prod_agent",
          subscription_end: "2099-01-01T00:00:00.000Z",
          source: "stripe",
          sync_status: "synced",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          subscribed: false,
          product_id: null,
          subscription_end: null,
          source: "deadline",
          sync_status: "timeout",
        },
        error: null,
      });

    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.subscription.subscribed).toBe(true));

    await act(async () => {
      await result.current.refreshSubscription();
    });

    expect(result.current.subscription).toMatchObject({
      subscribed: true,
      productId: "prod_agent",
      source: "stripe",
      syncStatus: "timeout",
      loading: false,
    });
  });

  it("adopts durable access returned with a reconciliation timeout", async () => {
    supabaseMock.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "user-durable-timeout" } } },
    });
    supabaseMock.functions.invoke.mockResolvedValue({
      data: {
        subscribed: true,
        product_id: "prod_agent",
        subscription_end: "2099-01-01T00:00:00.000Z",
        source: "billing_state",
        sync_status: "timeout",
      },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await act(async () => {
      authStateCallbackHolder.current?.("INITIAL_SESSION", {
        user: { id: "user-durable-timeout" },
      });
    });

    await waitFor(() => {
      expect(result.current.subscription).toMatchObject({
        subscribed: true,
        productId: "prod_agent",
        source: "billing_state",
        syncStatus: "timeout",
        staleUntil: expect.any(Number),
      });
    });
  });
});

describe("useAuth exposes the same identity as the rendered component sees", () => {
  it("renders children once mounted", async () => {
    const { getByText } = render(
      <AuthProvider>
        <div>child-rendered</div>
      </AuthProvider>,
    );
    await waitFor(() => expect(getByText("child-rendered")).toBeInTheDocument());
  });
});
