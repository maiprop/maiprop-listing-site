import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AISearchBar } from "@/components/AISearchBar";
import {
  CookieConsentBanner,
  getCookieConsent,
  saveCookieConsent,
} from "@/components/CookieConsentBanner";
import ProAIToolsWidget from "@/components/ProAIToolsWidget";
import { ROICalculator } from "@/components/ROICalculator";
import { MemoryRouter } from "react-router-dom";

const invokeMock = vi.fn();
const getSessionMock = vi.fn();
const toastErrorMock = vi.fn();
const currentAuth = vi.hoisted(() => ({ user: { id: "user-1" } as null | { id: string } }));
const navigateMock = vi.hoisted(() => vi.fn());
const trackUserSearchMock = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: currentAuth.user }),
}));

vi.mock("@/components/SignInForAI", () => ({
  SignInForAI: ({ feature }: { feature: string }) => <div>Sign in for {feature}</div>,
}));

vi.mock("@/hooks/useTrackUserSearch", () => ({
  useTrackUserSearch: () => trackUserSearchMock,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
    auth: { getSession: (...args: unknown[]) => getSessionMock(...args) },
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function streamingResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    }),
    { status: 200 },
  );
}

describe("small interaction widgets", () => {
  beforeEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    currentAuth.user = { id: "user-1" };
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({
      data: { allowed: true, reason: null, used: 1, limit: 50 },
      error: null,
    });
    getSessionMock.mockReset();
    toastErrorMock.mockReset();
    navigateMock.mockReset();
    trackUserSearchMock.mockReset();
    trackUserSearchMock.mockResolvedValue(undefined);
    vi.restoreAllMocks();
  });

  it("runs AI search from input, suggestions, clear button, escape key, guest gate, and error path", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { city: "Athens", price_max: 200000, summary: "Athens under 200k" },
      error: null,
    });
    const onFiltersApplied = vi.fn();
    render(<AISearchBar onFiltersApplied={onFiltersApplied} />);

    fireEvent.click(screen.getByRole("button", { name: /Open AI Search/i }));
    fireEvent.change(screen.getByPlaceholderText(/quiet apartment/i), {
      target: { value: "Athens under 200k" },
    });
    fireEvent.keyDown(screen.getByPlaceholderText(/quiet apartment/i), { key: "Enter" });

    await waitFor(() => expect(onFiltersApplied).toHaveBeenCalledWith(
      expect.objectContaining({ city: "Athens", price_max: 200000 }),
    ));
    expect(trackUserSearchMock).toHaveBeenCalledWith(expect.objectContaining({
      surface: "ai_search",
      query: "Athens under 200k",
      route: "/listings",
      filters: expect.objectContaining({ city: "Athens", price_max: 200000 }),
    }));
    expect(screen.getByRole("button", { name: /Current filter: Athens under 200k/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Clear AI search filters/i }));
    expect(onFiltersApplied).toHaveBeenLastCalledWith({});

    invokeMock.mockResolvedValueOnce({ data: { error: "Model unavailable" }, error: null });
    fireEvent.click(screen.getByRole("button", { name: /Open AI Search/i }));
    fireEvent.click(screen.getByText(/Quiet apartment near metro/i));
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith("Model unavailable"));

    fireEvent.keyDown(screen.getByPlaceholderText(/quiet apartment/i), { key: "Escape" });
    expect(screen.queryByText("AI Property Search")).not.toBeInTheDocument();

    currentAuth.user = null;
    render(<AISearchBar onFiltersApplied={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Open AI Search/i }).at(-1)!);
    expect(screen.getByText("Sign in for AI Search")).toBeInTheDocument();
  });

  it("routes auction AI searches to the auctions surface instead of applying listing-grid filters", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        listing_type: "auction",
        city: "Agrinio",
        price_min: 100000,
        price_max: 200000,
        sqm_min: 80,
        sqm_max: 120,
        summary: "Auctions in Agrinio",
      },
      error: null,
    });
    const onFiltersApplied = vi.fn();
    render(<AISearchBar onFiltersApplied={onFiltersApplied} />);

    fireEvent.click(screen.getByRole("button", { name: /Open AI Search/i }));
    fireEvent.change(screen.getByPlaceholderText(/quiet apartment/i), {
      target: { value: "show me auctions in Agrinio" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith(
      "/auctions?city=Agrinio&price_min=100000&price_max=200000&sqm_min=80&sqm_max=120&ai_summary=Auctions+in+Agrinio",
    ));
    expect(trackUserSearchMock).toHaveBeenCalledWith(expect.objectContaining({
      surface: "ai_search",
      query: "show me auctions in Agrinio",
      route: "/auctions",
      filters: expect.objectContaining({ listing_type: "auction", city: "Agrinio" }),
    }));
    expect(onFiltersApplied).not.toHaveBeenCalled();
  });

  it("stores cookie preferences for accept, reject, custom save, hide, and invalid localStorage data", () => {
    localStorage.setItem("maiprop_cookie_consent", "{bad");
    expect(getCookieConsent()).toBeNull();
    saveCookieConsent({ accepted: true, functional: true, analytics: false, mapping: false, timestamp: 1 });
    expect(getCookieConsent()).toMatchObject({ analytics: false, mapping: false });
    localStorage.clear();

    vi.useFakeTimers();
    const consentEvent = vi.fn();
    window.addEventListener("maiprop_consent_updated", consentEvent);
    render(<CookieConsentBanner />);
    act(() => vi.advanceTimersByTime(1300));
    expect(screen.getByText("cookie.title")).toBeInTheDocument();
    expect(screen.getByTestId("cookie-consent-banner")).toHaveClass("max-h-[38svh]");

    fireEvent.click(screen.getByRole("button", { name: /cookie.managePreferences/i }));
    fireEvent.click(screen.getByText("cookie.analytics.title").closest("div")!.parentElement!.querySelector("button")!);
    fireEvent.click(screen.getByText("cookie.mapping.title").closest("div")!.parentElement!.querySelector("button")!);
    fireEvent.click(screen.getByRole("button", { name: /cookie.savePreferences/i }));
    expect(JSON.parse(localStorage.getItem("maiprop_cookie_consent") ?? "{}")).toMatchObject({
      accepted: true,
      functional: true,
      analytics: true,
      mapping: false,
    });
    expect(consentEvent).toHaveBeenCalled();

    localStorage.clear();
    render(<CookieConsentBanner />);
    act(() => vi.advanceTimersByTime(1300));
    fireEvent.click(screen.getByRole("button", { name: /cookie.rejectOptional/i }));
    expect(JSON.parse(localStorage.getItem("maiprop_cookie_consent") ?? "{}")).toMatchObject({
      analytics: false,
      mapping: false,
    });

    localStorage.clear();
    render(<CookieConsentBanner />);
    act(() => vi.advanceTimersByTime(1300));
    fireEvent.click(screen.getByRole("button", { name: /cookie.acceptAll/i }));
    expect(JSON.parse(localStorage.getItem("maiprop_cookie_consent") ?? "{}")).toMatchObject({
      analytics: true,
      mapping: true,
    });

    localStorage.clear();
    render(<CookieConsentBanner />);
    act(() => vi.advanceTimersByTime(1300));
    fireEvent.click(screen.getByRole("button", { name: /cookie.hidePreferences/i }));
    expect(screen.queryByText("cookie.title")).not.toBeInTheDocument();
    window.removeEventListener("maiprop_consent_updated", consentEvent);
  });

  it("recalculates ROI across bounded and zero-value inputs", () => {
    render(<ROICalculator defaultPrice={300000} defaultSqm={100} />);

    const [price, downPayment, interest, years, rent, expenses, appreciation] = screen.getAllByRole("spinbutton");
    fireEvent.change(price, { target: { value: "0" } });
    fireEvent.change(downPayment, { target: { value: "150" } });
    expect(downPayment).toHaveValue(100);
    fireEvent.change(downPayment, { target: { value: "-5" } });
    expect(downPayment).toHaveValue(0);
    fireEvent.change(interest, { target: { value: "0" } });
    fireEvent.change(years, { target: { value: "0" } });
    expect(years).toHaveValue(1);
    fireEvent.change(rent, { target: { value: "1800" } });
    fireEvent.change(expenses, { target: { value: "450" } });
    fireEvent.change(appreciation, { target: { value: "5" } });

    expect(screen.getByText("Cap rate")).toBeInTheDocument();
    expect(screen.getByText("5-yr ROI")).toBeInTheDocument();
    expect(screen.getByText(/Indicative only/i)).toBeInTheDocument();
  });

  it("initializes ROI estimates safely when the listing area is unavailable", () => {
    render(<ROICalculator defaultPrice={300000} defaultSqm={0} />);

    const values = screen.getAllByRole("spinbutton").map((input) => (input as HTMLInputElement).value);
    expect(values).not.toContain("Infinity");
    expect(values).not.toContain("NaN");
    expect(screen.getByText("Cap rate")).toBeInTheDocument();
  });

  it("streams Pro AI responses, preserves group chats, clears, and handles auth plus HTTP failures", async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "token" } } });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(streamingResponse([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n',
      "data: [DONE]\n",
    ]) as unknown as Response);

    render(
      <MemoryRouter>
        <ProAIToolsWidget />
      </MemoryRouter>,
    );
    expect(await screen.findByText("1 / 50 used")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Ask the legal AI/i), { target: { value: "Draft a clause" } });
    fireEvent.keyDown(screen.getByPlaceholderText(/Ask the legal AI/i), { key: "Enter" });
    await screen.findByText(/Hello world/i);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/functions/v1/pro-ai-tools"), expect.any(Object));

    fireEvent.click(screen.getByRole("button", { name: /Design/i }));
    expect(screen.getByText(/Design AI Assistant/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Legal/i }));
    expect(screen.getByText(/Hello world/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Clear chat"));
    expect(screen.queryByText(/Hello world/i)).not.toBeInTheDocument();

    getSessionMock.mockResolvedValueOnce({ data: { session: null } });
    fireEvent.change(screen.getByPlaceholderText(/Ask the legal AI/i), { target: { value: "Need auth" } });
    fireEvent.click(screen.getByRole("button", { name: "" }));
    await screen.findByText(/Please sign in to use Pro AI Tools/i);

    getSessionMock.mockResolvedValueOnce({ data: { session: { access_token: "token" } } });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ error: "quota" }), { status: 429 }) as unknown as Response);
    fireEvent.change(screen.getByPlaceholderText(/Ask the legal AI/i), { target: { value: "Try again" } });
    fireEvent.click(screen.getByRole("button", { name: "" }));
    await screen.findByText(/quota/i);
  });

  it("blocks Pro AI Tools sends when the quota counter is exhausted", async () => {
    vi.stubGlobal("fetch", vi.fn());
    invokeMock.mockResolvedValueOnce({
      data: { allowed: false, reason: "monthly_limit_reached", used: 50, limit: 50 },
      error: null,
    });

    render(
      <MemoryRouter>
        <ProAIToolsWidget />
      </MemoryRouter>,
    );

    expect(await screen.findByText("50 / 50 used")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /upgrade/i })).toHaveAttribute("href", "/pricing");
    expect(screen.getByPlaceholderText(/Ask the legal AI/i)).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
