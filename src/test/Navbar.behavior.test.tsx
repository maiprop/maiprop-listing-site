import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

const navigateMock = vi.fn();
const signOutMock = vi.fn().mockResolvedValue(undefined);
const setThemeMock = vi.fn();
let authState: {
  user: { id: string; email?: string } | null;
  profile: Record<string, unknown> | null;
};
let subscriptionState: { isPro: boolean; loading: boolean } = { isPro: false, loading: false };
let eligibleState = { eligible: false };
let themeState = { theme: "dark", resolvedTheme: "dark" };

let notifications: Array<{
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  created_at: string;
  link?: string | null;
}> = [
  {
    id: "n1",
    title: "New viewing",
    body: "A buyer booked a slot",
    type: "viewing",
    read: false,
    created_at: new Date(Date.now() - 60_000).toISOString(),
    link: "/dashboard?tab=viewings",
  },
];

const makeQuery = () => {
  const chain = {
    result: { data: notifications, error: null } as unknown,
    select: vi.fn((_columns?: string, options?: { count?: string; head?: boolean }) => {
      if (options?.head) chain.result = { count: notifications.length, data: null, error: null };
      return chain;
    }),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(chain.result).then(resolve),
  };
  return chain;
};

const fromMock = vi.fn((table: string) => {
  if (table === "notifications") {
    return makeQuery();
  }
  return makeQuery();
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: fromMock },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ ...authState, signOut: signOutMock, loading: false }),
}));

vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => subscriptionState,
}));

vi.mock("@/hooks/useEligibleForQuickSale", () => ({
  useEligibleForQuickSale: () => eligibleState,
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ ...themeState, setTheme: setThemeMock }),
}));

vi.mock("@/components/LanguageSwitcher", () => ({
  LanguageSwitcher: () => <div data-testid="language-switcher" />,
}));

vi.mock("@/lib/format", () => ({
  formatTimeAgo: () => "1m ago",
}));

describe("Navbar behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState = { user: null, profile: null };
    subscriptionState = { isPro: false, loading: false };
    eligibleState = { eligible: false };
    themeState = { theme: "dark", resolvedTheme: "dark" };
    notifications = [
      {
        id: "n1",
        title: "New viewing",
        body: "A buyer booked a slot",
        type: "viewing",
        read: false,
        created_at: new Date(Date.now() - 60_000).toISOString(),
        link: "/dashboard?tab=viewings",
      },
    ];
  });

  it("renders guest desktop and mobile auth actions", async () => {
    const { Navbar } = await import("@/components/Navbar");

    renderWithProviders(<Navbar forceScrolled />);

    expect(screen.getByRole("link", { name: "nav.signIn" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "common.getStarted" })).toHaveAttribute("href", "/signup");

    fireEvent.click(screen.getByRole("button", { name: "common.openMenu" }));

    expect(screen.getAllByRole("link", { name: "nav.signIn" }).length).toBeGreaterThan(1);
    expect(screen.getByRole("link", { name: "nav.signUp" })).toHaveAttribute("href", "/signup");
    fireEvent.click(screen.getByRole("button", { name: "common.lightMode" }));
    expect(setThemeMock).toHaveBeenCalledWith("light");
  });

  it("shows sell-side actions, pro badge, and investor quick sale menu item for authenticated users", async () => {
    authState = {
      user: { id: "u1", email: "seller@example.com" },
      profile: { id: "u1", role: "seller", display_name: "Seller User", investor_mode: true },
    };
    subscriptionState = { isPro: true, loading: false };
    eligibleState = { eligible: true };
    const { Navbar } = await import("@/components/Navbar");

    renderWithProviders(<Navbar forceScrolled />, { initialPath: "/dashboard/listings" });

    expect(screen.getByRole("link", { name: "nav.quickSale" })).toHaveAttribute("href", "/firesale");

    fireEvent.pointerDown(screen.getByText("Seller User"), { button: 0, ctrlKey: false });

    expect(await screen.findByText("Selling / Renting Out")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /common.proActive/i })).toHaveAttribute("href", "/pricing");
    expect(screen.getByRole("menuitem", { name: /dashboard.myListings/i })).toHaveAttribute("href", "/dashboard/listings");
    expect(screen.getByRole("menuitem", { name: /nav.quickSale/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "common.proActive" })).toHaveAttribute("href", "/pricing");
  });

  it("does not label unresolved entitlement as Free or Pro", async () => {
    authState = {
      user: { id: "u-loading", email: "loading@example.com" },
      profile: { id: "u-loading", role: "seller", display_name: "Loading User" },
    };
    subscriptionState = { isPro: false, loading: true };
    const { Navbar } = await import("@/components/Navbar");

    renderWithProviders(<Navbar forceScrolled />);

    expect(screen.queryByRole("link", { name: "common.upgrade" })).not.toBeInTheDocument();
    fireEvent.pointerDown(screen.getByText("Loading User"), { button: 0, ctrlKey: false });
    expect(await screen.findByRole("link", { name: "dashboard.billing" })).toHaveAttribute("href", "/pricing");
    expect(screen.queryByText("common.upgrade")).not.toBeInTheDocument();
    expect(screen.queryByText("common.proActive")).not.toBeInTheDocument();
  });

  it("marks notifications read with a user ownership filter", async () => {
    authState = {
      user: { id: "u-notif", email: "agent@example.com" },
      profile: { id: "u-notif", role: "agent", display_name: "Agent User" },
    };
    const { Navbar } = await import("@/components/Navbar");

    renderWithProviders(<Navbar forceScrolled />);

    fireEvent.pointerDown(await screen.findByTitle("notificationsPanel.title"), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByText("New viewing"));

    await waitFor(() => {
      expect(fromMock).toHaveBeenCalledWith("notifications");
    });
    const updateChain = fromMock.mock.results
      .map((result) => result.value)
      .find((chain) => chain.update.mock.calls.length > 0);
    expect(updateChain.update).toHaveBeenCalledWith({ read: true });
    expect(updateChain.eq).toHaveBeenCalledWith("id", "n1");
    expect(updateChain.eq).toHaveBeenCalledWith("user_id", "u-notif");
    expect(navigateMock).toHaveBeenCalledWith("/dashboard?tab=viewings");
  });

  it("renders notification variants and marks all unread rows read", async () => {
    notifications = [
      { id: "q", title: "Quick sale", body: "", type: "quick_sale", read: false, created_at: "" },
      { id: "a", title: "Auction alert", body: "Bid moved", type: "auction", read: false, created_at: "" },
      { id: "o", title: "Open house", body: "Visitor registered", type: "open_house", read: false, created_at: "" },
      { id: "m", title: "Message", body: "New reply", type: "message", read: true, created_at: "" },
      { id: "x", title: "Fallback", body: "", type: "other", read: false, created_at: "" },
    ];
    authState = {
      user: { id: "u-mark-all", email: "agent@example.com" },
      profile: { id: "u-mark-all", role: "agent", display_name: "Agent User" },
    };
    const { Navbar } = await import("@/components/Navbar");

    renderWithProviders(<Navbar forceScrolled />);

    fireEvent.pointerDown(await screen.findByTitle("notificationsPanel.title"), { button: 0, ctrlKey: false });
    expect(await screen.findByText("Quick sale")).toBeInTheDocument();
    expect(screen.getByText("Auction alert")).toBeInTheDocument();
    expect(screen.getByText("Open house")).toBeInTheDocument();
    expect(screen.getByText("Message")).toBeInTheDocument();
    expect(screen.getByText("Fallback")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /notificationsPanel.markAllRead/i }));

    const updateChain = fromMock.mock.results
      .map((result) => result.value)
      .find((chain) => chain.update.mock.calls.some((call: unknown[]) => JSON.stringify(call[0]) === JSON.stringify({ read: true })));
    expect(updateChain.update).toHaveBeenCalledWith({ read: true });
    expect(updateChain.eq).toHaveBeenCalledWith("user_id", "u-mark-all");
    expect(updateChain.eq).toHaveBeenCalledWith("read", false);
  });

  it("caps large unread notification counts and renders the empty notification state", async () => {
    notifications = Array.from({ length: 120 }, (_, index) => ({
      id: `n-${index}`,
      title: `Bulk ${index}`,
      body: "",
      type: index % 2 === 0 ? "firesale" : "auction_alert",
      read: false,
      created_at: "",
    }));
    authState = {
      user: { id: "u-many", email: "agent@example.com" },
      profile: { id: "u-many", role: "agent", display_name: "Agent User" },
    };
    const { Navbar } = await import("@/components/Navbar");

    const { unmount } = renderWithProviders(<Navbar forceScrolled />);

    expect(await screen.findByText("99+")).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByTitle("notificationsPanel.title"), { button: 0, ctrlKey: false });
    expect(await screen.findByText("Bulk 0")).toBeInTheDocument();

    unmount();
    notifications = [];
    renderWithProviders(<Navbar forceScrolled />);
    fireEvent.pointerDown(await screen.findByTitle("notificationsPanel.title"), { button: 0, ctrlKey: false });
    expect(await screen.findByText("notificationsPanel.empty")).toBeInTheDocument();
  });

  it("uses dark-hero styling and admin menu on the home route", async () => {
    authState = {
      user: { id: "admin-1", email: "admin@example.com" },
      profile: {
        id: "admin-1",
        role: "admin",
        display_name: "Admin User",
        avatar_url: "https://example.test/avatar.jpg",
      },
    };
    themeState = { theme: "light", resolvedTheme: "light" };
    const { Navbar } = await import("@/components/Navbar");

    renderWithProviders(<Navbar />, { initialPath: "/" });

    expect(screen.getByRole("link", { name: "mAI prop" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "common.upgrade" })).toHaveAttribute("href", "/pricing");
    const avatar = screen.getByAltText("Admin User profile photo") as HTMLImageElement;
    fireEvent.error(avatar);
    expect(avatar.style.display).toBe("none");

    fireEvent.pointerDown(screen.getByText("Admin User"), { button: 0, ctrlKey: false });
    expect(await screen.findByText("common.admin")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /dashboard.myListings/i })).toHaveAttribute("href", "/dashboard/listings");
    expect(screen.getByRole("menuitem", { name: /nav.messages/i })).toHaveAttribute("href", "/messages");
    expect(screen.getByRole("menuitem", { name: /nav.adminDashboard/i })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("menu", { name: "Admin User" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu", { name: "Admin User" })).not.toBeInTheDocument());

    expect(screen.queryByRole("button", { name: /common.listProperty/i })).not.toBeInTheDocument();
  });

  it("signs out from the mobile menu and returns home", async () => {
    authState = {
      user: { id: "u2", email: "buyer@example.com" },
      profile: { id: "u2", role: "buyer", display_name: "Buyer User" },
    };
    const { Navbar } = await import("@/components/Navbar");

    renderWithProviders(<Navbar forceScrolled />);

    fireEvent.click(screen.getByRole("button", { name: "common.openMenu" }));
    fireEvent.click(screen.getByRole("button", { name: "nav.signOut" }));

    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
    expect(navigateMock).toHaveBeenCalledWith("/");
  });
});
