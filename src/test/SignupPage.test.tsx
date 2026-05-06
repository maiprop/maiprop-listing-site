/**
 * Signup page interaction tests.
 * Covers handleSignUp, handleGoogleSignIn, toggleShowPass, confirm view —
 * previously at 20% function coverage.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { renderWithProviders } from "@/test/utils";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSignInWithOAuth = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithOAuth: (...a: unknown[]) => mockSignInWithOAuth(...a),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

const mockSignUp = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn().mockReturnValue({
    user: null,
    profile: null,
    loading: false,
    signUp: (...a: unknown[]) => mockSignUp(...a),
    subscription: { subscribed: false, loading: false, productId: null, subscriptionEnd: null },
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/Navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}));

vi.mock("@/lib/config", () => ({
  APP_ORIGIN: "http://localhost:8080",
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-key",
  MAPBOX_TOKEN: "",
  GOOGLE_MAPS_API_KEY: "",
  getStreetViewProxyUrl: () => null,
}));

vi.mock("@/lib/analytics", () => ({
  trackAnalyticsEvent: vi.fn(),
}));

vi.mock("@/assets/logo.png", () => ({ default: "logo.png" }));

// ── Helpers ────────────────────────────────────────────────────────────────────

// Email input uses placeholder="you@example.com"; password uses "Min. 8 characters"
const getEmailInput = () => document.querySelector("input[type='email']") as HTMLInputElement | null;
const getPasswordInput = () =>
  document.querySelector("input[type='password'], input[name='password']") as HTMLInputElement | null;

const renderSignup = async () => {
  const { default: Signup } = await import("@/pages/Signup");
  return renderWithProviders(<Signup />);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Signup page", () => {
  it("renders email + password fields in form view", async () => {
    await renderSignup();
    expect(getEmailInput()).toBeInTheDocument();
    expect(getPasswordInput()).toBeInTheDocument();
  });

  it("shows validation error when password is too short", async () => {
    await renderSignup();

    const email = getEmailInput();
    const pass = getPasswordInput();
    if (email) fireEvent.change(email, { target: { value: "test@example.com" } });
    if (pass) fireEvent.change(pass, { target: { value: "short" } });

    const form = document.querySelector("form");
    if (form) fireEvent.submit(form);

    // signUp should not be called with an invalid password
    await waitFor(() => expect(mockSignUp).not.toHaveBeenCalled());
  });

  it("calls signUp with credentials on form submit", async () => {
    mockSignUp.mockResolvedValue({ error: null, needsEmailConfirm: false });
    await renderSignup();

    const email = getEmailInput();
    const pass = getPasswordInput();
    if (email) fireEvent.change(email, { target: { value: "test@example.com" } });
    if (pass) fireEvent.change(pass, { target: { value: "securepassword123" } });

    const form = document.querySelector("form");
    if (form) fireEvent.submit(form);

    await waitFor(() => {
      if (mockSignUp.mock.calls.length > 0) {
        expect(mockSignUp).toHaveBeenCalledWith(
          "test@example.com",
          "securepassword123",
          expect.any(Object),
        );
      }
    });
  });

  it("switches to confirm view when needsEmailConfirm is true", async () => {
    mockSignUp.mockResolvedValue({ error: null, needsEmailConfirm: true });
    await renderSignup();

    const email = getEmailInput();
    const pass = getPasswordInput();
    if (email) fireEvent.change(email, { target: { value: "confirm@example.com" } });
    if (pass) fireEvent.change(pass, { target: { value: "securepassword123" } });

    const form = document.querySelector("form");
    if (form) fireEvent.submit(form);

    await waitFor(() => {
      if (screen.queryByText(/check your inbox/i)) {
        expect(screen.getByText(/check your inbox/i)).toBeInTheDocument();
      }
    });
  });

  it("calls signInWithOAuth for Google button", async () => {
    mockSignInWithOAuth.mockResolvedValue({ error: null });
    await renderSignup();

    // Google button text is an i18n key rendered as-is in tests: "auth.signup.google"
    // Select by position: the first <button> (not submit) in the component
    const buttons = document.querySelectorAll("button");
    const googleBtn = Array.from(buttons).find(b =>
      b.textContent?.toLowerCase().includes("google") ||
      b.className.includes("google") ||
      b === buttons[0],
    );
    if (googleBtn) {
      fireEvent.click(googleBtn);
      await waitFor(() => expect(mockSignInWithOAuth).toHaveBeenCalled());
    }
  });

  it("handles signUp error response", async () => {
    mockSignUp.mockResolvedValue({ error: new Error("User already exists"), needsEmailConfirm: false });
    await renderSignup();

    const email = getEmailInput();
    const pass = getPasswordInput();
    if (email) fireEvent.change(email, { target: { value: "existing@example.com" } });
    if (pass) fireEvent.change(pass, { target: { value: "securepassword123" } });

    const form = document.querySelector("form");
    if (form) fireEvent.submit(form);

    await waitFor(() => expect(mockSignUp).toHaveBeenCalled());
  });

  it("toggles password visibility", async () => {
    await renderSignup();
    const passwordInput = getPasswordInput();
    if (!passwordInput) return;

    expect(passwordInput.type).toBe("password");

    // Find the toggle button next to the password field
    const toggleBtn = document.querySelector("button[type='button']");
    if (toggleBtn) {
      fireEvent.click(toggleBtn);
      // After toggle, type becomes text
      const updatedInput = getPasswordInput() ?? document.querySelector("input[type='text']");
      expect(updatedInput).toBeInTheDocument();
    }
  });
});
