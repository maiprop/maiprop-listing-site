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

const { authActivityMock, authStateCallbackHolder, supabaseMock } = vi.hoisted(() => {
  // Holder<T> lets us reassign the captured onAuthStateChange listener
  // between tests so each test can drive the provider with a fresh shape.
  const authStateCallbackHolder: { current: ((event: string, session: unknown) => void) | null } = {
    current: null,
  };

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
  };

  const authActivityMock = {
    recordUserAuthActivity: vi.fn().mockResolvedValue("auth-event-1"),
  };

  return { authActivityMock, authStateCallbackHolder, supabaseMock };
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

import { AuthProvider, useAuth, profileNeedsOnboarding } from "@/contexts/AuthContext";

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function wrap({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => {
  authStateCallbackHolder.current = null;
  vi.clearAllMocks();
  // Reinstall default behaviour after clearAllMocks wipes implementations.
  supabaseMock.auth.onAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
    authStateCallbackHolder.current = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  supabaseMock.auth.getSession.mockResolvedValue({ data: { session: null } });
  supabaseMock.auth.signOut.mockResolvedValue({ error: null });
  supabaseMock.auth.signInWithPassword.mockResolvedValue({ error: null });
  supabaseMock.auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: null });
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

describe("useAuth() outside provider", () => {
  it("throws a clear error when no AuthProvider is mounted above", () => {
    // Suppress React's console.error so the assertion error is the only output.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(/useAuth must be used within AuthProvider/);
    errSpy.mockRestore();
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
  it("hydrates user/profile and probes the subscription edge function on SIGNED_IN", async () => {
    // Profile fetch — the chain ends in `.single()` returning the row.
    const profileRow = {
      user_id: "u-1",
      role: "buyer",
      participant_type: "buyer",
      display_name: "Alice",
    };
    supabaseMock.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: profileRow, error: null }),
    });
    supabaseMock.functions.invoke.mockResolvedValue({
      data: { subscribed: true, product_id: "prod_pro", subscription_end: "2027-01-01" },
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
    await waitFor(() => expect(result.current.subscription.subscribed).toBe(true));
    expect(result.current.subscription).toMatchObject({
      productId: "prod_pro",
      subscriptionEnd: "2027-01-01",
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

  it("fails closed when a refresh exceeds the subscription deadline", async () => {
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
        subscribed: false,
        productId: null,
        syncStatus: "timeout",
        loading: false,
      });
    } finally {
      vi.useRealTimers();
    }
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
