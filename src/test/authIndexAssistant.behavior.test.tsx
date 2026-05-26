import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";
import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";
import AIAssistantWidget from "@/components/AIAssistantWidget";
import { HeroSection } from "@/components/index/HeroSection";
import { PropertyTypeDropdown } from "@/components/index/PropertyTypeDropdown";
import { LocationInput } from "@/components/index/LocationInput";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const authMock = vi.hoisted(() => ({
  signIn: vi.fn(),
  user: null as null | { id: string },
  loading: false,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    signIn: authMock.signIn,
    user: authMock.user,
    loading: authMock.loading,
  }),
}));

vi.mock("@/components/Navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}));

vi.mock("@/components/MarketTicker", () => ({
  MarketTicker: () => <div data-testid="market-ticker" />,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithOAuth: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/config", () => ({
  APP_ORIGIN: "https://app.test",
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_ANON_KEY: "anon",
  GOOGLE_MAPS_API_KEY: "maps-key",
  MAPBOX_TOKEN: "",
  getStreetViewProxyUrl: vi.fn().mockReturnValue(""),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

const mockSupabase = supabase as unknown as {
  auth: {
    signInWithOAuth: ReturnType<typeof vi.fn>;
    resetPasswordForEmail: ReturnType<typeof vi.fn>;
    updateUser: ReturnType<typeof vi.fn>;
    getSession: ReturnType<typeof vi.fn>;
  };
};

const toastMock = toast as unknown as { error: ReturnType<typeof vi.fn> };

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function renderWithRoutes(ui: React.ReactElement, initialPath = "/") {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={ui} />
      <Route path="/login" element={ui} />
      <Route path="/dashboard" element={<div>Dashboard destination</div>} />
      <Route path="/signup" element={<div>Signup destination</div>} />
    </Routes>,
    { initialPath },
  );
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function streamResponse(chunks: string[]) {
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

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function stubMatchMedia({ desktop = true, reducedMotion = false }: { desktop?: boolean; reducedMotion?: boolean } = {}) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("min-width") ? desktop : query.includes("prefers-reduced-motion") ? reducedMotion : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  authMock.signIn.mockResolvedValue({ error: null });
  authMock.user = null;
  authMock.loading = false;
  mockSupabase.auth.signInWithOAuth.mockResolvedValue({ error: null });
  mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  mockSupabase.auth.updateUser.mockResolvedValue({ error: null });
  mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });
  localStorage.clear();
  document.body.innerHTML = "";
  document.head.querySelectorAll('script[src*="maps.googleapis.com"]').forEach((script) => script.remove());
  delete (window as typeof window & { google?: unknown }).google;
  window.history.replaceState(null, "", "/");
  vi.stubGlobal("fetch", vi.fn());
});

describe("Login", () => {
  it("redirects authenticated users only after auth loading completes and respects route state", async () => {
    authMock.loading = true;
    authMock.user = { id: "user-1" };
    const { rerender } = render(
      <MemoryRouter
        initialEntries={[{ pathname: "/login", state: { from: { pathname: "/saved-searches" } } }]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/saved-searches" element={<div>Saved searches destination</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "loginPage.signIn" })).toBeInTheDocument();

    authMock.loading = false;
    rerender(
      <MemoryRouter
        initialEntries={[{ pathname: "/login", state: { from: { pathname: "/saved-searches" } } }]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/saved-searches" element={<div>Saved searches destination</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Saved searches destination")).toBeInTheDocument();
  });

  it("submits email credentials, toggles password visibility, and shows invalid credential errors", async () => {
    authMock.signIn.mockResolvedValueOnce({ error: new Error("bad credentials") });
    renderWithRoutes(<Login />, "/login");

    const password = screen.getByLabelText("loginPage.password") as HTMLInputElement;
    expect(password.type).toBe("password");
    fireEvent.click(screen.getByLabelText("Show password"));
    expect(password.type).toBe("text");
    fireEvent.click(screen.getByLabelText("Hide password"));
    expect(password.type).toBe("password");

    fireEvent.change(screen.getByLabelText("loginPage.email"), { target: { value: "buyer@example.com" } });
    fireEvent.change(password, { target: { value: "secret123" } });
    fireEvent.submit(screen.getByRole("button", { name: "loginPage.signIn" }).closest("form")!);

    await waitFor(() => expect(authMock.signIn).toHaveBeenCalledWith("buyer@example.com", "secret123"));
    expect(toastMock.error).toHaveBeenCalledWith("Invalid email or password");
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid email or password");
  });

  it("requests a password reset, shows the sent state, and returns to sign in", async () => {
    renderWithRoutes(<Login />, "/login");

    fireEvent.click(screen.getByRole("button", { name: "loginPage.forgotPassword" }));
    expect(screen.getByText("loginPage.forgotTitle")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("loginPage.emailPlaceholder"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "loginPage.sendLink" }));

    await waitFor(() =>
      expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith("owner@example.com", {
        redirectTo: "https://app.test/reset-password",
      }),
    );
    expect(screen.getByText("loginPage.checkInbox")).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "loginPage.backToSignIn" }));
    expect(screen.getByRole("button", { name: "loginPage.signIn" })).toBeInTheDocument();
  });

  it("surfaces forgot-password errors", async () => {
    mockSupabase.auth.resetPasswordForEmail.mockResolvedValueOnce({ error: new Error("Reset unavailable") });
    renderWithRoutes(<Login />, "/login");

    fireEvent.click(screen.getByRole("button", { name: "loginPage.forgotPassword" }));
    fireEvent.change(screen.getByPlaceholderText("loginPage.emailPlaceholder"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "loginPage.sendLink" }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Reset unavailable"));
    expect(screen.getByRole("alert")).toHaveTextContent("Reset unavailable");
  });

  it("shows the pending sign-in loader after successful credentials while auth is refreshing", async () => {
    authMock.loading = true;
    renderWithRoutes(<Login />, "/login");

    fireEvent.change(screen.getByLabelText("loginPage.email"), { target: { value: "buyer@example.com" } });
    fireEvent.change(screen.getByLabelText("loginPage.password"), { target: { value: "secret123" } });
    fireEvent.submit(screen.getByRole("button", { name: "loginPage.signIn" }).closest("form")!);

    await waitFor(() => expect(authMock.signIn).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "loginPage.signIn" })).toBeDisabled();
  });

  it("surfaces OAuth errors and keeps the Google button usable again", async () => {
    mockSupabase.auth.signInWithOAuth.mockResolvedValueOnce({ error: new Error("oauth failed") });
    renderWithRoutes(<Login />, "/login");

    fireEvent.click(screen.getByRole("button", { name: "loginPage.googleCta" }));

    await waitFor(() =>
      expect(mockSupabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: { redirectTo: "https://app.test/auth/callback?intent=login&next=%2Fdashboard" },
      }),
    );
    expect(toastMock.error).toHaveBeenCalledWith("Google sign-in failed. Please try again.");
    expect(screen.getByRole("alert")).toHaveTextContent("Google sign-in failed. Please try again.");
    expect(screen.getByRole("button", { name: "loginPage.googleCta" })).not.toBeDisabled();
  });
});

describe("HeroSection", () => {
  it("keeps the hero heading readable for accessible text extraction", () => {
    stubMatchMedia({ desktop: false });

    renderWithRoutes(<HeroSection />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Find your perfect property in Greece with AI precision",
    );
  });

  it("keeps the poster-only hero for first paint, then attaches video sources on desktop idle", async () => {
    vi.useFakeTimers();
    stubMatchMedia({ desktop: true });
    Object.defineProperty(window, "requestIdleCallback", {
      configurable: true,
      value: (cb: IdleRequestCallback) =>
        window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 10 }), 0),
    });
    Object.defineProperty(window, "cancelIdleCallback", { configurable: true, value: window.clearTimeout });

    const { container } = renderWithRoutes(<HeroSection />);
    const video = container.querySelector("video")!;
    expect(video).toHaveAttribute("poster", "/hero-poster.jpg");
    expect(video.querySelector("source")).toBeNull();

    act(() => vi.advanceTimersByTime(349));
    expect(video.querySelector("source")).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1);
      vi.runOnlyPendingTimers();
      await Promise.resolve();
    });

    expect(video.querySelectorAll("source")).toHaveLength(2);
  });

  it("does not attach decorative hero video sources for reduced-motion users", () => {
    vi.useFakeTimers();
    stubMatchMedia({ desktop: true, reducedMotion: true });

    const { container } = renderWithRoutes(<HeroSection />);
    const video = container.querySelector("video")!;
    act(() => vi.runOnlyPendingTimers());

    expect(video.querySelector("source")).toBeNull();
  });
});

describe("ResetPassword", () => {
  it("shows the invalid-link branch and lets the user go back to sign in", () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<ResetPassword />} />
        <Route path="/login" element={<div>Login destination</div>} />
      </Routes>,
    );

    expect(screen.getByText("Invalid Reset Link")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to Sign In" }));
    expect(screen.getByText("Login destination")).toBeInTheDocument();
  });

  it("validates mismatch and password policy before calling Supabase", async () => {
    window.history.replaceState(null, "", "/reset-password#type=recovery");
    renderWithProviders(<ResetPassword />, { initialPath: "/reset-password" });

    fireEvent.change(screen.getByPlaceholderText("Min. 8 characters"), { target: { value: "Short1!" } });
    fireEvent.change(screen.getByPlaceholderText("Repeat your new password"), { target: { value: "Different1!" } });
    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update Password" })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Min. 8 characters"), { target: { value: "lowercase1!" } });
    fireEvent.change(screen.getByPlaceholderText("Repeat your new password"), { target: { value: "lowercase1!" } });

    expect(screen.getByText("One uppercase letter")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update Password" })).toBeDisabled();
    expect(mockSupabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it("submits mismatch validation, toggles password visibility, and shows update errors", async () => {
    window.history.replaceState(null, "", "/reset-password#type=recovery");
    mockSupabase.auth.updateUser.mockResolvedValueOnce({ error: new Error("Update failed") });
    renderWithProviders(<ResetPassword />, { initialPath: "/reset-password" });

    const newPassword = screen.getByPlaceholderText("Min. 8 characters") as HTMLInputElement;
    const confirmPassword = screen.getByPlaceholderText("Repeat your new password") as HTMLInputElement;
    expect(newPassword.type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "" }));
    expect(newPassword.type).toBe("text");
    expect(confirmPassword.type).toBe("text");

    fireEvent.change(newPassword, { target: { value: "StrongPass1!" } });
    fireEvent.change(confirmPassword, { target: { value: "OtherPass1!" } });
    fireEvent.submit(screen.getByRole("button", { name: "Update Password" }).closest("form")!);
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Passwords do not match"));

    fireEvent.change(confirmPassword, { target: { value: "StrongPass1!" } });
    fireEvent.click(screen.getByRole("button", { name: "Update Password" }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Update failed"));
  });

  it("updates a valid recovery password and redirects after the success state", async () => {
    window.history.replaceState(null, "", "/reset-password#access_token=token");
    renderWithProviders(
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/dashboard" element={<div>Dashboard destination</div>} />
      </Routes>,
      { initialPath: "/reset-password" },
    );

    fireEvent.change(screen.getByPlaceholderText("Min. 8 characters"), { target: { value: "StrongPass1!" } });
    fireEvent.change(screen.getByPlaceholderText("Repeat your new password"), { target: { value: "StrongPass1!" } });
    fireEvent.click(screen.getByRole("button", { name: "Update Password" }));

    await waitFor(() => expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({ password: "StrongPass1!" }));
    expect(screen.getByText("Password updated!")).toBeInTheDocument();
  });
});

describe("AIAssistantWidget", () => {
  it("opens, minimizes, closes with Escape, and renders property suggestions", () => {
    renderWithProviders(<AIAssistantWidget propertyContext={{ title: "Sea view flat", price: 420000 }} />);

    fireEvent.click(screen.getByLabelText("Open mAI prop AI"));
    expect(screen.getByRole("dialog", { name: "mAI prop AI" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Sea view flat")).toBeInTheDocument();
    expect(screen.getByText(/Is .*420/)).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Minimise"));
    expect(screen.queryByPlaceholderText("Ask about this property...")).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("dialog", { name: "mAI prop AI" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "mAI prop AI" })).not.toBeInTheDocument();
  });

  it("keeps unauthenticated assistant requests in the chat instead of fetching", async () => {
    renderWithProviders(<AIAssistantWidget variant="embedded" />);

    fireEvent.change(screen.getByPlaceholderText("Ask a real estate question..."), {
      target: { value: "Explain buying costs" },
    });
    fireEvent.click(screen.getByRole("button", { name: "" }));

    expect(await screen.findByText("Explain buying costs")).toBeInTheDocument();
    expect(await screen.findByText("Please sign in to use the AI assistant.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ignores empty sends, blocks duplicate sends while streaming, and wraps focus with Tab", async () => {
    let resolveFetch: (response: Response) => void = () => {};
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    renderWithProviders(<AIAssistantWidget />);

    fireEvent.click(screen.getByLabelText("Open mAI prop AI"));
    fireEvent.click(screen.getByRole("button", { name: "" }));
    expect(fetch).not.toHaveBeenCalled();

    const input = screen.getByPlaceholderText("Ask a real estate question...");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "First question" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: "Second question" } });
    fireEvent.click(screen.getByRole("button", { name: "" }));
    expect(fetch).toHaveBeenCalledTimes(1);

    const dialog = screen.getByRole("dialog", { name: "mAI prop AI" });
    const close = screen.getByTitle("Close");
    close.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(screen.getByRole("link", { name: /pro tools/i })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(close).toHaveFocus();
    input.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(close).toHaveFocus();

    resolveFetch(streamResponse(["data: [DONE]\n"]));
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.click(close);
    expect(screen.queryByRole("dialog", { name: "mAI prop AI" })).not.toBeInTheDocument();
  });

  it("streams assistant deltas, clears chat, and aborts pending work", async () => {
    mockSupabase.auth.getSession.mockResolvedValueOnce({ data: { session: { access_token: "jwt" } } });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      streamResponse([
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
        'data: {"choices":[{"delta":{"content":" there"}}]}\n',
        "data: [DONE]\n",
      ]),
    );
    renderWithProviders(<AIAssistantWidget variant="embedded" propertyContext={{ title: "Garden home" }} />);

    fireEvent.click(screen.getByText("What schools are near this property?"));

    expect(await screen.findByText("What schools are near this property?")).toBeInTheDocument();
    expect(await screen.findByText("Hello there")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "https://supabase.test/functions/v1/property-chat",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer jwt" }),
      }),
    );

    fireEvent.click(screen.getByTitle("Clear chat"));
    expect(screen.queryByText("Hello there")).not.toBeInTheDocument();
    expect(screen.getByText("Ask me anything")).toBeInTheDocument();
  });

  it("handles stream parsing edge cases and friendly error variants", async () => {
    mockSupabase.auth.getSession
      .mockResolvedValueOnce({ data: { session: { access_token: "jwt" } } })
      .mockResolvedValueOnce({ data: { session: { access_token: "jwt" } } })
      .mockResolvedValueOnce({ data: { session: { access_token: "jwt" } } })
      .mockResolvedValueOnce({ data: { session: { access_token: "jwt" } } })
      .mockResolvedValueOnce({ data: { session: { access_token: "jwt" } } })
      .mockResolvedValueOnce({ data: { session: { access_token: "jwt" } } })
      .mockResolvedValueOnce({ data: { session: { access_token: "jwt" } } })
      .mockResolvedValueOnce({ data: { session: { access_token: "jwt" } } });
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        streamResponse([
          "event: ping\n",
          'data: {"choices":[{"delta":{}}]}\r\n',
          "data: [DONE]\n",
          'data: {"choices":[{"delta":{}}]}\n',
          'data: {"choices":[{"delta":{"content":"Split"}}]}',
        ]),
      )
      .mockResolvedValueOnce(streamResponse(["data: {not-json}\n"]))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockRejectedValueOnce(new Error("quota exceeded"))
      .mockRejectedValueOnce(new Error("Unauthorized"))
      .mockRejectedValueOnce(new DOMException("Cancelled", "AbortError"))
      .mockRejectedValueOnce("plain failure");
    renderWithProviders(<AIAssistantWidget variant="embedded" />);

    fireEvent.change(screen.getByPlaceholderText("Ask a real estate question..."), { target: { value: "Stream test" } });
    fireEvent.click(screen.getByRole("button", { name: "" }));
    expect(await screen.findByText("Split")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Ask a real estate question..."), { target: { value: "Invalid stream" } });
    fireEvent.click(screen.getByRole("button", { name: "" }));
    await waitFor(() => expect(screen.getByPlaceholderText("Ask a real estate question...")).not.toBeDisabled());

    fireEvent.change(screen.getByPlaceholderText("Ask a real estate question..."), { target: { value: "No body" } });
    fireEvent.click(screen.getByRole("button", { name: "" }));
    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Ask a real estate question..."), { target: { value: "No body" } });
    fireEvent.click(screen.getByRole("button", { name: "" }));
    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Ask a real estate question..."), { target: { value: "Quota" } });
    fireEvent.click(screen.getByRole("button", { name: "" }));
    expect(await screen.findByText(/AI usage limit/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Ask a real estate question..."), { target: { value: "Unauthorized" } });
    fireEvent.click(screen.getByRole("button", { name: "" }));
    expect(await screen.findByText(/Please sign in to use the AI assistant/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Ask a real estate question..."), { target: { value: "Abort" } });
    fireEvent.click(screen.getByRole("button", { name: "" }));
    await waitFor(() => expect(screen.getByPlaceholderText("Ask a real estate question...")).not.toBeDisabled());

    fireEvent.change(screen.getByPlaceholderText("Ask a real estate question..."), { target: { value: "Plain" } });
    fireEvent.click(screen.getByRole("button", { name: "" }));
    expect(await screen.findAllByText(/Something went wrong/)).not.toHaveLength(0);
  });

  it("renders null for a closed embedded assistant", () => {
    const { container } = renderWithProviders(<AIAssistantWidget variant="embedded" />);
    fireEvent.click(screen.getByTitle("Minimise"));
    expect(screen.getByRole("dialog", { name: "mAI prop AI" }).className).toContain("h-[52px]");
    fireEvent.click(screen.getByTitle("Close"));
    expect(container).toBeEmptyDOMElement();
  });

  it("maps backend errors to friendly assistant messages", async () => {
    mockSupabase.auth.getSession.mockResolvedValueOnce({ data: { session: { access_token: "jwt" } } });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "OPENAI_API_KEY missing" }), { status: 500 }),
    );
    renderWithProviders(<AIAssistantWidget variant="embedded" />);

    fireEvent.change(screen.getByPlaceholderText("Ask a real estate question..."), { target: { value: "Help me" } });
    fireEvent.keyDown(screen.getByPlaceholderText("Ask a real estate question..."), { key: "Enter" });

    expect(await screen.findByText(/AI assistant is temporarily unavailable/)).toBeInTheDocument();
  });
});

describe("PropertyTypeDropdown", () => {
  it("opens upward when there is not enough room and selects commercial/all options", async () => {
    const onChange = vi.fn();
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 300 });
    renderWithProviders(<PropertyTypeDropdown value="" onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: /Property type/i });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      top: 250,
      bottom: 290,
      left: 20,
      right: 220,
      width: 200,
      height: 40,
      x: 20,
      y: 250,
      toJSON: () => ({}),
    });

    fireEvent.click(trigger);
    expect(screen.getByText("Residence")).toBeInTheDocument();
    fireEvent.click(screen.getByText("All Commercial & Offices"));

    expect(onChange).toHaveBeenCalledWith("commercial");
    expect(screen.queryByText("Residence")).not.toBeInTheDocument();
  });

  it("shows the selected type, selects another option, and closes on outside clicks", async () => {
    const onChange = vi.fn();
    renderWithProviders(<PropertyTypeDropdown value="apartment" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /Apartment/i }));
    fireEvent.click(screen.getByText("House"));
    expect(onChange).toHaveBeenCalledWith("house");

    renderWithProviders(<PropertyTypeDropdown value="commercial" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Commercial/i }));
    expect(screen.getByText("All Types")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 60));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("All Types")).not.toBeInTheDocument();
  });

  it("selects All Types and keeps the menu open for guarded/button/portal clicks", async () => {
    const onChange = vi.fn();
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
    renderWithProviders(<PropertyTypeDropdown value="house" onChange={onChange} />);

    const trigger = screen.getByRole("button", { name: /House/i });
    fireEvent.click(trigger);
    expect(screen.getByText("All Types")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.getByText("All Types")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 60));
    fireEvent.mouseDown(trigger);
    expect(screen.getByText("All Types")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText("Residence"));
    expect(screen.getByText("All Types")).toBeInTheDocument();

    fireEvent.click(screen.getByText("All Types"));
    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.queryByText("All Types")).not.toBeInTheDocument();
  });
});

describe("LocationInput", () => {
  it("shows popular locations when there is no search history and searches the selected option", () => {
    const onChange = vi.fn();
    const onSearch = vi.fn();
    renderWithProviders(<LocationInput value="" onChange={onChange} onSearch={onSearch} />);

    fireEvent.focus(screen.getByLabelText("Location search"));
    expect(screen.getByText("Popular Locations")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Thessaloniki"));
    expect(onChange).toHaveBeenCalledWith("Thessaloniki");
    expect(onSearch).toHaveBeenCalledWith("Thessaloniki");
  });

  it("shows recent searches, selects one, removes one, and searches on Enter", () => {
    localStorage.setItem("maiprop_recent_searches", JSON.stringify(["Athens", "Chania"]));
    const onChange = vi.fn();
    const onSearch = vi.fn();
    renderWithProviders(<LocationInput value="" onChange={onChange} onSearch={onSearch} />);

    fireEvent.focus(screen.getByLabelText("Location search"));
    expect(screen.getByText("Recent Searches")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Athens"));
    expect(onChange).toHaveBeenCalledWith("Athens");
    expect(onSearch).toHaveBeenCalledWith("Athens");
    expect(onSearch).toHaveBeenCalledTimes(1);

    fireEvent.focus(screen.getByLabelText("Location search"));
    const chaniaRow = screen.getByText("Chania").closest("div")!;
    fireEvent.click(within(chaniaRow).getByRole("button"));
    expect(screen.queryByText("Chania")).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByLabelText("Location search"), { key: "Enter" });
    expect(onSearch).toHaveBeenCalledTimes(2);
  });

  it("clears typed values, hides recents with Escape/outside click, and opts out of mobile browser autocomplete chrome", () => {
    localStorage.setItem("maiprop_recent_searches", JSON.stringify(["Athens"]));
    const onChange = vi.fn();

    function ControlledLocationInput() {
      const [value, setValue] = React.useState("Patras");
      return (
        <LocationInput
          value={value}
          onChange={(nextValue) => {
            setValue(nextValue);
            onChange(nextValue);
          }}
          onSearch={vi.fn()}
        />
      );
    }

    renderWithProviders(<ControlledLocationInput />);

    const input = screen.getByLabelText("Location search");
    expect(input).toHaveAttribute("role", "combobox");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveAttribute("autocomplete", "new-password");
    expect(input).toHaveAttribute("autocorrect", "off");
    expect(input).toHaveAttribute("autocapitalize", "none");
    expect(input).toHaveAttribute("spellcheck", "false");
    expect(input).toHaveAttribute("enterkeyhint", "search");

    fireEvent.click(screen.getByRole("button", { name: "Clear location" }));
    expect(onChange).toHaveBeenCalledWith("");
    expect(input).toHaveValue("");

    fireEvent.focus(input);
    expect(screen.getByText("Recent Searches")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Recent Searches")).not.toBeInTheDocument();
  });

  it("does not inject a native Google Places dropdown for the homepage field", () => {
    renderWithProviders(<LocationInput value="" onChange={vi.fn()} onSearch={vi.fn()} />);

    expect(document.head.querySelector('script[src*="maps.googleapis.com"]')).toBeNull();
    fireEvent.focus(screen.getByLabelText("Location search"));
    expect(document.head.querySelector('script[src*="maps.googleapis.com"]')).toBeNull();
  });

  it("keeps recents open for guarded input and portal clicks", () => {
    localStorage.setItem("maiprop_recent_searches", JSON.stringify(["Athens"]));
    const onChange = vi.fn();
    renderWithProviders(<LocationInput value="" onChange={onChange} onSearch={vi.fn()} />);

    fireEvent.focus(screen.getByLabelText("Location search"));
    expect(screen.getByText("Recent Searches")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByLabelText("Location search"));
    expect(screen.getByText("Recent Searches")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText("Athens"));
    expect(screen.getByText("Recent Searches")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Athens"));
    expect(onChange).toHaveBeenCalledWith("Athens");
  });

  it("keeps repeated focus stable without injecting Google scripts", () => {
    renderWithProviders(<LocationInput value="" onChange={vi.fn()} onSearch={vi.fn()} />);

    expect(document.head.querySelector('script[src*="maps.googleapis.com"]')).toBeNull();
    fireEvent.focus(screen.getByLabelText("Location search"));
    fireEvent.blur(screen.getByLabelText("Location search"));
    fireEvent.focus(screen.getByLabelText("Location search"));

    expect(document.head.querySelector('script[src*="maps.googleapis.com"]')).toBeNull();
    expect(screen.getByLabelText("Location search")).toBeInTheDocument();
  });
});
