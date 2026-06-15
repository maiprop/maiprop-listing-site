/**
 * Render-smoke for `src/App.tsx`.
 *
 * App.tsx is mostly route declarations + a few small helpers
 * (I18nLoader, GlobalAIWidget). Mount it once at "/", once at "/login"
 * (to hit the GlobalAIWidget hide-prefix branch), and once at a path
 * starting with "/property/" (prefix-match branch). All children pages
 * are mocked to lightweight stubs so the test stays fast and isolated
 * from page-level dependencies.
 *
 * Every page that App lazy-imports is mocked. We also mock every
 * upstream provider/dependency that AuthProvider would otherwise need
 * (Supabase client, useAiTranslation, BottomNav, ErrorBoundary, etc.)
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));
vi.mock("@/lib/logger", () => ({
  // ErrorBoundary calls logger.critical(); other code paths use info/warn/error.
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), critical: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/config", () => ({ APP_ORIGIN: "https://test.maiprop" }));
vi.mock("@/hooks/useAiTranslation", () => ({ useAiTranslation: () => null }));

// Stub every lazy page + the AI widget + cookie banner so the route table
// has something to render quickly, but we don't pay the cost of the real
// 500-LoC pages here. Use absolute @-aliased paths so vitest's mock store
// is keyed by the same resolved module id that App.tsx's lazy() imports
// produce — relative ./pages/X specifiers from this test file would
// otherwise resolve to src/test/pages/X and miss the actual modules.
const stub = (label: string) => ({ default: () => <div>{label}</div> });
vi.mock("@/pages/Index", () => stub("page-index"));
vi.mock("@/components/AIAssistantWidget", () => stub("ai-widget"));
vi.mock("@/pages/Listings", () => stub("page-listings"));
vi.mock("@/pages/PropertyDetail", () => stub("page-property"));
vi.mock("@/pages/Auctions", () => stub("page-auctions"));
vi.mock("@/pages/Firesale", () => stub("page-firesale"));
vi.mock("@/pages/InvestorDashboard", () => stub("page-investor-dashboard"));
vi.mock("@/pages/Professionals", () => stub("page-professionals"));
vi.mock("@/pages/ProfessionalProfile", () => stub("page-professional-profile"));
vi.mock("@/pages/ProfessionalProfileMe", () => stub("page-professional-me"));
vi.mock("@/pages/Dashboard", () => stub("page-dashboard"));
vi.mock("@/pages/Signup", () => stub("page-signup"));
vi.mock("@/pages/Login", () => stub("page-login"));
vi.mock("@/pages/Onboarding", () => stub("page-onboarding"));
vi.mock("@/pages/Messages", () => stub("page-messages"));
vi.mock("@/pages/CreateListing", () => stub("page-create-listing"));
vi.mock("@/pages/CreateNewBuildingListing", () => stub("page-create-newbuild"));
vi.mock("@/pages/ResetPassword", () => stub("page-reset"));
vi.mock("@/pages/NotFound", () => stub("page-notfound"));
vi.mock("@/pages/Projects", () => stub("page-projects"));
vi.mock("@/pages/ProjectDetail", () => stub("page-project-detail"));
vi.mock("@/pages/Portfolios", () => stub("page-portfolios"));
vi.mock("@/pages/Pricing", () => stub("page-pricing"));
vi.mock("@/pages/AdminDashboard", () => stub("page-admin"));
vi.mock("@/pages/PlatformMap", () => stub("page-map"));
vi.mock("@/pages/AIAssistantPage", () => stub("page-ai"));
vi.mock("@/pages/PrivacyPolicy", () => stub("page-privacy"));
vi.mock("@/pages/TermsOfService", () => stub("page-terms"));
vi.mock("@/pages/CookiePolicy", () => stub("page-cookie"));
vi.mock("@/pages/BrandedVideoRoom", () => stub("page-video"));
vi.mock("@/pages/VideoViewingRoom", () => stub("page-video-viewing"));
vi.mock("@/pages/NewBuildDetail", () => stub("page-newbuild"));
vi.mock("@/pages/OpenHouses", () => stub("page-openhouses"));
vi.mock("@/pages/OpenHouseDetail", () => stub("page-openhouse-detail"));
vi.mock("@/pages/ApiDocs", () => stub("page-api-docs"));
vi.mock("@/pages/DocumentTemplates", () => stub("page-doc-templates"));
vi.mock("@/pages/Contact", () => stub("page-contact"));
vi.mock("@/components/CookieConsentBanner", () => ({
  CookieConsentBanner: () => <div>cookie-banner</div>,
}));
vi.mock("@/components/BottomNav", () => ({ BottomNav: () => <div>bottom-nav</div> }));

// Force BrowserRouter to read from a controlled location set on
// window.history before each render.
function setLocation(pathname: string) {
  window.history.replaceState(null, "", pathname);
}

import App from "@/App";

describe("App.tsx render smoke", () => {
  it("renders the Index page at '/' and defers the global AI widget on a non-hidden route", async () => {
    setLocation("/");
    render(<App />);
    await waitFor(() => expect(screen.getByText("page-index")).toBeInTheDocument());
    // Outside the hide-prefix list -> floating widget still mounts, but only
    // after the first-load path has had an idle window.
    expect(screen.queryByText("ai-widget")).toBeNull();
    await waitFor(() => expect(screen.getByText("ai-widget")).toBeInTheDocument(), {
      timeout: 3000,
    });
    // Bottom nav and cookie banner always render.
    expect(screen.getByText("bottom-nav")).toBeInTheDocument();
  });

  it("renders the Login page and HIDES the floating AI widget on /login (hide-prefix branch)", async () => {
    setLocation("/login");
    render(<App />);
    await waitFor(() => expect(screen.getByText("page-login")).toBeInTheDocument());
    // Inside HIDE_WIDGET_PREFIXES — GlobalAIWidget returns null.
    expect(screen.queryByText("ai-widget")).toBeNull();
  });

  it("hides the AI widget on a deep prefix match (e.g. /property/123)", async () => {
    setLocation("/property/abc-123");
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("page-property")).toBeInTheDocument(),
    );
    expect(screen.queryByText("ai-widget")).toBeNull();
  });

  it("renders the NotFound page for unknown paths (catch-all '*' route)", async () => {
    setLocation("/this/route/does/not/exist");
    render(<App />);
    await waitFor(() => expect(screen.getByText("page-notfound")).toBeInTheDocument());
  });
});

// ── ErrorBoundary peripheral isolation ─────────────────────────────────────
// Each peripheral component (BottomNav, GlobalAIWidget, CookieConsentBanner,
// I18nLoader) is wrapped in its own ErrorBoundary so a crash in one cannot
// take down the routes. Use vi.doMock + dynamic import here so the module
// graph this block sees overrides the top-of-file BottomNav stub.
describe("App.tsx ErrorBoundary peripheral isolation", () => {
  it("keeps routes rendered when BottomNav throws during render", async () => {
    vi.resetModules();
    vi.doMock("@/components/BottomNav", () => ({
      BottomNav: () => {
        throw new Error("BottomNav exploded");
      },
    }));
    // Re-require all the page mocks under the new module graph.
    vi.doMock("@/pages/Index", () => ({ default: () => <div>page-index</div> }));
    vi.doMock("@/pages/NotFound", () => ({ default: () => <div>page-notfound</div> }));
    vi.doMock("@/components/CookieConsentBanner", () => ({
      CookieConsentBanner: () => <div>cookie-banner</div>,
    }));
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: {
        auth: {
          onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
          getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
          signInWithPassword: vi.fn(),
          signUp: vi.fn(),
          signOut: vi.fn(),
        },
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
        functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
      },
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), critical: vi.fn(), debug: vi.fn() },
    }));
    vi.doMock("@/lib/config", () => ({ APP_ORIGIN: "https://test.maiprop" }));
    vi.doMock("@/hooks/useAiTranslation", () => ({ useAiTranslation: () => null }));

    const FreshApp = (await import("@/App")).default;
    setLocation("/");
    // React will log the boundary error to console.error — silence to keep
    // the test output clean while still asserting the route is alive.
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      render(<FreshApp />);
      await waitFor(() => expect(screen.getByText("page-index")).toBeInTheDocument());
      // BottomNav crashed but routes survived — that's the whole point.
      expect(screen.queryByText("bottom-nav")).toBeNull();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
