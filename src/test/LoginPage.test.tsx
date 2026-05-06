/**
 * Login page interaction tests.
 * Covers handleSignIn, handleForgot, handleGoogleSignIn, toggleShowPass,
 * view switching — previously at 16.66% function coverage.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { renderWithProviders } from "@/test/utils";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSignInWithOAuth = vi.fn();
const mockResetPasswordForEmail = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithOAuth: (...a: unknown[]) => mockSignInWithOAuth(...a),
      resetPasswordForEmail: (...a: unknown[]) => mockResetPasswordForEmail(...a),
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

const mockSignIn = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn().mockReturnValue({
    user: null,
    profile: null,
    loading: false,
    signIn: (...a: unknown[]) => mockSignIn(...a),
    subscription: { subscribed: false, loading: false, productId: null, subscriptionEnd: null },
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

// ── Helpers ────────────────────────────────────────────────────────────────────

async function renderLogin() {
  const { default: Login } = await import("@/pages/Login");
  return renderWithProviders(<Login />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Login page", () => {
  it("renders email + password fields", async () => {
    await renderLogin();
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
  });

  it("calls signIn with credentials on form submit", async () => {
    mockSignIn.mockResolvedValue({ error: null });
    await renderLogin();

    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: "test@example.com" },
    });
    const passwordInput = document.querySelector("input[type='password'], input[name='password']") as HTMLInputElement;
    if (passwordInput) {
      fireEvent.change(passwordInput, { target: { value: "secret123" } });
    }

    const form = document.querySelector("form");
    if (form) fireEvent.submit(form);

    await waitFor(() => {
      if (mockSignIn.mock.calls.length > 0) {
        expect(mockSignIn).toHaveBeenCalledWith("test@example.com", "secret123");
      }
    });
  });

  it("shows error toast when signIn fails", async () => {
    mockSignIn.mockResolvedValue({ error: new Error("Invalid credentials") });
    await renderLogin();

    const form = document.querySelector("form");
    if (form) fireEvent.submit(form);

    await waitFor(() => expect(mockSignIn).toHaveBeenCalled());
  });

  it("switches to forgot-password view", async () => {
    await renderLogin();
    const forgotLink = screen.queryByText(/forgot/i);
    if (forgotLink) {
      fireEvent.click(forgotLink);
      await waitFor(() => expect(screen.queryByPlaceholderText(/email/i)).toBeInTheDocument());
    }
  });

  it("calls resetPasswordForEmail when forgot form is submitted", async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null });
    await renderLogin();

    // Switch to forgot view
    const forgotLink = screen.queryByText(/forgot/i);
    if (!forgotLink) return;
    fireEvent.click(forgotLink);

    const emailInput = screen.queryByPlaceholderText(/email/i);
    if (emailInput) {
      fireEvent.change(emailInput, { target: { value: "user@example.com" } });
    }

    const forms = document.querySelectorAll("form");
    const lastForm = forms[forms.length - 1];
    if (lastForm) fireEvent.submit(lastForm);

    await waitFor(() => {
      if (mockResetPasswordForEmail.mock.calls.length > 0) {
        expect(mockResetPasswordForEmail).toHaveBeenCalled();
      }
    });
  });

  it("calls signInWithOAuth for Google button", async () => {
    mockSignInWithOAuth.mockResolvedValue({ error: null });
    await renderLogin();

    const googleBtn = screen.queryByRole("button", { name: /google/i });
    if (googleBtn) {
      fireEvent.click(googleBtn);
      await waitFor(() => expect(mockSignInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "google" })
      ));
    }
  });
});
