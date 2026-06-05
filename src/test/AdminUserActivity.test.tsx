import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mocks.rpc(...args),
  },
}));

import AdminUserActivity from "@/components/AdminUserActivity";

const snapshot = {
  generated_at: "2026-06-04T12:00:00Z",
  days: 30,
  summary: {
    total_users: 42,
    confirmed_users: 40,
    signups_in_range: 6,
    signups_7d: 2,
    active_users_in_range: 18,
    active_users_7d: 9,
    sessions_in_range: 105,
    sessions_24h: 12,
    searches_in_range: 31,
    searches_7d: 8,
    unique_searchers_in_range: 11,
    auth_audit_events_in_range: 0,
    auth_audit_logs_available: false,
    auth_activity_events_in_range: 14,
    auth_activity_events_24h: 5,
    sign_in_events_in_range: 8,
    sign_out_events_in_range: 2,
    app_auth_events_available: true,
  },
  users: [
    {
      user_id: "user-1",
      email: "buyer@example.com",
      display_name: "Buyer One",
      first_name: "Buyer",
      last_name: "One",
      role: "buyer",
      created_at: "2026-05-01T10:00:00Z",
      confirmed_at: "2026-05-01T10:05:00Z",
      last_sign_in_at: "2026-06-04T09:00:00Z",
      last_session_at: "2026-06-04T09:20:00Z",
      session_count: 4,
      sessions_24h: 1,
      auth_event_count: 5,
      auth_events_24h: 2,
      last_auth_event_at: "2026-06-04T09:25:00Z",
      last_auth_event_type: "sign_in",
      search_count: 3,
      last_search_at: "2026-06-04T09:10:00Z",
      last_search_query: "kolonaki apartment",
      last_activity_at: "2026-06-04T09:20:00Z",
      banned_until: null,
    },
    {
      user_id: "user-2",
      email: "seller@example.com",
      display_name: "Seller Two",
      first_name: "Seller",
      last_name: "Two",
      role: "seller",
      created_at: "2026-05-02T10:00:00Z",
      confirmed_at: null,
      last_sign_in_at: null,
      last_session_at: null,
      session_count: 0,
      sessions_24h: 0,
      auth_event_count: 0,
      auth_events_24h: 0,
      last_auth_event_at: null,
      last_auth_event_type: null,
      search_count: 0,
      last_search_at: null,
      last_search_query: null,
      last_activity_at: "2026-05-02T10:00:00Z",
      banned_until: null,
    },
  ],
  recent_searches: [
    {
      id: "search-1",
      created_at: "2026-06-04T09:10:00Z",
      surface: "listings",
      query_text: "kolonaki apartment",
      normalized_query: "kolonaki apartment",
      route: "/listings?city=Kolonaki",
      result_count: 7,
      filters: { city: "Kolonaki" },
      metadata: { viewMode: "grid" },
      user_id: "user-1",
      email: "buyer@example.com",
      display_name: "Buyer One",
      role: "buyer",
    },
  ],
  recent_auth_events: [
    {
      id: "auth-event-1",
      created_at: "2026-06-04T09:25:00Z",
      event_type: "sign_in",
      route: "/dashboard",
      user_agent: "Vitest",
      metadata: { source: "on_auth_state_change" },
      user_id: "user-1",
      email: "buyer@example.com",
      display_name: "Buyer One",
      role: "buyer",
    },
  ],
  auth_events_by_type: [
    { event_type: "sign_in", event_count: 8, user_count: 4, last_seen_at: "2026-06-04T09:25:00Z" },
    { event_type: "sign_out", event_count: 2, user_count: 2, last_seen_at: "2026-06-04T08:25:00Z" },
  ],
  top_keywords: [
    { keyword: "athens", search_count: 9, user_count: 5, last_seen_at: "2026-06-04T09:10:00Z" },
    { keyword: "kolonaki", search_count: 4, user_count: 2, last_seen_at: "2026-06-04T09:10:00Z" },
  ],
  daily: [
    { date: "2026-06-03", signups: 1, logins: 3, sessions: 5, auth_events: 3, searches: 4 },
    { date: "2026-06-04", signups: 2, logins: 6, sessions: 12, auth_events: 5, searches: 8 },
  ],
  audit_actions: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: snapshot, error: null });
});

describe("AdminUserActivity", () => {
  it("renders user, session, search, and keyword analytics from the admin snapshot RPC", async () => {
    renderWithProviders(<AdminUserActivity />);

    expect(await screen.findByText("User Activity")).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("admin_user_activity_snapshot", {
      p_days: 30,
      p_limit: 100,
    });
    expect(await screen.findByText("40 confirmed accounts")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("5 in the last 24h")).toBeInTheDocument();
    expect(screen.getAllByText("Buyer One").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("buyer@example.com")).toBeInTheDocument();
    expect(screen.getByText(/Last search:/)).toBeInTheDocument();
    expect(screen.getAllByText("kolonaki apartment").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Auth audit logs are not currently stored/i)).not.toBeInTheDocument();
    expect(screen.getByText("Recent Auth Events")).toBeInTheDocument();
    expect(screen.getAllByText("sign in").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("/dashboard")).toBeInTheDocument();
    expect(screen.getByText("athens")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("filters users locally and reloads the RPC when the range changes", async () => {
    renderWithProviders(<AdminUserActivity />);
    expect((await screen.findAllByText("Buyer One")).length).toBeGreaterThanOrEqual(2);

    fireEvent.change(screen.getByPlaceholderText(/search users/i), { target: { value: "seller" } });

    expect(screen.getByText("Seller Two")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "7 days" }));

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("admin_user_activity_snapshot", {
        p_days: 7,
        p_limit: 100,
      }),
    );
  });

  it("surfaces auth and search activity for maiprop demo mock users", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        ...snapshot,
        summary: {
          ...snapshot.summary,
          auth_activity_events_in_range: 2,
          searches_in_range: 1,
          unique_searchers_in_range: 1,
        },
        users: [
          {
            ...snapshot.users[0],
            user_id: "buyer-free-demo",
            email: "buyer.free@maiprop.demo",
            display_name: "Buyer Free Demo",
            last_auth_event_type: "session_restored",
            auth_event_count: 2,
            search_count: 1,
            last_search_query: "Athens apartment",
          },
          {
            ...snapshot.users[1],
            user_id: "agent-pro-demo",
            email: "agent.pro@maiprop.demo",
            display_name: "Agent Pro Demo",
            role: "agent",
          },
        ],
        recent_auth_events: [
          {
            ...snapshot.recent_auth_events[0],
            id: "auth-demo-1",
            event_type: "session_restored",
            user_id: "buyer-free-demo",
            email: "buyer.free@maiprop.demo",
            display_name: "Buyer Free Demo",
            role: "buyer",
          },
        ],
        recent_searches: [
          {
            ...snapshot.recent_searches[0],
            id: "search-demo-1",
            query_text: "Athens apartment",
            normalized_query: "athens apartment",
            user_id: "buyer-free-demo",
            email: "buyer.free@maiprop.demo",
            display_name: "Buyer Free Demo",
            role: "buyer",
          },
        ],
        auth_events_by_type: [
          { event_type: "session_restored", event_count: 2, user_count: 1, last_seen_at: "2026-06-04T09:25:00Z" },
        ],
        top_keywords: [
          { keyword: "athens", search_count: 1, user_count: 1, last_seen_at: "2026-06-04T09:10:00Z" },
        ],
      },
      error: null,
    });

    renderWithProviders(<AdminUserActivity />);

    expect((await screen.findAllByText("Buyer Free Demo")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("buyer.free@maiprop.demo")).toBeInTheDocument();
    expect(screen.getByText("agent.pro@maiprop.demo")).toBeInTheDocument();
    expect(screen.getAllByText("session restored").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Athens apartment").length).toBeGreaterThanOrEqual(1);
  });
});
