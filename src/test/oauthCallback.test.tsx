import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthCallback from "@/pages/AuthCallback";
import {
  buildOAuthCallbackRedirectTo,
  safeRedirectPath,
  shouldRouteLoginOAuthErrorToSignup,
} from "@/lib/oauthCallback";

const authMock = vi.hoisted(() => ({
  user: null as null | { id: string },
  loading: false,
  profileLoading: false,
  needsOnboarding: false,
}));

const toastMock = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authMock,
}));

vi.mock("@/lib/config", () => ({
  APP_ORIGIN: "https://app.test",
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_ANON_KEY: "anon",
  GOOGLE_MAPS_API_KEY: "",
  GOOGLE_PLACES_AUTOCOMPLETE_ENABLED: false,
  MAPBOX_TOKEN: "",
  getStreetViewProxyUrl: vi.fn().mockReturnValue(""),
}));

vi.mock("sonner", () => ({
  toast: toastMock,
}));

const renderCallback = (initialPath: string) =>
  render(
    <MemoryRouter
      initialEntries={[initialPath]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/signup" element={<div>Signup destination</div>} />
        <Route path="/login" element={<div>Login destination</div>} />
        <Route path="/dashboard" element={<div>Dashboard destination</div>} />
        <Route path="/saved-searches" element={<div>Saved searches destination</div>} />
        <Route path="/onboarding" element={<div>Onboarding destination</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe("OAuth callback routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.user = null;
    authMock.loading = false;
    authMock.profileLoading = false;
    authMock.needsOnboarding = false;
  });

  it("routes login OAuth signup-disabled failures to the signup form", async () => {
    renderCallback(
      "/auth/callback?intent=login&next=%2Fdashboard#error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance",
    );

    expect(await screen.findByText("Signup destination")).toBeInTheDocument();
    expect(toastMock.info).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("keeps existing login OAuth users on their intended local destination", async () => {
    authMock.user = { id: "user-1" };

    renderCallback("/auth/callback?intent=login&next=%2Fsaved-searches");

    expect(await screen.findByText("Saved searches destination")).toBeInTheDocument();
  });

  it("routes signup OAuth successes to onboarding", async () => {
    authMock.user = { id: "user-1" };

    renderCallback("/auth/callback?intent=signup&next=%2Fonboarding");

    expect(await screen.findByText("Onboarding destination")).toBeInTheDocument();
  });

  it("sends non-signup OAuth errors back to login", async () => {
    renderCallback(
      "/auth/callback?intent=login&next=%2Fdashboard#error=server_error&error_code=provider_disabled&error_description=Provider+disabled",
    );

    expect(await screen.findByText("Login destination")).toBeInTheDocument();
    expect(toastMock.error).toHaveBeenCalledWith("Provider disabled");
  });

  it("returns signup OAuth errors to the signup page", async () => {
    renderCallback(
      "/auth/callback?intent=signup&next=%2Fonboarding#error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed",
    );

    expect(await screen.findByText("Signup destination")).toBeInTheDocument();
    expect(toastMock.error).toHaveBeenCalledWith("Signups not allowed");
  });

  it("builds safe callback URLs and rejects off-site next paths", () => {
    expect(buildOAuthCallbackRedirectTo("login", "/dashboard?tab=reports")).toBe(
      "https://app.test/auth/callback?intent=login&next=%2Fdashboard%3Ftab%3Dreports",
    );
    expect(safeRedirectPath("https://evil.test/phish", "/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("//evil.test/phish", "/dashboard")).toBe("/dashboard");
    expect(shouldRouteLoginOAuthErrorToSignup({ error: null, errorCode: "signup_disabled", errorDescription: null })).toBe(true);
  });
});
